// 牌的種類用短字串表示：
//   m1–m9 萬、p1–p9 筒、s1–s9 條
//   z1–z4 東南西北、z5–z7 中發白
//   f1–f4 春夏秋冬、f5–f8 梅蘭竹菊
// 計算時把 34 種非花牌對應到 0–33 的索引（萬 0–8、筒 9–17、條 18–26、字 27–33）。

export type Kind = string

export interface Tile {
  id: number
  kind: Kind
}

export const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const HONOR_NAME = ['東', '南', '西', '北', '中', '發', '白']
const FLOWER_NAME = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊']
const SUIT_NAME: Record<string, string> = { m: '萬', p: '筒', s: '條' }

export const cat = (k: Kind) => k[0] as 'm' | 'p' | 's' | 'z' | 'f'
export const rank = (k: Kind) => Number(k.slice(1))
export const isSuited = (k: Kind) => k[0] === 'm' || k[0] === 'p' || k[0] === 's'
export const isHonor = (k: Kind) => k[0] === 'z'
export const isWind = (k: Kind) => k[0] === 'z' && rank(k) <= 4
export const isDragon = (k: Kind) => k[0] === 'z' && rank(k) >= 5
export const isFlower = (k: Kind) => k[0] === 'f'
export const isTerminal = (k: Kind) => isSuited(k) && (rank(k) === 1 || rank(k) === 9)

/** 34 種非花牌，依索引排列 */
export const KINDS: readonly Kind[] = [
  ...['m', 'p', 's'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${s}${r}`)),
  'z1',
  'z2',
  'z3',
  'z4',
  'z5',
  'z6',
  'z7',
]

const INDEX: Record<string, number> = Object.fromEntries(KINDS.map((k, i) => [k, i]))

/** 種類 → 0–33 */
export const idx = (k: Kind): number => INDEX[k]

export function tileName(k: Kind): string {
  const c = cat(k)
  const r = rank(k)
  if (c === 'z') return HONOR_NAME[r - 1]
  if (c === 'f') return FLOWER_NAME[r - 1]
  return CN_NUM[r - 1] + SUIT_NAME[c]
}

export const honorChar = (k: Kind) => HONOR_NAME[rank(k) - 1]
export const flowerChar = (k: Kind) => FLOWER_NAME[rank(k) - 1]
export const WIND_CHAR = ['東', '南', '西', '北']

const CAT_ORDER = { m: 0, p: 1, s: 2, z: 3, f: 4 }
export function sortKey(k: Kind): number {
  return CAT_ORDER[cat(k)] * 10 + rank(k)
}

export function sortTiles<T extends Tile>(tiles: T[]): T[] {
  return tiles.sort((a, b) => sortKey(a.kind) - sortKey(b.kind) || a.id - b.id)
}

/** 一整副牌：136 張＋8 張花 */
export function fullSet(): Kind[] {
  const out: Kind[] = []
  for (const k of KINDS) for (let i = 0; i < 4; i++) out.push(k)
  for (let f = 1; f <= 8; f++) out.push(`f${f}`)
  return out
}
