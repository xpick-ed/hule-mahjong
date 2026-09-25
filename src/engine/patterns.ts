import { chowStart, type Meld } from './melds'
import { cat, isDragon, isHonor, isSuited, isWind, isYaoJiu, type Kind } from './tiles'

export type PatternId =
  | 'hu'
  | 'pinghu'
  | 'duanyao'
  | 'quandai'
  | 'yibangao'
  | 'yitiaolong'
  | 'sanse'
  | 'duidui'
  | 'hunyise'
  | 'qingyise'
  | 'ziyise'
  | 'sanyuan'
  | 'quanfeng'
  | 'xiaosanyuan'
  | 'dasanyuan'
  | 'xiaosixi'
  | 'dasixi'
  | 'gangshang'
  | 'yiqi'
  | 'flower'

export interface PatternDef {
  id: PatternId
  name: string
  desc: string
  /** 一級的台數 */
  base: number
  /** 每升一級多幾台 */
  perLevel: number
}

// 順序 = 計分時亮出的順序
export const PATTERNS: readonly PatternDef[] = [
  { id: 'hu', name: '胡牌', desc: '湊滿 4 組面子＋雀頭', base: 1, perLevel: 1 },
  { id: 'pinghu', name: '平胡', desc: '4 組都是順子，雀頭不是字牌', base: 2, perLevel: 1 },
  { id: 'duanyao', name: '斷么九', desc: '沒有 1、9、字牌', base: 1, perLevel: 1 },
  { id: 'quandai', name: '全帶么', desc: '每一組都含 1、9 或字牌', base: 2, perLevel: 1 },
  { id: 'yibangao', name: '一般高', desc: '兩組一模一樣的順子', base: 1, perLevel: 1 },
  { id: 'yitiaolong', name: '一條龍', desc: '同花色 123、456、789', base: 3, perLevel: 2 },
  { id: 'sanse', name: '三色同順', desc: '萬筒條同點數的順子', base: 3, perLevel: 2 },
  { id: 'duidui', name: '對對胡', desc: '4 組都是刻子或槓', base: 4, perLevel: 2 },
  { id: 'hunyise', name: '混一色', desc: '只有一種花色＋字牌', base: 4, perLevel: 2 },
  { id: 'qingyise', name: '清一色', desc: '只有一種花色', base: 8, perLevel: 3 },
  { id: 'ziyise', name: '字一色', desc: '全部都是字牌', base: 16, perLevel: 4 },
  { id: 'sanyuan', name: '三元牌', desc: '中、發、白的刻子，每組', base: 1, perLevel: 1 },
  { id: 'quanfeng', name: '圈風', desc: '本圈風牌的刻子', base: 1, perLevel: 1 },
  { id: 'xiaosanyuan', name: '小三元', desc: '兩組三元刻子＋三元雀頭', base: 4, perLevel: 2 },
  { id: 'dasanyuan', name: '大三元', desc: '三組三元刻子', base: 8, perLevel: 3 },
  { id: 'xiaosixi', name: '小四喜', desc: '三組風刻子＋風雀頭', base: 8, perLevel: 3 },
  { id: 'dasixi', name: '大四喜', desc: '四組風刻子', base: 16, perLevel: 4 },
  { id: 'gangshang', name: '槓上開花', desc: '最後放上桌的是槓', base: 2, perLevel: 1 },
  { id: 'yiqi', name: '一氣呵成', desc: '這一手完全沒換牌', base: 2, perLevel: 1 },
  { id: 'flower', name: '花牌', desc: '這一手摸到的花，每張', base: 1, perLevel: 1 },
]

export const PATTERN: Record<PatternId, PatternDef> = Object.fromEntries(PATTERNS.map((p) => [p.id, p])) as Record<
  PatternId,
  PatternDef
>

export interface PatternHit {
  id: PatternId
  count: number
}

export interface HandShape {
  melds: readonly Meld[]
  eye: Meld
  flowers: number
  /** 本圈風牌，例如東圈 = z1 */
  roundWind: Kind
  lastWasKong: boolean
  discardsThisHand: number
}

export function detectPatterns(h: HandShape): PatternHit[] {
  const hits: PatternHit[] = [{ id: 'hu', count: 1 }]
  const add = (id: PatternId, count = 1) => hits.push({ id, count })

  const groups = [...h.melds, h.eye]
  const kinds = groups.flatMap((g) => g.tiles.map((t) => t.kind))
  const chows = h.melds.filter((m) => m.type === 'chow')
  const triplets = h.melds.filter((m) => m.type === 'pung' || m.type === 'kong')
  const eyeKind = h.eye.tiles[0].kind

  if (chows.length === 4 && !isHonor(eyeKind)) add('pinghu')
  if (kinds.every((k) => !isYaoJiu(k))) add('duanyao')
  if (groups.every((g) => g.tiles.some((t) => isYaoJiu(t.kind)))) add('quandai')

  const starts = chows.map(chowStart)
  if (new Set(starts).size < starts.length) add('yibangao')
  for (const s of ['m', 'p', 's']) {
    if (starts.includes(`${s}1`) && starts.includes(`${s}4`) && starts.includes(`${s}7`)) {
      add('yitiaolong')
      break
    }
  }
  for (let r = 1; r <= 7; r++) {
    if (starts.includes(`m${r}`) && starts.includes(`p${r}`) && starts.includes(`s${r}`)) {
      add('sanse')
      break
    }
  }

  if (triplets.length === 4) add('duidui')

  const suits = new Set(kinds.filter(isSuited).map(cat))
  const hasHonor = kinds.some(isHonor)
  if (suits.size === 1 && hasHonor) add('hunyise')
  if (suits.size === 1 && !hasHonor) add('qingyise')
  if (suits.size === 0) add('ziyise')

  const tripletKinds = triplets.map((m) => m.tiles[0].kind)
  const dragonTriplets = tripletKinds.filter(isDragon).length
  const windTriplets = tripletKinds.filter(isWind).length
  if (dragonTriplets > 0) add('sanyuan', dragonTriplets)
  if (tripletKinds.includes(h.roundWind)) add('quanfeng')
  if (dragonTriplets === 3) add('dasanyuan')
  else if (dragonTriplets === 2 && isDragon(eyeKind)) add('xiaosanyuan')
  if (windTriplets === 4) add('dasixi')
  else if (windTriplets === 3 && isWind(eyeKind)) add('xiaosixi')

  if (h.lastWasKong) add('gangshang')
  if (h.discardsThisHand === 0) add('yiqi')
  if (h.flowers > 0) add('flower', h.flowers)

  return hits
}

/** 某牌型在某等級時的台數 */
export function patternMult(id: PatternId, level: number): number {
  const p = PATTERN[id]
  return p.base + (level - 1) * p.perLevel
}

