// 教練：評估「打哪張最好」。練習題和之後的提示都用這個。

import { kindOf, shanten, toCounts, waits } from './analysis'
import { randInt, shuffle } from './rng'
import { idx, type Tile as T } from './tiles'

export interface Choice {
  kind: string
  sh: number
  uke: number
  /** 摸到會更進一步的牌 */
  good: string[]
}

/** 每張可以打的牌：打了之後差幾步、有幾張牌會更進一步（只算自己手上看得到的） */
export function evaluate(hand: readonly T[], n = 5): Choice[] {
  const c = toCounts(hand)
  const out: Choice[] = []
  for (const kind of new Set(hand.map((t) => t.kind))) {
    const i = idx(kind)
    c[i]--
    const sh = shanten(c, n)
    let uke = 0
    const good: string[] = []
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue
      const left = 4 - c[k] - (k === i ? 1 : 0)
      if (left <= 0) continue
      c[k]++
      if (shanten(c, n) < sh) {
        uke += left
        good.push(kindOf(k))
      }
      c[k]--
    }
    c[i]++
    out.push({ kind, sh, uke, good })
  }
  return out.sort((a, b) => a.sh - b.sh || b.uke - a.uke)
}


/** 一組牌聽哪些牌（張數要是 3n+1，例如 1、4、7、10、13 張） */
export function waitsOfKinds(kinds: readonly string[]): string[] {
  const n = (kinds.length - 1) / 3
  if (!Number.isInteger(n) || n < 0) return []
  return waits(toCounts(kinds.map((kind) => ({ kind }))), n).map(kindOf)
}

/**
 * 教學用：這幾張牌等什麼。
 * 3n+1 張：聽哪些牌；3n+2 張（例如兩張的搭子、一對）：再來哪張能變成完整的面子。
 */
export function neededKinds(kinds: readonly string[]): string[] {
  if (kinds.length % 3 === 1) return waitsOfKinds(kinds)
  if (kinds.length % 3 !== 2) return []
  // 補一對不相干的字牌當眼，算完再把它拿掉
  const dummy = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'].find((z) => !kinds.includes(z))!
  return waitsOfKinds([...kinds, dummy, dummy]).filter((k) => k !== dummy)
}

/** 聽牌練習題：同一種花色 size 張，剛好聽牌、至少聽兩種（13 張至少三種） */
export function makeWaitPuzzle(seed: number, size: 7 | 10 | 13): { kinds: string[]; waits: string[] } {
  const r = { rng: seed >>> 0 || 1 }
  const suit = ['m', 'p', 's'][randInt(r, 3)]
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((x) => [x, x, x, x])
  for (;;) {
    const pick = shuffle(r, [...pool]).slice(0, size).sort((a, b) => a - b)
    const kinds = pick.map((x) => `${suit}${x}`)
    const w = waitsOfKinds(kinds)
    // 四張都在手上的牌不能再胡（聽了也摸不到）
    const live = w.filter((k) => kinds.filter((x) => x === k).length < 4)
    if (live.length >= (size === 13 ? 3 : 2)) return { kinds, waits: live }
  }
}
