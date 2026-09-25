// 電腦的打法。基本功：選「打完向聽數最小、進張最多」的牌。
// 個性參數調整細節：
//   speed    愛不愛吃碰（0 很少、1 能吃就吃）
//   defense  有人看起來快胡時，會不會改打安全牌
//   greed    會不會往清一色／混一色做
//   mistakes 偶爾打錯（新手）

import { shanten, toCounts, type Counts } from './analysis'
import { rand, type HasRng } from './rng'
import { canTsumo, need, selfKongs, seatWind, type ClaimDecision, type ClaimOptions, type HandState } from './table'
import { cat, idx, isDragon, isHonor, isSuited, isTerminal, type Kind, type Tile } from './tiles'

export interface AiStyle {
  speed: number
  defense: number
  greed: number
  mistakes: number
}

/** 從 seat 的角度看得到的牌（自己手牌、所有人的河、所有亮出來的面子） */
export function visible(h: HandState, seat: number): Counts {
  const tiles: Tile[] = [...h.seats[seat].hand]
  for (const s of h.seats) {
    for (const d of s.discards) if (!d.claimed) tiles.push(d.tile)
    for (const m of s.melds) if (!m.concealed || s === h.seats[seat]) tiles.push(...m.tiles)
  }
  return toCounts(tiles)
}

/** 進張數：摸到之後向聽數會變小的牌，外面還剩幾張 */
function ukeire(c: Counts, n: number, seen: Counts, base: number): number {
  let u = 0
  for (let k = 0; k < 34; k++) {
    const left = 4 - seen[k]
    if (left <= 0) continue
    c[k]++
    if (shanten(c, n) < base) u += left
    c[k]--
  }
  return u
}

/** 看起來快胡的對手：亮了 3 組以上，或後半段亮了 2 組 */
export function threats(h: HandState, seat: number): number[] {
  return [0, 1, 2, 3].filter((s) => {
    if (s === seat) return false
    const m = h.seats[s].melds.length
    return m >= 3 || (m >= 2 && h.wall.length < 60)
  })
}

/** 這張牌對某個對手有多危險（0 安全 … 1 很危險） */
function danger(h: HandState, target: number, kind: Kind, seen: Counts): number {
  if (h.seats[target].discards.some((d) => d.tile.kind === kind)) return 0 // 他自己打過的（現物）
  const i = idx(kind)
  if (isHonor(kind)) return seen[i] >= 3 ? 0.05 : seen[i] === 2 ? 0.2 : 0.5
  if (isTerminal(kind)) return 0.55
  return 0.8
}

function valueHonor(h: HandState, seat: number, kind: Kind): boolean {
  return isDragon(kind) || kind === `z${h.roundWind + 1}` || kind === `z${seatWind(h, seat) + 1}`
}

/** 目前手上最多的花色（做清一色／混一色用） */
function mainSuit(hand: readonly Tile[]): { suit: string; share: number } {
  const n: Record<string, number> = { m: 0, p: 0, s: 0 }
  let suited = 0
  for (const t of hand) if (isSuited(t.kind)) (n[cat(t.kind)]++, suited++)
  const suit = Object.keys(n).sort((a, b) => n[b] - n[a])[0]
  return { suit, share: suited ? n[suit] / hand.length : 0 }
}

