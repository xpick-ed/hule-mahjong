// 一場（東風圈）的流程：換莊、連莊、算錢、絕招、推動電腦出牌。
// 每個動作拿舊的 MatchState、回傳新的一份；不合法丟 RuleError。

import { chooseClaim, chooseDiscard, chooseSelf, type AiStyle } from './ai'
import { shanten, toCounts } from './analysis'
import { CHARACTERS } from './characters'
import { hashSeed, pick, rand, randInt, shuffle, type HasRng } from './rng'
import { dealerItems, type TaiItem } from './scoring'
import { STAGES } from './stages'
import * as T from './table'
import type { Kind } from './tiles'

export { RuleError } from './table'

export type SkillId = 'swap' | 'peek' | 'lucky'

export const SKILLS: Record<SkillId, { name: string; desc: string; uses: number }> = {
  swap: { name: '換牌', desc: '選一張手牌，換成牌山裡隨機一張', uses: 2 },
  peek: { name: '偷看', desc: '看一家的手牌，看到你下次打牌為止', uses: 1 },
  lucky: { name: '好運', desc: '下一次摸牌，摸到最有用的那張', uses: 1 },
}

export interface Payment {
  seat: number
  amount: number
  tai: number
  /** 一炮多響時：付給誰 */
  to?: number
}

export interface HandResult {
  /** 關卡特別規則帶來的額外東西：過年紅包、尾牙摸彩 */
  extras?: { label: string; coins?: number }[]
  win: T.WinInfo | null
  /** 一炮多響：其他也胡的人 */
  also?: T.WinInfo[]
  /** 莊家有關時才有（莊家胡、或莊家付錢） */
  dealerItems: TaiItem[] | null
  payments: Payment[]
  deltas: number[]
  dealer: number
  streak: number
}

export interface MatchState {
  version: 2
  seed: string
  rng: number
  stage: number
  /** 座位 → 角色 id；座位 0 是你（'me'） */
  chars: string[]
  points: number[]
  base: number
  perTai: number
  dealer: number
  /** 連莊次數 */
  streak: number
  /** 換過幾次莊；換滿 4 次（兩圈的關卡是 8 次）結束；第 5–8 次是南風圈 */
  passes: number
  handNo: number
  hand: T.HandState
  phase: 'play' | 'handEnd' | 'end'
  result: HandResult | null
  history: { winner: number | null; from: number | null; tai: number; hand?: number; items?: string[] }[]
  skills: Record<SkillId, number>
  /** 偷看中的座位 */
  peek: number | null
  /** 對手絕招剩幾次（座位 → 次數） */
  aiSkills?: Record<number, number>
  /** 牌桌規則（開打時決定，這一場都不變） */
  rules?: T.Rules
  difficulty?: Difficulty
  /** 每日挑戰：日期（同一天大家的牌都一樣） */
  daily?: string
  /** 引導局：第一次玩 */
  tutorial?: boolean
  /** 電腦走了幾步（重播用：你的每個動作記在第幾步之後） */
  ticks?: number
  /** 每日挑戰：你的動作紀錄，同一個種子可以完整重播 */
  log?: Act[]
  /** 哪些座位是真人（連線對打）；沒有這欄就是只有座位 0 是你 */
  humans?: boolean[]
  /** 連線對打：沒有絕招、電腦也不用絕招 */
  online?: boolean
  /** 連線對打時每個座位是誰（只有給畫面看的那份有） */
  players?: SeatPlayer[]
  /** 生存模式：這是第幾關（從 0 算，已經撐過幾關）、帶進來的本錢倍數 */
  survival?: Survival
}

export interface Survival {
  level: number
  ratio: number
}

/** 生存模式第 level 關打哪一關、第幾輪（一輪六關，第二輪起高手難度） */
export const survivalStage = (level: number, stageCount: number) => ({ stage: level % stageCount, loop: Math.floor(level / stageCount) + 1 })

export interface SeatPlayer {
  name: string
  human: boolean
  /** 真人報牌用的聲音 */
  voice?: 'f' | 'm'
  connected?: boolean
}

/** 你的一步（不含步數）：打牌、吃碰胡過、自摸、槓 */
export type Move = [kind: 'd', tileId: number] | [kind: 'c', decision: T.ClaimDecision] | [kind: 't'] | [kind: 'k', tile: Kind]

