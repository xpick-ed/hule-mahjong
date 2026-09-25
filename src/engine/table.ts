// 一局牌的狀態機（台灣十六張）。
// 座位 0 = 你（下）、1 = 右（下家）、2 = 上（對家）、3 = 左（上家）；出牌順序 0 → 1 → 2 → 3。
// 這裡的函式都「直接改」傳進來的 HandState；match.ts 會先複製一份再呼叫。

import { isWin, shanten, toCounts } from './analysis'
import { randInt, shuffle, type HasRng } from './rng'
import { scoreWin, type Meld, type WinScore } from './scoring'
import { fullSet, idx, isFlower, sortTiles, type Kind, type Tile } from './tiles'

/** 牌山剩這麼多張就流局（留八墩） */
export const RESERVE = 16

export interface SeatState {
  hand: Tile[]
  melds: Meld[]
  flowers: Tile[]
  discards: { tile: Tile; claimed?: boolean }[]
}

export interface ClaimOptions {
  hu: boolean
  pon: boolean
  kong: boolean
  /** 可以吃的組合：手上要拿出來的兩張 */
  chi: Kind[][]
}

export type ClaimDecision = { type: 'pass' } | { type: 'hu' } | { type: 'pon' } | { type: 'kong' } | { type: 'chi'; use: Kind[] }

export interface WinInfo {
  seat: number
  /** null = 自摸 */
  from: number | null
  tile: Tile
  score: WinScore
  hand: Tile[]
}

export type HandEvent =
  | { t: 'draw'; seat: number }
  | { t: 'flower'; seat: number; tile: Tile }
  | { t: 'discard'; seat: number; tile: Tile }
  | { t: 'chi' | 'pon' | 'kong'; seat: number; from: number; tile: Tile }
  | { t: 'ankan' | 'kakan'; seat: number; kind: Kind }
  | { t: 'win'; seat: number; from: number | null }
  | { t: 'exhausted' }
  | { t: 'ting'; seat: number }

export interface HandState {
  wall: Tile[]
  seats: SeatState[]
  dealer: number
  roundWind: number
  turn: number
  phase: 'discard' | 'claim' | 'over'
  /** 輪到的人剛摸進來的牌（吃碰之後是 null，不能自摸） */
  drawn: Tile | null
  lastDiscard: { tile: Tile; from: number } | null
  options: (ClaimOptions | null)[]
  decisions: (ClaimDecision | null)[]
  afterKong: boolean
  /** 還沒有人吃碰槓（地胡用） */
  noCalls: boolean
  discardCount: number
  /** 用了「好運」絕招的座位：下一次摸牌摸到最有用的牌 */
  luckySeat: number | null
  /** 這一局已經喊過聽牌的座位（台詞一局只講一次） */
  tingSaid: boolean[]
  win: WinInfo | null
  exhausted: boolean
  events: { n: number; e: HandEvent }[]
  eventN: number
}

export class RuleError extends Error {}
const fail = (msg: string): never => {
  throw new RuleError(msg)
}

export const need = (h: HandState, seat: number) => 5 - h.seats[seat].melds.length
export const seatWind = (h: HandState, seat: number) => (seat - h.dealer + 4) % 4
export const next = (seat: number) => (seat + 1) % 4

function emit(h: HandState, e: HandEvent) {
  h.events.push({ n: ++h.eventN, e })
  if (h.events.length > 40) h.events.splice(0, h.events.length - 40)
}

export function newHand(rng: HasRng, dealer: number, roundWind: number): HandState {
  const wall = shuffle(
    rng,
    fullSet().map((kind, i) => ({ id: i + 1, kind })),
  )
  const h: HandState = {
    wall,
    seats: [0, 1, 2, 3].map(() => ({ hand: [], melds: [], flowers: [], discards: [] })),
    dealer,
    roundWind,
    turn: dealer,
    phase: 'discard',
    drawn: null,
    lastDiscard: null,
    options: [null, null, null, null],
    decisions: [null, null, null, null],
    afterKong: false,
    noCalls: true,
    discardCount: 0,
    luckySeat: null,
    tingSaid: [false, false, false, false],
    win: null,
    exhausted: false,
    events: [],
    eventN: 0,
  }
  for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) h.seats[(dealer + k) % 4].hand.push(wall.shift()!)
  const first = wall.shift()!
  h.seats[dealer].hand.push(first)
  h.drawn = first
  for (let k = 0; k < 4; k++) {
    const seat = (dealer + k) % 4
    replaceFlowers(h, seat)
    if (h.phase === 'over') return h
  }
  for (const s of h.seats) sortTiles(s.hand)
  return h
}