export function chooseDiscard(h: HandState, seat: number, style: AiStyle, rng: HasRng): Tile {
  const s = h.seats[seat]
  const n = need(h, seat)
  const c = toCounts(s.hand)
  const seen = visible(h, seat)
  const danger_ = threats(h, seat)
  const { suit, share } = mainSuit(s.hand)
  const going1 = style.greed > 0.4 && share >= 0.55

  const scored: { kind: Kind; score: number; sh: number }[] = []
  for (const kind of new Set(s.hand.map((t) => t.kind))) {
    const i = idx(kind)
    c[i]--
    const sh = shanten(c, n)
    const u = ukeire(c, n, seen, sh)
    c[i]++
    let score = -sh * 1000 + u * 8
    // 孤張的字牌先打；有用的字牌（三元、自己的風）留著
    if (isHonor(kind)) score += c[i] === 1 ? (valueHonor(h, seat, kind) ? 6 : 30) : -20
    else if (isTerminal(kind)) score += 8
    if (going1 && isSuited(kind) && cat(kind) !== suit) score += 60 * style.greed
    if (danger_.length && sh >= 1) {
      const d = Math.max(...danger_.map((t) => danger(h, t, kind, seen)))
      score -= d * 1200 * style.defense * (sh >= 2 ? 1 : 0.5)
    }
    scored.push({ kind, score, sh })
  }
  scored.sort((a, b) => b.score - a.score)
  let pick = scored[0]
  if (scored.length > 1 && rand(rng) < style.mistakes * 0.25) pick = scored[1 + Math.floor(rand(rng) * Math.min(3, scored.length - 1))]
  // 同種類的牌裡，優先打剛摸進來的那張（看起來比較自然）
  const same = s.hand.filter((t) => t.kind === pick.kind)
  return same.find((t) => t.id === h.drawn?.id) ?? same[same.length - 1]
}

/** 吃碰槓之後（還要再打一張）最好的向聽數 */
function bestAfter(hand: Counts, n: number): number {
  let best = 99
  for (let k = 0; k < 34; k++) {
    if (!hand[k]) continue
    hand[k]--
    best = Math.min(best, shanten(hand, n))
    hand[k]++
  }
  return best
}

export function chooseClaim(h: HandState, seat: number, opts: ClaimOptions, style: AiStyle, rng: HasRng): ClaimDecision {
  if (opts.hu) return { type: 'hu' }
  const s = h.seats[seat]
  const n = need(h, seat)
  const c = toCounts(s.hand)
  const s0 = shanten(c, n)
  const kind = h.lastDiscard!.tile.kind
  const i = idx(kind)
  const eager = 0.35 + style.speed * 0.65

  if (opts.kong) {
    c[i] -= 3
    const sk = shanten(c, n - 1)
    c[i] += 3
    if (sk <= s0 && rand(rng) < eager) return { type: 'kong' }
  }
  if (opts.pon) {
    c[i] -= 2
    const sp = bestAfter(c, n - 1)
    c[i] += 2
    if (sp < s0 && rand(rng) < eager) return { type: 'pon' }
    if (sp <= s0 && isHonor(kind) && valueHonor(h, seat, kind) && rand(rng) < eager) return { type: 'pon' }
  }
  let best: { use: Kind[]; sh: number } | null = null
  for (const use of opts.chi) {
    const a = idx(use[0])
    const b = idx(use[1])
    c[a]--, c[b]--
    const sh = bestAfter(c, n - 1)
    c[a]++, c[b]++
    if (!best || sh < best.sh) best = { use, sh }
  }
  if (best && best.sh < s0 && rand(rng) < style.speed * 0.9) return { type: 'chi', use: best.use }
  return { type: 'pass' }
}

export type SelfAction = { type: 'tsumo' } | { type: 'kong'; kind: Kind } | { type: 'discard'; tileId: number }

export function chooseSelf(h: HandState, seat: number, style: AiStyle, rng: HasRng): SelfAction {
  if (canTsumo(h, seat)) return { type: 'tsumo' }
  const n = need(h, seat)
  const c = toCounts(h.seats[seat].hand)
  const now = bestAfter(c, n)
  const ks = selfKongs(h, seat)
  for (const kind of ks.ankan) {
    const i = idx(kind)
    c[i] -= 4
    const sk = shanten(c, n - 1)
    c[i] += 4
    if (sk <= now) return { type: 'kong', kind }
  }
  for (const kind of ks.kakan) {
    const i = idx(kind)
    c[i]--
    const sk = shanten(c, n)
    c[i]++
    if (sk <= now) return { type: 'kong', kind }
  }
  return { type: 'discard', tileId: chooseDiscard(h, seat, style, rng).id }
}