/** 你的一個動作：[電腦走到第幾步, 種類, 參數] */
export type Act =
  | [number, 'd', number]
  | [number, 'c', T.ClaimDecision]
  | [number, 't']
  | [number, 'k', Kind]
  | [number, 's', SkillId, number?]
  | [number, 'n']

export type Difficulty = 'easy' | 'normal' | 'hard'

export const DIFFICULTY: Record<Difficulty, { name: string; desc: string; coins: number }> = {
  easy: { name: '輕鬆', desc: '對手常打錯、不太防守、不用絕招', coins: 0.6 },
  normal: { name: '普通', desc: '照角色個性打', coins: 1 },
  hard: { name: '高手', desc: '對手很少失誤、防守更緊、絕招更常用', coins: 1.5 },
}

export interface MatchOptions {
  rules?: T.Rules
  difficulty?: Difficulty
  daily?: string
  tutorial?: boolean
  /** 連線對打：哪些座位是真人 */
  humans?: boolean[]
  /** 生存模式：你的起始分數 = 這一關的起始分數 × ratio */
  survival?: Survival
}

const SOLO = [true, false, false, false]

/** 這個座位是不是真人 */
export const isHuman = (m: MatchState, seat: number) => (m.humans ?? SOLO)[seat]

const fail = (msg: string): never => {
  throw new T.RuleError(msg)
}

function edit(m: MatchState, fn: (r: MatchState) => void): MatchState {
  const r = structuredClone(m)
  fn(r)
  if (r.phase === 'play' && r.hand.phase === 'over') settle(r)
  return r
}

export function styleOf(m: MatchState, seat: number): AiStyle {
  const st = CHARACTERS[m.chars[seat]].style
  if (m.difficulty === 'easy') return { speed: st.speed, defense: st.defense * 0.35, greed: st.greed * 0.6, mistakes: Math.min(1, st.mistakes + 0.6) }
  if (m.difficulty === 'hard') return { ...st, defense: Math.min(1, st.defense + 0.25), mistakes: st.mistakes * 0.25 }
  return st
}

export const rulesOf = (m: MatchState): T.Rules => m.rules ?? T.DEFAULT_RULES

/** 這一關打幾圈（東風圈 1；颱風夜打東風、南風 2 圈） */
export const roundsOf = (m: MatchState) => STAGES[m.stage]?.rounds ?? 1
/** 現在是哪一圈：0 東風圈、1 南風圈 */
export const roundWindOf = (m: MatchState) => Math.min(3, Math.floor(m.passes / 4))
/** 這一局打完如果換莊，整場就結束了 */
export const lastRound = (m: MatchState) => m.passes >= 4 * roundsOf(m) - 1

/**
 * 電腦下一步前要等多久（毫秒，一般速度）。r 是 0–1 的亂數：每次想的時間不一樣。
 * 摸牌後打牌約 1.3 秒、吃碰後打牌約 1.1 秒、有人打牌後看誰要吃碰約 0.65 秒，再乘上角色的節奏
 */
export function aiDelay(m: MatchState, r: number): number {
  const h = m.hand
  const jitter = 0.75 + r * 0.6
  if (h.phase === 'claim') return Math.round(650 * jitter)
  const tempo = CHARACTERS[m.chars[h.turn]]?.tempo ?? 1
  return Math.round((h.drawn ? 1300 : 1100) * tempo * jitter)
}

/** 這一局所有胡的人（一炮多響時不只一個） */
export function winsOf(r: { win: T.WinInfo | null; also?: T.WinInfo[] } | null | undefined): T.WinInfo[] {
  return r?.win ? [r.win, ...(r.also ?? [])] : []
}

/** 剛有人打牌：電腦馬上決定要不要吃碰胡（真人的決定等他們按） */
function autoDecide(m: MatchState) {
  const h = m.hand
  if (h.phase !== 'claim') return
  for (let s = 0; s < 4; s++) {
    if (isHuman(m, s)) continue
    const o = h.options[s]
    if (o && !h.decisions[s]) T.decide(h, s, chooseClaim(h, s, o, styleOf(m, s), m))
  }
}

