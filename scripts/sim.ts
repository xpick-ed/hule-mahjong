// 粗略的平衡模擬：用一個貪心的機器人打很多局「東一局」（沒有神明），
// 看胡牌率、每手分數、一局能胡幾手。調手牌上限、換牌次數、目標分數時用。
//   npm run sim                       預設 2000 局，手牌上限和換牌次數用遊戲的預設值
//   npm run sim -- 5000 11 4          局數、手牌上限、換牌次數

import { BASE_DISCARDS, BASE_HAND_SIZE, discard, newRun, playMeld, resolveScore } from '../src/engine/game'
import { classify, fits, MAX_MELDS } from '../src/engine/melds'
import { cat, isSuited, rank, type Tile } from '../src/engine/tiles'
import type { RunState } from '../src/engine/types'

const N = Number(process.argv[2] ?? 2000)
const HAND = Number(process.argv[3] ?? BASE_HAND_SIZE)
const DISC = Number(process.argv[4] ?? BASE_DISCARDS)

function findMelds(hand: Tile[]): Tile[][] {
  const out: Tile[][] = []
  const byKind = new Map<string, Tile[]>()
  for (const t of hand) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t])
  for (const ts of byKind.values()) {
    if (ts.length >= 4) out.push(ts.slice(0, 4))
    if (ts.length >= 3) out.push(ts.slice(0, 3))
  }
  for (const t of hand) {
    if (!isSuited(t.kind)) continue
    const a = byKind.get(`${cat(t.kind)}${rank(t.kind) + 1}`)
    const b = byKind.get(`${cat(t.kind)}${rank(t.kind) + 2}`)
    if (a && b) out.push([t, a[0], b[0]])
  }
  for (const ts of byKind.values()) if (ts.length >= 2) out.push(ts.slice(0, 2))
  return out
}

/** 一張牌跟手上其他牌的連結程度，越低越該丟 */
function keepScore(t: Tile, hand: Tile[]): number {
  let s = 0
  for (const o of hand) {
    if (o.id === t.id) continue
    if (o.kind === t.kind) s += 3
    else if (isSuited(t.kind) && cat(o.kind) === cat(t.kind)) {
      const d = Math.abs(rank(o.kind) - rank(t.kind))
      if (d === 1) s += 2
      else if (d === 2) s += 1
    }
  }
  return s
}

function botStep(r: RunState): RunState {
  const round = r.round!
  const melds = findMelds(round.hand)
  const pairs = melds.filter((m) => m.length === 2)
  const big = melds.filter((m) => m.length >= 3 && fits(classify(m)!, round.table))
  if (big.length) {
    // 選出牌後剩下的手牌連結最好的那組
    const after = (m: Tile[]) => {
      const rest = round.hand.filter((t) => !m.includes(t))
      return rest.reduce((s, t) => s + keepScore(t, rest), 0)
    }
    big.sort((a, b) => after(b) - after(a))
    return playMeld(r, big[0].map((t) => t.id))
  }
  if (round.table.eye === null && pairs.length && (round.table.melds.length === MAX_MELDS || pairs.length >= 2)) {
    return playMeld(r, pairs[0].map((t) => t.id))
  }
  // 丟掉連結最弱的牌：孤張全丟，至少丟 3 張，最多 5 張
  const ranked = [...round.hand].sort((a, b) => keepScore(a, round.hand) - keepScore(b, round.hand))
  const weak = ranked.filter((t) => keepScore(t, round.hand) <= 1).length
  const toss = ranked.slice(0, Math.min(5, Math.max(3, weak)))
  try {
    return discard(r, toss.map((t) => t.id))
  } catch {
    // 不能換了：有對子就硬放雀頭，不然只好等流局
    if (round.table.eye === null && pairs.length) return playMeld(r, pairs[0].map((t) => t.id))
    throw new Error('bot stuck')
  }
}

const stats = { rounds: 0, pass: 0, hus: 0, draws: 0, huScores: [] as number[], husPerRound: [] as number[], totals: [] as number[] }
for (let i = 0; i < N; i++) {
  let r = newRun(`sim-${i}`)
  const round0 = r.round!
  round0.handSize = HAND
  round0.discardsLeft = DISC
  while (round0.hand.length < HAND) round0.hand.push(round0.pile.pop()!)
  round0.target = Infinity // 打到流局為止，看一局最多能胡幾手
  let hus = 0
  let firstTotal = 0
  for (let guard = 0; guard < 500 && r.phase === 'round'; guard++) {
    const round = r.round!
    if (round.status === 'hu') {
      stats.huScores.push(round.score!.score)
      hus++
      r = resolveScore(r)
      if (hus === 1) firstTotal = r.round!.total
      continue
    }
    if (round.status === 'draw') {
      stats.draws++
      const last = round.total + round.score!.score
      r = resolveScore(r)
      r.round!.total = last
      break
    }
    r = botStep(r)
  }
  stats.rounds++
  stats.hus += hus
  stats.husPerRound.push(hus)
  stats.totals.push(r.round?.total ?? 0)
  if (firstTotal >= 300) stats.pass++
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? 0
const dist = new Map<number, number>()
for (const h of stats.husPerRound) dist.set(h, (dist.get(h) ?? 0) + 1)

console.log(`局數 ${stats.rounds}（手牌 ${HAND}、換牌 ${DISC}）`)
console.log(`每局平均胡 ${(stats.hus / stats.rounds).toFixed(2)} 手`)
console.log(`一局胡幾手：${[...dist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} 手 ${((v / stats.rounds) * 100).toFixed(0)}%`).join('、')}`)
console.log(`每手分數：平均 ${avg(stats.huScores).toFixed(0)}，中位數 ${pct(stats.huScores, 0.5)}，前 10% ${pct(stats.huScores, 0.9)}`)
console.log(`第一手就過 300 的比例 ${((stats.pass / stats.rounds) * 100).toFixed(0)}%`)
const passAt = (t: number) => `${t} ${((stats.totals.filter((x) => x >= t).length / stats.rounds) * 100).toFixed(0)}%`
console.log(`整局過關率（沒有神明）：${[300, 450, 600, 750, 1200].map(passAt).join('、')}`)
