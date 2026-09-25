import { cat, isFlower, isSuited, rank, sortKey, type Tile } from './tiles'

export type MeldType = 'pair' | 'chow' | 'pung' | 'kong'

export interface Meld {
  type: MeldType
  tiles: Tile[]
}

export interface Table {
  melds: Meld[]
  eye: Meld | null
}

export const MELD_NAME: Record<MeldType, string> = {
  pair: '對子',
  chow: '順子',
  pung: '刻子',
  kong: '槓',
}

export const MAX_MELDS = 4

/** 這幾張牌能組成什麼？組不成回傳 null */
export function classify(tiles: readonly Tile[]): MeldType | null {
  if (tiles.length < 2 || tiles.length > 4) return null
  if (tiles.some((t) => isFlower(t.kind))) return null
  const kinds = tiles.map((t) => t.kind).sort((a, b) => sortKey(a) - sortKey(b))
  const same = kinds.every((k) => k === kinds[0])
  if (same) return tiles.length === 2 ? 'pair' : tiles.length === 3 ? 'pung' : 'kong'
  if (tiles.length === 3 && kinds.every(isSuited) && kinds.every((k) => cat(k) === cat(kinds[0]))) {
    const r = kinds.map(rank)
    if (r[1] === r[0] + 1 && r[2] === r[1] + 1) return 'chow'
  }
  return null
}

export function fits(type: MeldType, table: Table): boolean {
  return type === 'pair' ? table.eye === null : table.melds.length < MAX_MELDS
}

export function isComplete(table: Table): boolean {
  return table.eye !== null && table.melds.length === MAX_MELDS
}

/** 手牌裡還有沒有任何一組能放上桌 */
export function canPlayAny(hand: readonly Tile[], table: Table): boolean {
  const count = new Map<string, number>()
  for (const t of hand) if (!isFlower(t.kind)) count.set(t.kind, (count.get(t.kind) ?? 0) + 1)
  const needEye = table.eye === null
  const needMeld = table.melds.length < MAX_MELDS
  for (const n of count.values()) {
    if (needEye && n >= 2) return true
    if (needMeld && n >= 3) return true
  }
  if (needMeld) {
    for (const s of ['m', 'p', 's']) {
      for (let r = 1; r <= 7; r++) {
        if (count.has(`${s}${r}`) && count.has(`${s}${r + 1}`) && count.has(`${s}${r + 2}`)) return true
      }
    }
  }
  return false
}

/** 順子的起點（最小那張的種類），例如 m345 → m3 */
export function chowStart(m: Meld): string {
  return m.tiles.map((t) => t.kind).sort((a, b) => sortKey(a) - sortKey(b))[0]
}