/** 手上的花全部亮出、從牌尾補；湊滿 8 張花直接胡（八仙過海） */
function replaceFlowers(h: HandState, seat: number) {
  const s = h.seats[seat]
  for (;;) {
    const i = s.hand.findIndex((t) => isFlower(t.kind))
    if (i < 0) return
    const [f] = s.hand.splice(i, 1)
    s.flowers.push(f)
    emit(h, { t: 'flower', seat, tile: f })
    if (s.flowers.length === 8) {
      winEightFlowers(h, seat)
      return
    }
    const t = h.wall.pop()!
    s.hand.push(t)
    if (h.drawn && h.drawn.id === f.id) h.drawn = t
  }
}

/** 從牌山前面摸一張（好運絕招會先把最有用的牌換到最前面） */
export function drawTile(h: HandState, seat: number) {
  if (h.wall.length <= RESERVE) {
    h.exhausted = true
    h.phase = 'over'
    h.drawn = null
    emit(h, { t: 'exhausted' })
    return
  }
  if (h.luckySeat === seat) {
    h.luckySeat = null
    luckyPick(h, seat)
  }
  const t = h.wall.shift()!
  const s = h.seats[seat]
  s.hand.push(t)
  h.drawn = t
  h.turn = seat
  h.phase = 'discard'
  emit(h, { t: 'draw', seat })
  replaceFlowers(h, seat)
  if (!h.win) sortTiles(s.hand)
}

/** 槓完從牌尾補一張 */
function kongDraw(h: HandState, seat: number) {
  const t = h.wall.pop()!
  const s = h.seats[seat]
  s.hand.push(t)
  h.drawn = t
  h.turn = seat
  h.phase = 'discard'
  h.afterKong = true
  replaceFlowers(h, seat)
  if (!h.win) sortTiles(s.hand)
}

function luckyPick(h: HandState, seat: number) {
  const s = h.seats[seat]
  const c = toCounts(s.hand)
  const n = need(h, seat)
  const live = h.wall.length - RESERVE
  let best = -1
  let bestS = shanten(c, n) + 1
  for (let i = 0; i < live; i++) {
    const k = h.wall[i].kind
    if (isFlower(k)) continue
    const j = idx(k)
    c[j]++
    const v = isWin(c, n) ? -2 : shanten(c, n) - 1
    c[j]--
    if (v < bestS) {
      bestS = v
      best = i
    }
  }
  if (best > 0) [h.wall[0], h.wall[best]] = [h.wall[best], h.wall[0]]
}

// ---------- 自己回合 ----------

export function canTsumo(h: HandState, seat: number): boolean {
  return h.phase === 'discard' && h.turn === seat && !!h.drawn && isWin(toCounts(h.seats[seat].hand), need(h, seat))
}

export function selfKongs(h: HandState, seat: number): { ankan: Kind[]; kakan: Kind[] } {
  const out = { ankan: [] as Kind[], kakan: [] as Kind[] }
  if (h.phase !== 'discard' || h.turn !== seat || h.wall.length <= RESERVE) return out
  const s = h.seats[seat]
  const c = toCounts(s.hand)
  for (const t of s.hand) {
    if (c[idx(t.kind)] === 4 && !out.ankan.includes(t.kind)) out.ankan.push(t.kind)
  }
  for (const m of s.melds) {
    if (m.type === 'pung' && s.hand.some((t) => t.kind === m.tiles[0].kind)) out.kakan.push(m.tiles[0].kind)
  }
  return out
}

export function selfKong(h: HandState, seat: number, kind: Kind) {
  const ks = selfKongs(h, seat)
  const s = h.seats[seat]
  if (ks.ankan.includes(kind)) {
    const tiles = s.hand.filter((t) => t.kind === kind)
    s.hand = s.hand.filter((t) => t.kind !== kind)
    s.melds.push({ type: 'kong', tiles, concealed: true })
    emit(h, { t: 'ankan', seat, kind })
  } else if (ks.kakan.includes(kind)) {
    const i = s.hand.findIndex((t) => t.kind === kind)
    const [t] = s.hand.splice(i, 1)
    const m = s.melds.find((x) => x.type === 'pung' && x.tiles[0].kind === kind)!
    m.type = 'kong'
    m.tiles.push(t)
    emit(h, { t: 'kakan', seat, kind })
  } else fail('不能槓這張')
  h.noCalls = false
  kongDraw(h, seat)
}

