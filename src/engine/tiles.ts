// 牌的種類用短字串表示：
//   m1–m9 萬、p1–p9 筒、s1–s9 條
//   z1–z4 東南西北、z5–z7 中發白
//   f1–f8 春夏秋冬梅蘭竹菊

export type Suit = 'm' | 'p' | 's'
export type Kind = string
export type Enh = 'gold' | 'jade'

export interface Tile {
  id: number
  kind: Kind
  enh?: Enh
}

export const SUITS: readonly Suit[] = ['m', 'p', 's']
export const SUIT_NAME: Record<Suit, string> = { m: '萬', p: '筒', s: '條' }
export const HONORS: readonly Kind[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7']
export const WINDS: readonly Kind[] = ['z1', 'z2', 'z3', 'z4']
export const FLOWERS: readonly Kind[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']

const HONOR_NAME = ['東', '南', '西', '北', '中', '發', '白']
const FLOWER_NAME = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊']
export const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

export const cat = (k: Kind) => k[0] as Suit | 'z' | 'f'
export const rank = (k: Kind) => Number(k.slice(1))
export const isSuited = (k: Kind) => k[0] === 'm' || k[0] === 'p' || k[0] === 's'
export const isHonor = (k: Kind) => k[0] === 'z'
export const isWind = (k: Kind) => k[0] === 'z' && rank(k) <= 4
export const isDragon = (k: Kind) => k[0] === 'z' && rank(k) >= 5
export const isFlower = (k: Kind) => k[0] === 'f'
export const isTerminal = (k: Kind) => isSuited(k) && (rank(k) === 1 || rank(k) === 9)
/** 么九牌：1、9、字牌 */
export const isYaoJiu = (k: Kind) => isTerminal(k) || isHonor(k)

/** 牌面分：數牌 = 點數，字牌 = 10，花牌 = 0 */
export function faceChips(k: Kind): number {
  if (isSuited(k)) return rank(k)
  if (isHonor(k)) return 10
  return 0
}

export function tileName(k: Kind): string {
  const c = cat(k)
  const r = rank(k)
  if (c === 'z') return HONOR_NAME[r - 1]
  if (c === 'f') return FLOWER_NAME[r - 1]
  return CN_NUM[r - 1] + SUIT_NAME[c]
}

export function honorChar(k: Kind): string {
  return HONOR_NAME[rank(k) - 1]
}

export function flowerChar(k: Kind): string {
  return FLOWER_NAME[rank(k) - 1]
}

const CAT_ORDER = { m: 0, p: 1, s: 2, z: 3, f: 4 }
export function sortKey(k: Kind): number {
  return CAT_ORDER[cat(k)] * 10 + rank(k)
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return tiles.sort((a, b) => sortKey(a.kind) - sortKey(b.kind) || a.id - b.id)
}

/** 起始牌山：萬筒條 1–9 各 4 張 */
export function starterKinds(): Kind[] {
  const out: Kind[] = []
  for (const s of SUITS) for (let r = 1; r <= 9; r++) for (let i = 0; i < 4; i++) out.push(`${s}${r}`)
  return out
}