export function newMatch(seed: string, stageIndex: number, opt: MatchOptions = {}): MatchState {
  const stage = STAGES[stageIndex]
  const m = {
    version: 2,
    seed,
    rng: hashSeed(seed),
    stage: stageIndex,
    chars: ['me'],
    points: [0, 1, 2, 3].map(() => stage.startPoints),
    base: stage.base,
    perTai: stage.perTai,
    dealer: 0,
    streak: 0,
    passes: 0,
    handNo: 1,
    phase: 'play',
    result: null,
    history: [],
    skills: { swap: SKILLS.swap.uses, peek: SKILLS.peek.uses, lucky: SKILLS.lucky.uses },
    peek: null,
    rules: opt.rules ?? T.DEFAULT_RULES,
    difficulty: opt.difficulty ?? 'normal',
    ...(opt.daily ? { daily: opt.daily } : {}),
    ...(opt.tutorial ? { tutorial: true } : {}),
    ...(opt.survival ? { survival: { ...opt.survival } } : {}),
  } as unknown as MatchState
  if (opt.survival) m.points[0] = Math.max(100, Math.round((stage.startPoints * opt.survival.ratio) / 100) * 100)
  const opponents = shuffle(m, [...stage.opponents])
  m.chars = ['me', ...opponents]
  if (opt.humans) {
    // 連線對打：真人座位記 'me'，其他座位依序坐電腦；沒有絕招
    let k = 0
    m.chars = opt.humans.map((h) => (h ? 'me' : opponents[k++]))
    m.humans = [...opt.humans]
    m.online = true
    m.skills = { swap: 0, peek: 0, lucky: 0 }
  }
  m.dealer = randInt(m, 4)
  m.hand = T.newHand(m, m.dealer, 0, rulesOf(m))
  // 引導局：發一手好上手的牌（差兩步就聽牌，一般起手大多差四步）
  if (opt.tutorial) {
    const sh = (h: T.HandState) => (h.phase === 'over' ? 99 : shanten(toCounts(h.seats[0].hand), 5))
    let best = m.hand
    for (let k = 0; k < 150 && sh(best) > 2; k++) {
      const h = T.newHand(m, m.dealer, 0, rulesOf(m))
      if (sh(h) < sh(best)) best = h
    }
    m.hand = best
  }
  if (m.hand.phase === 'over') settle(m)
  return m
}

// ---------- 真人的動作 ----------

/** 座位 seat 的真人做一步；連線時每個人都用這個，單機的你是座位 0 */
export function act(m: MatchState, seat: number, mv: Move): MatchState {
  return edit(m, (r) => {
    if (r.phase !== 'play') fail('這一局已經結束了')
    if (!isHuman(r, seat)) fail('這不是你的位子')
    const h = r.hand
    if (mv[0] === 'd') {
      T.discardTile(h, seat, mv[1])
      if (seat === 0) r.peek = null
      autoDecide(r)
    } else if (mv[0] === 't') T.tsumo(h, seat)
    else if (mv[0] === 'k') {
      T.selfKong(h, seat, mv[1])
      // 加槓可能被搶槓：電腦馬上決定要不要胡
      autoDecide(r)
    } else {
      T.decide(h, seat, mv[1])
      if (T.allDecided(h)) T.resolveClaims(h)
    }
  })
}

export const discard = (m: MatchState, tileId: number) => act(m, 0, ['d', tileId])
export const tsumo = (m: MatchState) => act(m, 0, ['t'])
export const kong = (m: MatchState, kind: Kind) => act(m, 0, ['k', kind])
export const claim = (m: MatchState, d: T.ClaimDecision) => act(m, 0, ['c', d])

/** 時間到或斷線：替這個真人做一步（能胡就胡，不然照電腦的建議打） */
export function autoMove(m: MatchState, seat: number, rng: HasRng): Move | null {
  if (!waitingFor(m, seat)) return null
  const h = m.hand
  if (h.phase === 'claim') return ['c', h.options[seat]!.hu ? { type: 'hu' } : { type: 'pass' }]
  if (T.canTsumo(h, seat)) return ['t']
  return ['d', chooseDiscard(h, seat, { speed: 0.5, defense: 0.5, greed: 0.2, mistakes: 0 }, rng).id]
}