export function tsumo(h: HandState, seat: number) {
  if (!canTsumo(h, seat)) fail('還沒胡')
  finishWin(h, seat, null, h.drawn!)
}

export function discardTile(h: HandState, seat: number, tileId: number) {
  if (h.phase !== 'discard' || h.turn !== seat) fail('還沒輪到你')
  const s = h.seats[seat]
  const i = s.hand.findIndex((t) => t.id === tileId)
  if (i < 0) fail('手上沒有這張牌')
  const [tile] = s.hand.splice(i, 1)
  s.discards.push({ tile })
  h.lastDiscard = { tile, from: seat }
  h.drawn = null
  h.afterKong = false
  h.discardCount++
  emit(h, { t: 'discard', seat, tile })
  if (!h.tingSaid[seat] && shanten(toCounts(s.hand), need(h, seat)) === 0) {
    h.tingSaid[seat] = true
    emit(h, { t: 'ting', seat })
  }

  let any = false
  for (let k = 1; k < 4; k++) {
    const o = (seat + k) % 4
    const opts = claimOptions(h, o, tile, seat)
    h.options[o] = opts
    h.decisions[o] = opts ? null : { type: 'pass' }
    if (opts) any = true
  }
  h.options[seat] = null
  h.decisions[seat] = { type: 'pass' }
  if (any) h.phase = 'claim'
  else afterPass(h)
}

function afterPass(h: HandState) {
  const from = h.lastDiscard!.from
  h.options = [null, null, null, null]
  h.decisions = [null, null, null, null]
  drawTile(h, next(from))
}

export function claimOptions(h: HandState, seat: number, tile: Tile, from: number): ClaimOptions | null {
  const s = h.seats[seat]
  const c = toCounts(s.hand)
  const i = idx(tile.kind)
  const n = need(h, seat)
  c[i]++
  const hu = isWin(c, n)
  c[i]--
  const last = h.wall.length <= RESERVE
  const pon = !last && c[i] >= 2
  const kong = !last && c[i] >= 3
  const chi: Kind[][] = []
  if (!last && seat === next(from) && i < 27) {
    const r = i % 9
    const k = (j: number) => s.hand.find((t) => idx(t.kind) === j)!.kind
    if (r >= 2 && c[i - 2] && c[i - 1]) chi.push([k(i - 2), k(i - 1)])
    if (r >= 1 && r <= 7 && c[i - 1] && c[i + 1]) chi.push([k(i - 1), k(i + 1)])
    if (r <= 6 && c[i + 1] && c[i + 2]) chi.push([k(i + 1), k(i + 2)])
  }
  if (!hu && !pon && !kong && chi.length === 0) return null
  return { hu, pon, kong, chi }
}

export function decide(h: HandState, seat: number, d: ClaimDecision) {
  if (h.phase !== 'claim') fail('現在不能吃碰')
  const o = h.options[seat]
  if (!o) fail('這張你不能吃碰')
  const ok =
    d.type === 'pass' ||
    (d.type === 'hu' && o!.hu) ||
    (d.type === 'pon' && o!.pon) ||
    (d.type === 'kong' && o!.kong) ||
    (d.type === 'chi' && o!.chi.some((v) => v[0] === d.use[0] && v[1] === d.use[1]))
  if (!ok) fail('不能這樣做')
  h.decisions[seat] = d
}

export const allDecided = (h: HandState) => h.decisions.every((d) => d !== null)

