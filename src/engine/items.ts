import { MELD_NAME, type MeldType } from './melds'
import { PATTERN, type PatternId } from './patterns'
import { cat, isSuited, rank, type Suit, type Tile } from './tiles'

/** 道具作用時可以做的事（由 game.ts 提供，會同時改牌山和這一局手上的牌） */
export interface ItemOps {
  coins: number
  targets: Tile[]
  setTile(id: number, patch: Partial<Tile>): void
  removeTile(id: number): void
  addCoins(n: number): void
  summonGod(): boolean
  levelUp(key: MeldType | PatternId): void
}

export interface ItemDef {
  id: string
  name: string
  kind: 'talisman' | 'manual'
  price: number
  desc: string
  /** 需要選幾張手牌；沒有就是不用選牌、隨時可用 */
  min?: number
  max?: number
  /** 只能選數牌 */
  suitedOnly?: boolean
  /** 牌譜升級的對象 */
  level?: MeldType | PatternId
  /** 失敗回傳原因 */
  apply: (ops: ItemOps) => string | void
}

const toSuit = (s: Suit, name: string): ItemDef => ({
  id: `to-${s}`,
  name,
  kind: 'talisman',
  price: 3,
  desc: `最多 3 張數牌改成${{ m: '萬', p: '筒', s: '條' }[s]}子（點數不變）`,
  min: 1,
  max: 3,
  suitedOnly: true,
  apply: (o) => o.targets.forEach((t) => o.setTile(t.id, { kind: `${s}${rank(t.kind)}` })),
})

export const TALISMANS: readonly ItemDef[] = [
  {
    id: 'gold',
    name: '點金符',
    kind: 'talisman',
    price: 3,
    desc: '1 張牌變成金牌（過關時還在手上 +3 銅錢）',
    min: 1,
    max: 1,
    apply: (o) => o.targets.forEach((t) => o.setTile(t.id, { enh: 'gold' })),
  },
  {
    id: 'jade',
    name: '玉符',
    kind: 'talisman',
    price: 3,
    desc: '最多 2 張牌變成玉牌（計分時 +2 台）',
    min: 1,
    max: 2,
    apply: (o) => o.targets.forEach((t) => o.setTile(t.id, { enh: 'jade' })),
  },
  {
    id: 'clone',
    name: '分身符',
    kind: 'talisman',
    price: 3,
    desc: '選 2 張：先選的那張變成後選那張的複製',
    min: 2,
    max: 2,
    apply: (o) => {
      const [a, b] = o.targets
      o.setTile(a.id, { kind: b.kind, enh: b.enh })
    },
  },
  toSuit('m', '萬化符'),
  toSuit('p', '筒化符'),
  toSuit('s', '條化符'),
  {
    id: 'cut',
    name: '斷捨符',
    kind: 'talisman',
    price: 3,
    desc: '最多 2 張牌從牌山永久移除',
    min: 1,
    max: 2,
    apply: (o) => o.targets.forEach((t) => o.removeTile(t.id)),
  },
  {
    id: 'rankup',
    name: '點石符',
    kind: 'talisman',
    price: 3,
    desc: '最多 2 張數牌點數 +1（9 變 1）',
    min: 1,
    max: 2,
    suitedOnly: true,
    apply: (o) => o.targets.forEach((t) => o.setTile(t.id, { kind: `${cat(t.kind)}${(rank(t.kind) % 9) + 1}` })),
  },
  {
    id: 'wealth',
    name: '招財符',
    kind: 'talisman',
    price: 4,
    desc: '銅錢加倍（最多 +20）',
    apply: (o) => o.addCoins(Math.min(o.coins, 20)),
  },
  {
    id: 'summon',
    name: '請神符',
    kind: 'talisman',
    price: 4,
    desc: '隨機請來一位普通神明（神龕要有空位）',
    apply: (o) => (o.summonGod() ? undefined : '神龕滿了'),
  },
]

const MELD_STEP: Record<MeldType, number> = { pair: 5, chow: 10, pung: 15, kong: 25 }
export const MELD_BASE: Record<MeldType, number> = { pair: 5, chow: 10, pung: 20, kong: 40 }

export function meldBase(type: MeldType, level: number): number {
  return MELD_BASE[type] + (level - 1) * MELD_STEP[type]
}

const meldManual = (type: MeldType): ItemDef => ({
  id: `lv-${type}`,
  name: `${type === 'pair' ? '雀頭' : MELD_NAME[type]}譜`,
  kind: 'manual',
  price: 3,
  desc: `${type === 'pair' ? '雀頭' : MELD_NAME[type]}底分 +${MELD_STEP[type]}`,
  level: type,
  apply: (o) => o.levelUp(type),
})

const patternManual = (id: PatternId): ItemDef => ({
  id: `lv-${id}`,
  name: `${PATTERN[id].name}譜`,
  kind: 'manual',
  price: 3,
  desc: `${PATTERN[id].name} +${PATTERN[id].perLevel} 台`,
  level: id,
  apply: (o) => o.levelUp(id),
})

export const MANUALS: readonly ItemDef[] = [
  meldManual('chow'),
  meldManual('pung'),
  meldManual('kong'),
  meldManual('pair'),
  ...(['hu', 'pinghu', 'duanyao', 'quandai', 'yibangao', 'yitiaolong', 'sanse', 'duidui', 'hunyise', 'qingyise', 'yiqi'] as const).map(
    patternManual,
  ),
]

export const ITEMS: Record<string, ItemDef> = Object.fromEntries([...TALISMANS, ...MANUALS].map((i) => [i.id, i]))

export const MAX_ITEMS = 2

/** 檢查選的牌能不能用這個道具，不行就回傳原因 */
export function checkTargets(def: ItemDef, targets: Tile[]): string | null {
  if (def.min === undefined) return null
  if (targets.length < def.min || targets.length > (def.max ?? def.min)) {
    return def.min === def.max ? `要選 ${def.min} 張牌` : `要選 ${def.min}–${def.max} 張牌`
  }
  if (def.suitedOnly && targets.some((t) => !isSuited(t.kind))) return '只能選數牌'
  return null
}