export function useSkill(m: MatchState, id: SkillId, arg?: number): MatchState {
  return edit(m, (r) => {
    if (r.phase !== 'play') fail('現在不能用')
    if ((r.skills[id] ?? 0) <= 0) fail('這一場用完了')
    if (id === 'swap') {
      if (arg === undefined) fail('先選一張手牌')
      T.swapTile(r.hand, r, 0, arg!)
    } else if (id === 'peek') {
      if (arg === undefined || arg < 1 || arg > 3) fail('選一家來偷看')
      r.peek = arg!
    } else {
      if (r.hand.luckySeat === 0) fail('已經在用了')
      r.hand.luckySeat = 0
    }
    r.skills[id]--
  })
}

// ---------- 推動流程 ----------

/** 現在是不是在等這個座位（打牌，或決定要不要吃碰胡） */
export function waitingFor(m: MatchState, seat: number): boolean {
  if (m.phase !== 'play') return false
  const h = m.hand
  if (h.phase === 'discard') return h.turn === seat
  if (h.phase === 'claim') return !!h.options[seat] && !h.decisions[seat]
  return false
}

/** 現在是不是在等你（座位 0） */
export const waitingForYou = (m: MatchState) => waitingFor(m, 0)

/** 還沒動作的真人座位 */
export function humansPending(m: MatchState): number[] {
  return [0, 1, 2, 3].filter((s) => isHuman(m, s) && waitingFor(m, s))
}

/** 做一個「不用等真人」的動作：電腦出牌／吃碰結算。沒事可做就回傳原本那份 */
export function step(m: MatchState): MatchState {
  if (m.phase !== 'play' || humansPending(m).length) return m
  const h = m.hand
  if (h.phase === 'claim') {
    return edit(m, (r) => {
      r.ticks = (r.ticks ?? 0) + 1
      autoDecide(r)
      T.resolveClaims(r.hand)
    })
  }
  if (h.phase === 'discard' && !isHuman(m, h.turn)) {
    return edit(m, (r) => {
      r.ticks = (r.ticks ?? 0) + 1
      const seat = r.hand.turn
      aiSkill(r, seat)
      const act = chooseSelf(r.hand, seat, styleOf(r, seat), r)
      if (act.type === 'tsumo') T.tsumo(r.hand, seat)
      else if (act.type === 'kong') {
        T.selfKong(r.hand, seat, act.kind)
        autoDecide(r)
      } else {
        T.discardTile(r.hand, seat, act.tileId)
        autoDecide(r)
      }
    })
  }
  return m
}

/** 會用絕招的對手，在合適的時機用一下（每場有次數） */
function aiSkill(m: MatchState, seat: number) {
  const sk = CHARACTERS[m.chars[seat]].skill
  if (!sk || m.difficulty === 'easy' || m.tutorial || m.online) return
  m.aiSkills ??= {}
  const left = m.aiSkills[seat] ?? sk.uses
  if (left <= 0 || rand(m) > (m.difficulty === 'hard' ? 0.5 : 0.35)) return
  const h = m.hand
  const live = h.wall.length - T.RESERVE
  const sh = shanten(toCounts(h.seats[seat].hand), T.need(h, seat))
  let target: number | undefined
  if (sk.id === 'lucky') {
    if (sh > 1 || live > 45 || h.luckySeat === seat) return
    h.luckySeat = seat
  } else if (sk.id === 'swap') {
    if (sh < 2 || live < 25) return
    T.swapTile(h, m, seat, chooseDiscard(h, seat, styleOf(m, seat), m).id)
  } else {
    if (h.peekedBy?.[seat] || (h.seats[0].melds.length < 2 && live > 40)) return
    h.peekedBy = h.peekedBy ?? [false, false, false, false]
    h.peekedBy[seat] = true
    target = 0
  }
  m.aiSkills[seat] = left - 1
  T.emit(h, { t: 'skill', seat, id: sk.id, ...(target !== undefined ? { target } : {}) })
}

// ---------- 結算 ----------

