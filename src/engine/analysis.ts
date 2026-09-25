// 手牌分析：向聽數（差幾步聽牌）、胡牌判定、聽哪些牌、拆牌。
// 都以「34 格張數陣列」運算；n = 還需要幾組面子（5 − 已經亮出來的面子數）。
//
// 向聽數：每種花色分開算出所有可能的（面子數、搭子數、有沒有雀頭），記憶化後合併。
// 公式 = 2n − 2×面子 − min(搭子, n − 面子) − 雀頭；−1 = 胡了，0 = 聽牌。

import { idx, KINDS, type Kind, type Tile } from './tiles'

export type Counts = number[]

export function toCounts(tiles: readonly { kind: Kind }[]): Counts {
  const c = new Array(34).fill(0)
  for (const t of tiles) {
    const i = idx(t.kind)
    if (i !== undefined) c[i]++
  }
  return c
}

// [面子, 搭子, 雀頭]
type Opt = [number, number, number]

const memoSuit = new Map<string, Opt[]>()
const memoHonor = new Map<string, Opt[]>()

function pareto(opts: Opt[]): Opt[] {
  // 同樣有沒有雀頭的情況下，只留「面子多、面子＋搭子多」不被別人完全壓過的
  const out: Opt[] = []
  for (const o of opts) {
    let dominated = false
    for (const q of opts) {
      if (q === o) continue
      if (q[2] >= o[2] && q[0] >= o[0] && q[0] + q[1] >= o[0] + o[1] && (q[0] > o[0] || q[0] + q[1] > o[0] + o[1] || q[2] > o[2])) {
        dominated = true
        break
      }
    }
    if (!dominated && !out.some((x) => x[0] === o[0] && x[1] === o[1] && x[2] === o[2])) out.push(o)
  }
  return out
}

function solve(c: number[], i: number, seq: boolean, memo: Map<string, Opt[]>): Opt[] {
  while (i < c.length && c[i] === 0) i++
  if (i === c.length) return [[0, 0, 0]]
  const key = `${i}:${c.join('')}`
  const hit = memo.get(key)
  if (hit) return hit
  const res: Opt[] = []
  const add = (opts: Opt[], dm: number, dt: number, dp: number) => {
    for (const o of opts) if (o[2] + dp <= 1) res.push([o[0] + dm, o[1] + dt, o[2] + dp])
  }
  if (c[i] >= 3) {
    c[i] -= 3
    add(solve(c, i, seq, memo), 1, 0, 0)
    c[i] += 3
  }
  if (seq && i + 2 < 9 && c[i + 1] && c[i + 2]) {
    c[i]--, c[i + 1]--, c[i + 2]--
    add(solve(c, i, seq, memo), 1, 0, 0)
    c[i]++, c[i + 1]++, c[i + 2]++
  }
  if (c[i] >= 2) {
    c[i] -= 2
    const s = solve(c, i, seq, memo)
    add(s, 0, 0, 1)
    add(s, 0, 1, 0)
    c[i] += 2
  }
  if (seq && i + 1 < 9 && c[i + 1]) {
    c[i]--, c[i + 1]--
    add(solve(c, i, seq, memo), 0, 1, 0)
    c[i]++, c[i + 1]++
  }
  if (seq && i + 2 < 9 && c[i + 2]) {
    c[i]--, c[i + 2]--
    add(solve(c, i, seq, memo), 0, 1, 0)
    c[i]++, c[i + 2]++
  }
  c[i]--
  add(solve(c, i, seq, memo), 0, 0, 0)
  c[i]++
  const pruned = pareto(res)
  memo.set(key, pruned)
  return pruned
}

function groupOpts(c: Counts): Opt[][] {
  return [
    solve(c.slice(0, 9), 0, true, memoSuit),
    solve(c.slice(9, 18), 0, true, memoSuit),
    solve(c.slice(18, 27), 0, true, memoSuit),
    solve(c.slice(27, 34), 0, false, memoHonor),
  ]
}

/** 向聽數：−1 胡、0 聽、1 一向聽… */
export function shanten(c: Counts, n: number): number {
  const g = groupOpts(c)
  let best = 2 * n
  for (const a of g[0])
    for (const b of g[1])
      for (const d of g[2])
        for (const e of g[3]) {
          const p = a[2] + b[2] + d[2] + e[2]
          if (p > 1) continue
          const m = Math.min(n, a[0] + b[0] + d[0] + e[0])
          const t = a[1] + b[1] + d[1] + e[1]
          const s = 2 * n - 2 * m - Math.min(t, n - m) - p
          if (s < best) best = s
        }
  return best
}

/** 嚦咕嚦咕：7 對＋1 刻，只有門清 17 張才算 */
export function isLigu(c: Counts): boolean {
  let pairs = 0
  let trips = 0
  let total = 0
  for (const x of c) {
    total += x
    if (x === 2) pairs++
    else if (x === 3) trips++
    else if (x === 4) pairs += 2
    else if (x !== 0) return false
  }
  return total === 17 && pairs === 7 && trips === 1
}

export function isWin(c: Counts, n: number): boolean {
  return shanten(c, n) === -1 || (n === 5 && isLigu(c))
}

/** 聽哪些牌（只看自己的牌，不管外面還剩幾張） */
export function waits(c: Counts, n: number): number[] {
  const out: number[] = []
  for (let k = 0; k < 34; k++) {
    if (c[k] >= 4) continue
    c[k]++
    if (isWin(c, n)) out.push(k)
    c[k]--
  }
  return out
}

export const kindOf = (i: number): Kind => KINDS[i]

export interface Group {
  type: 'chow' | 'pung'
  /** 順子是最小那張的索引，刻子是那張的索引 */
  i: number
}

export interface Decomp {
  groups: Group[]
  pair: number
}

/** 把已經胡的牌拆成 n 組面子＋1 對，列出所有拆法 */
export function decompose(c: Counts, n: number): Decomp[] {
  const out: Decomp[] = []
  const groups: Group[] = []
  const rec = (pair: number) => {
    let i = 0
    while (i < 34 && c[i] === 0) i++
    if (i === 34) {
      if (pair >= 0 && groups.length === n) out.push({ groups: [...groups], pair })
      return
    }
    if (pair < 0 && c[i] >= 2) {
      c[i] -= 2
      rec(i)
      c[i] += 2
    }
    if (c[i] >= 3) {
      c[i] -= 3
      groups.push({ type: 'pung', i })
      rec(pair)
      groups.pop()
      c[i] += 3
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--, c[i + 1]--, c[i + 2]--
      groups.push({ type: 'chow', i })
      rec(pair)
      groups.pop()
      c[i]++, c[i + 1]++, c[i + 2]++
    }
  }
  rec(-1)
  return out
}

/** 手上每張可以打的牌，打了之後的向聽數（給提示和電腦用） */
export function discardShanten(hand: readonly Tile[], n: number): Map<string, number> {
  const c = toCounts(hand)
  const out = new Map<string, number>()
  for (const t of hand) {
    if (out.has(t.kind)) continue
    const i = idx(t.kind)
    c[i]--
    out.set(t.kind, shanten(c, n))
    c[i]++
  }
  return out
}