/** 大家都決定了：胡 ＞ 碰／槓 ＞ 吃；同時兩家胡，照順序最近的那家（截胡） */
export function resolveClaims(h: HandState) {
  if (h.phase !== 'claim') fail('沒有要處理的吃碰')
  if (!allDecided(h)) fail('還有人沒決定')
  const { tile, from } = h.lastDiscard!
  const order = [1, 2, 3].map((k) => (from + k) % 4)
  const pick = (type: ClaimDecision['type']) => order.find((s) => h.decisions[s]!.type === type)

  const huSeat = pick('hu')
  if (huSeat !== undefined) {
    markClaimed(h, from)
    finishWin(h, huSeat, from, tile)
    return
  }
  const kongSeat = pick('kong')
  const ponSeat = pick('pon')
  const chiSeat = pick('chi')
  const claimer = kongSeat ?? ponSeat ?? chiSeat
  if (claimer === undefined) {
    afterPass(h)
    return
  }
  const d = h.decisions[claimer]!
  const s = h.seats[claimer]
  const take = (kind: Kind, n: number) => {
    const got: Tile[] = []
    for (let k = 0; k < n; k++) {
      const i = s.hand.findIndex((t) => t.kind === kind)
      got.push(s.hand.splice(i, 1)[0])
    }
    return got
  }
  markClaimed(h, from)
  h.options = [null, null, null, null]
  h.decisions = [null, null, null, null]
  h.noCalls = false
  if (d.type === 'kong') {
    s.melds.push({ type: 'kong', tiles: [...take(tile.kind, 3), tile], from })
    emit(h, { t: 'kong', seat: claimer, from, tile })
    kongDraw(h, claimer)
    return
  }
  if (d.type === 'pon') {
    s.melds.push({ type: 'pung', tiles: [...take(tile.kind, 2), tile], from })
    emit(h, { t: 'pon', seat: claimer, from, tile })
  } else if (d.type === 'chi') {
    const tiles = sortTiles([...take(d.use[0], 1), ...take(d.use[1], 1), tile])
    s.melds.push({ type: 'chow', tiles, from })
    emit(h, { t: 'chi', seat: claimer, from, tile })
  }
  h.turn = claimer
  h.phase = 'discard'
  h.drawn = null
}

function markClaimed(h: HandState, from: number) {
  const d = h.seats[from].discards
  d[d.length - 1].claimed = true
}

function finishWin(h: HandState, seat: number, from: number | null, tile: Tile) {
  const s = h.seats[seat]
  const hand = from === null ? [...s.hand] : sortTiles([...s.hand, tile])
  const score = scoreWin({
    hand,
    melds: s.melds,
    flowers: s.flowers,
    winTile: tile.kind,
    tsumo: from === null,
    seatWind: seatWind(h, seat),
    roundWind: h.roundWind,
    lastTile: h.wall.length <= RESERVE,
    afterKong: from === null && h.afterKong,
    heaven: from === null && seat === h.dealer && h.discardCount === 0,
    earth: from === null && seat !== h.dealer && h.noCalls && s.discards.length === 0,
  })
  if (from !== null) s.hand = hand
  h.win = { seat, from, tile, score, hand }
  h.phase = 'over'
  h.options = [null, null, null, null]
  h.decisions = [null, null, null, null]
  emit(h, { t: 'win', seat, from })
}

function winEightFlowers(h: HandState, seat: number) {
  const s = h.seats[seat]
  const tile = s.flowers[s.flowers.length - 1]
  const score = scoreWin({
    hand: s.hand,
    melds: s.melds,
    flowers: s.flowers,
    winTile: tile.kind,
    tsumo: true,
    seatWind: seatWind(h, seat),
    roundWind: h.roundWind,
    lastTile: false,
    afterKong: false,
    heaven: false,
    earth: false,
    eightFlowers: true,
  })
  h.win = { seat, from: null, tile, score, hand: [...s.hand] }
  h.phase = 'over'
  emit(h, { t: 'win', seat, from: null })
}

// ---------- 絕招 ----------

/** 換牌：手上一張換成牌山隨機一張（不會換到花） */
export function swapTile(h: HandState, rng: HasRng, seat: number, tileId: number) {
  if (h.phase !== 'discard' || h.turn !== seat) fail('輪到你的時候才能換')
  const s = h.seats[seat]
  const i = s.hand.findIndex((t) => t.id === tileId)
  if (i < 0) fail('手上沒有這張牌')
  const live = h.wall.length - RESERVE
  const choices = h.wall.slice(0, live).map((t, j) => ({ t, j })).filter((x) => !isFlower(x.t.kind))
  if (!choices.length) fail('牌山沒牌可換了')
  const { j } = choices[randInt(rng, choices.length)]
  const [old] = s.hand.splice(i, 1, h.wall[j])
  h.wall[j] = old
  if (h.drawn?.id === old.id) h.drawn = s.hand[i]
  sortTiles(s.hand)
}
