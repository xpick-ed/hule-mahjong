// 一場（東風圈）的流程：換莊、連莊、算錢、絕招、推動電腦出牌。
// 每個動作拿舊的 MatchState、回傳新的一份；不合法丟 RuleError。

import { chooseClaim, chooseSelf } from './ai'
import { CHARACTERS } from './characters'
import { hashSeed, randInt, shuffle } from './rng'
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
}

export interface HandResult {
  win: T.WinInfo | null
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
  /** 換過幾次莊；換滿 4 次東風圈結束 */
  passes: number
  handNo: number
  hand: T.HandState
  phase: 'play' | 'handEnd' | 'end'
  result: HandResult | null
  history: { winner: number | null; from: number | null; tai: number }[]
  skills: Record<SkillId, number>
  /** 偷看中的座位 */
  peek: number | null
}

const fail = (msg: string): never => {
  throw new T.RuleError(msg)
}

function edit(m: MatchState, fn: (r: MatchState) => void): MatchState {
  const r = structuredClone(m)
  fn(r)
  if (r.phase === 'play' && r.hand.phase === 'over') settle(r)
  return r
}

export function styleOf(m: MatchState, seat: number) {
  return CHARACTERS[m.chars[seat]].style
}

/** 剛有人打牌：電腦馬上決定要不要吃碰胡（你的決定等畫面） */
function autoDecide(m: MatchState) {
  const h = m.hand
  if (h.phase !== 'claim') return
  for (let s = 1; s < 4; s++) {
    const o = h.options[s]
    if (o && !h.decisions[s]) T.decide(h, s, chooseClaim(h, s, o, styleOf(m, s), m))
  }
}

export function newMatch(seed: string, stageIndex: number): MatchState {
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
  } as unknown as MatchState
  m.chars = ['me', ...shuffle(m, [...stage.opponents])]
  m.dealer = randInt(m, 4)
  m.hand = T.newHand(m, m.dealer, 0)
  if (m.hand.phase === 'over') settle(m)
  return m
}

// ---------- 你的動作 ----------

export function discard(m: MatchState, tileId: number): MatchState {
  return edit(m, (r) => {
    T.discardTile(r.hand, 0, tileId)
    r.peek = null
    autoDecide(r)
  })
}

export function tsumo(m: MatchState): MatchState {
  return edit(m, (r) => T.tsumo(r.hand, 0))
}

export function kong(m: MatchState, kind: Kind): MatchState {
  return edit(m, (r) => T.selfKong(r.hand, 0, kind))
}

export function claim(m: MatchState, d: T.ClaimDecision): MatchState {
  return edit(m, (r) => {
    T.decide(r.hand, 0, d)
    if (T.allDecided(r.hand)) T.resolveClaims(r.hand)
  })
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

/** 現在是不是在等你 */
export function waitingForYou(m: MatchState): boolean {
  if (m.phase !== 'play') return false
  const h = m.hand
  if (h.phase === 'discard') return h.turn === 0
  if (h.phase === 'claim') return !!h.options[0] && !h.decisions[0]
  return false
}

/** 做一個「不用等你」的動作：電腦出牌／吃碰結算。沒事可做就回傳原本那份 */
export function step(m: MatchState): MatchState {
  if (m.phase !== 'play' || waitingForYou(m)) return m
  const h = m.hand
  if (h.phase === 'claim') {
    return edit(m, (r) => {
      autoDecide(r)
      T.resolveClaims(r.hand)
    })
  }
  if (h.phase === 'discard' && h.turn !== 0) {
    return edit(m, (r) => {
      const seat = r.hand.turn
      const act = chooseSelf(r.hand, seat, styleOf(r, seat), r)
      if (act.type === 'tsumo') T.tsumo(r.hand, seat)
      else if (act.type === 'kong') T.selfKong(r.hand, seat, act.kind)
      else {
        T.discardTile(r.hand, seat, act.tileId)
        autoDecide(r)
      }
    })
  }
  return m
}

// ---------- 結算 ----------

function settle(m: MatchState) {
  const h = m.hand
  const deltas = [0, 0, 0, 0]
  const payments: Payment[] = []
  let dItems: TaiItem[] | null = null
  if (h.win) {
    const w = h.win.seat
    const payers = h.win.from === null ? [0, 1, 2, 3].filter((s) => s !== w) : [h.win.from]
    const di = dealerItems(m.streak)
    const dt = di.reduce((s, x) => s + x.tai, 0)
    for (const p of payers) {
      const involved = w === m.dealer || p === m.dealer
      const tai = h.win.score.total + (involved ? dt : 0)
      const amount = m.base + tai * m.perTai
      deltas[p] -= amount
      deltas[w] += amount
      payments.push({ seat: p, amount, tai })
    }
    if (w === m.dealer || payers.includes(m.dealer)) dItems = di
    m.history.push({ winner: w, from: h.win.from, tai: h.win.score.total })
  } else {
    m.history.push({ winner: null, from: null, tai: 0 })
  }
  m.points = m.points.map((p, i) => p + deltas[i])
  m.result = { win: h.win, dealerItems: dItems, payments, deltas, dealer: m.dealer, streak: m.streak }
  m.phase = 'handEnd'
}

export function nextHand(m: MatchState): MatchState {
  return edit(m, (r) => {
    if (r.phase !== 'handEnd' || !r.result) fail('這一局還沒結束')
    const res = r.result!
    if (!res.win || res.win.seat === r.dealer) r.streak++
    else {
      r.dealer = (r.dealer + 1) % 4
      r.streak = 0
      r.passes++
    }
    if (r.passes >= 4 || r.points.some((p) => p < 0)) {
      r.phase = 'end'
      return
    }
    r.handNo++
    r.result = null
    r.peek = null
    r.hand = T.newHand(r, r.dealer, 0)
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