function settle(m: MatchState) {
  const h = m.hand
  const deltas = [0, 0, 0, 0]
  const payments: Payment[] = []
  const extras: NonNullable<HandResult['extras']> = []
  let dItems: TaiItem[] | null = null
  const wins = winsOf(h)
  const di = dealerItems(m.streak)
  const dt = di.reduce((s, x) => s + x.tai, 0)
  const rule = STAGES[m.stage].rule
  for (const win of wins) {
    const w = win.seat
    const payers = win.from === null ? [0, 1, 2, 3].filter((s) => s !== w) : [win.from]
    // 過年紅包：自摸三家都付兩倍
    const mult = rule === 'newyear' && win.from === null ? 2 : 1
    // 全國大賽決賽：自摸多算 1 台（算進台數裡，結算畫面看得到）
    if (rule === 'final' && win.from === null && !win.score.items.some((x) => x.name === '決賽加碼')) {
      win.score.items.push({ name: '決賽加碼', tai: 1 })
      win.score.total += 1
    }
    if (mult > 1) extras.push({ label: '過年紅包：自摸三家付兩倍' })
    // 尾牙摸彩：你胡的牌裡有紅中就抽獎
    const withRed = [...win.hand, ...h.seats[w].melds.flatMap((x) => x.tiles)].some((t) => t.kind === 'z5')
    if (rule === 'raffle' && w === 0 && withRed) extras.push({ label: '尾牙摸彩', coins: pick(m, [100, 150, 200, 300, 500]) })
    for (const p of payers) {
      const involved = w === m.dealer || p === m.dealer
      const tai = win.score.total + (involved ? dt : 0)
      const amount = (m.base + tai * m.perTai) * mult
      deltas[p] -= amount
      deltas[w] += amount
      payments.push({ seat: p, amount, tai, ...(wins.length > 1 ? { to: w } : {}) })
    }
    if (w === m.dealer || payers.includes(m.dealer)) dItems = di
    m.history.push({ winner: w, from: win.from, tai: win.score.total, hand: m.handNo, items: win.score.items.map((x) => x.name) })
  }
  if (!wins.length) m.history.push({ winner: null, from: null, tai: 0, hand: m.handNo })
  m.points = m.points.map((p, i) => p + deltas[i])
  m.result = {
    win: h.win,
    ...(h.also?.length ? { also: h.also } : {}),
    dealerItems: dItems,
    payments,
    deltas,
    dealer: m.dealer,
    streak: m.streak,
    ...(extras.length ? { extras } : {}),
  }
  m.phase = 'handEnd'
}

export function nextHand(m: MatchState): MatchState {
  return edit(m, (r) => {
    if (r.phase !== 'handEnd' || !r.result) fail('這一局還沒結束')
    const res = r.result!
    const wins = winsOf(res)
    const keep = !wins.length || wins.some((w) => w.seat === r.dealer)
    // 連莊上限：連到上限就換莊
    const cap = rulesOf(r).streakCap
    if (keep && !(cap > 0 && r.streak >= cap)) r.streak++
    else {
      r.dealer = (r.dealer + 1) % 4
      r.streak = 0
      r.passes++
    }
    if (r.passes >= 4 * roundsOf(r) || r.points.some((p) => p < 0)) {
      r.phase = 'end'
      return
    }
    r.handNo++
    r.result = null
    r.peek = null
    r.hand = T.newHand(r, r.dealer, roundWindOf(r), rulesOf(r))
    r.phase = 'play'
  })
}

/** 名次：分數高到低的座位 */
export function ranking(m: MatchState): number[] {
  return [0, 1, 2, 3].sort((a, b) => m.points[b] - m.points[a] || a - b)
}

export function stageOf(m: MatchState) {
  return STAGES[m.stage]
}

// ---------- 重播 ----------

/** 電腦一直走，直到輪到你、或走到指定的步數 */
function advance(m: MatchState, until = Infinity): MatchState {
  for (let g = 0; g < 20000 && m.phase === 'play' && (m.ticks ?? 0) < until; g++) {
    const n = step(m)
    if (n === m) break
    m = n
  }
  return m
}

/** 照動作紀錄重播一整場（每日挑戰的成績可以驗證） */
export function replay(seed: string, stage: number, opt: MatchOptions, log: readonly Act[]): MatchState {
  let m = newMatch(seed, stage, opt)
  for (const a of log) {
    m = advance(m, a[0])
    if (a[1] === 'd') m = discard(m, a[2])
    else if (a[1] === 'c') m = claim(m, a[2])
    else if (a[1] === 't') m = tsumo(m)
    else if (a[1] === 'k') m = kong(m, a[2])
    else if (a[1] === 's') m = useSkill(m, a[2], a[3])
    else m = nextHand(m)
  }
  return advance(m)
}
