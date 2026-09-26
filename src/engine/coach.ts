// 教練：評估「打哪張最好」。練習題和之後的提示都用這個。

import { kindOf, shanten, toCounts } from './analysis'
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

