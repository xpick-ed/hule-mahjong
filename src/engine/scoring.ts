// 台數計算。同一手牌如果有好幾種拆法，取台數最高的。
// 莊家台（莊家 1 台＋連 n 拉 n）跟「誰付錢」有關，另外在 match.ts 算。

import { decompose, isLigu, toCounts, waits, type Decomp } from './analysis'
import { cat, idx, isDragon, isFlower, isHonor, isSuited, isWind, KINDS, rank, type Kind, type Tile } from './tiles'

export type MeldType = 'chow' | 'pung' | 'kong'

export interface Meld {
  type: MeldType
  tiles: Tile[]
  /** 暗槓 */
  concealed?: boolean
  /** 從誰那裡吃碰來的 */
  from?: number
}

export interface TaiItem {
  name: string
  tai: number
}

export interface WinContext {
  /** 手上的牌（含胡的那張） */
  hand: readonly Tile[]
  melds: readonly Meld[]
  flowers: readonly Tile[]
  winTile: Kind
  tsumo: boolean
  seatWind: number
  roundWind: number
  lastTile: boolean
  afterKong: boolean
  /** 天胡（莊家開局就胡）、地胡（閒家第一次摸牌就胡、之前沒人吃碰） */
  heaven: boolean
  earth: boolean
  eightFlowers?: boolean
  /** 七搶一：搶了別人的第八張花 */
  robFlower?: boolean
  /** 搶槓胡：胡別人加槓的那張 */
  robKong?: boolean
}

export interface WinScore {
  items: TaiItem[]
  total: number
}

const WIND_KIND = ['z1', 'z2', 'z3', 'z4']
const kindAt = (i: number) => KINDS[i]

function common(ctx: WinContext): TaiItem[] {
  const items: TaiItem[] = []
  const closed = ctx.melds.every((m) => m.concealed)
  if (closed && ctx.tsumo) items.push({ name: '門清自摸', tai: 3 })
  else {
    if (closed) items.push({ name: '門清', tai: 1 })
    if (ctx.tsumo) items.push({ name: '自摸', tai: 1 })
  }
  const flowers = ctx.flowers.map((f) => rank(f.kind))
  const own = flowers.filter((r) => (r - 1) % 4 === ctx.seatWind).length
  if (own) items.push({ name: own > 1 ? `正花 ×${own}` : '正花', tai: own })
  if ([1, 2, 3, 4].every((r) => flowers.includes(r))) items.push({ name: '春夏秋冬', tai: 2 })
  if ([5, 6, 7, 8].every((r) => flowers.includes(r))) items.push({ name: '梅蘭竹菊', tai: 2 })
  if (ctx.afterKong && ctx.tsumo) items.push({ name: '槓上開花', tai: 1 })
  if (ctx.robKong) items.push({ name: '搶槓', tai: 1 })
  if (ctx.lastTile) items.push(ctx.tsumo ? { name: '海底撈月', tai: 1 } : { name: '河底撈魚', tai: 1 })
  if (ctx.heaven) items.push({ name: '天胡', tai: 16 })
  if (ctx.earth) items.push({ name: '地胡', tai: 16 })
  return items
}

function suitItems(kinds: Kind[]): TaiItem[] {
  const suits = new Set(kinds.filter(isSuited).map(cat))
  const honor = kinds.some(isHonor)
  if (suits.size === 0) return [{ name: '字一色', tai: 16 }]
  if (suits.size === 1) return [honor ? { name: '混一色', tai: 4 } : { name: '清一色', tai: 8 }]
  return []
}

interface G {
  type: MeldType
  kind: Kind
  concealed: boolean
}

function groupItems(ctx: WinContext, d: Decomp, singleWait: boolean): TaiItem[] {
  const items: TaiItem[] = []
  const groups: G[] = [
    ...ctx.melds.map((m) => ({ type: m.type, kind: m.tiles[0].kind, concealed: !!m.concealed })),
    ...d.groups.map((g) => ({ type: g.type as MeldType, kind: kindAt(g.i), concealed: true })),
  ]
  const pairKind = kindAt(d.pair)
  const triplets = groups.filter((g) => g.type !== 'chow')

  if (groups.every((g) => g.type === 'chow') && !isHonor(pairKind) && ctx.flowers.length === 0 && !ctx.tsumo && !singleWait) {
    items.push({ name: '平胡', tai: 2 })
  }
  if (triplets.length === 5) items.push({ name: '碰碰胡', tai: 4 })
  if (ctx.melds.length === 5 && ctx.melds.every((m) => !m.concealed) && !ctx.tsumo) items.push({ name: '全求人', tai: 2 })

  // 暗刻：手上的刻子＋暗槓；放槍胡的那張如果剛好湊成刻子，那組算明刻
  let hidden = triplets.filter((g) => g.concealed).length
  if (!ctx.tsumo && d.groups.some((g) => g.type === 'pung' && kindAt(g.i) === ctx.winTile)) hidden--
  if (hidden >= 5) items.push({ name: '五暗刻', tai: 8 })
  else if (hidden === 4) items.push({ name: '四暗刻', tai: 5 })
  else if (hidden === 3) items.push({ name: '三暗刻', tai: 2 })

  const dragons = triplets.filter((g) => isDragon(g.kind)).map((g) => g.kind)
  if (dragons.length === 3) items.push({ name: '大三元', tai: 8 })
  else if (dragons.length === 2 && isDragon(pairKind)) items.push({ name: '小三元', tai: 4 })
  else for (const k of dragons) items.push({ name: `${{ z5: '紅中', z6: '青發', z7: '白板' }[k]}`, tai: 1 })

  const winds = triplets.filter((g) => isWind(g.kind)).map((g) => g.kind)
  if (winds.length === 4) items.push({ name: '大四喜', tai: 16 })
  else if (winds.length === 3 && isWind(pairKind)) items.push({ name: '小四喜', tai: 8 })
  else {
    if (winds.includes(WIND_KIND[ctx.roundWind])) items.push({ name: '圈風', tai: 1 })
    if (winds.includes(WIND_KIND[ctx.seatWind])) items.push({ name: '門風', tai: 1 })
  }
  return items
}

const sum = (items: TaiItem[]) => items.reduce((s, x) => s + x.tai, 0)

/** 算一手胡牌的台數（不含莊家台） */
export function scoreWin(ctx: WinContext): WinScore {
  const base = common(ctx)
  const allKinds = [...ctx.hand, ...ctx.melds.flatMap((m) => m.tiles)].map((t) => t.kind).filter((k) => !isFlower(k))

  if (ctx.eightFlowers) {
    const items = [
      ctx.robFlower ? { name: '七搶一', tai: 8 } : { name: '八仙過海', tai: 8 },
      ...base.filter((x) => x.name !== '門清' && x.name !== '門清自摸'),
    ]
    return { items, total: sum(items) }
  }

  const n = 5 - ctx.melds.length
  const c = toCounts(ctx.hand)
  // 胡之前聽幾種牌（獨聽）
  const before = toCounts(ctx.hand)
  before[idx(ctx.winTile)]--
  const singleWait = waits(before, n).length === 1

  const candidates: TaiItem[][] = []
  for (const d of decompose(c, n)) {
    candidates.push([...base, ...groupItems(ctx, d, singleWait), ...suitItems(allKinds)])
  }
  if (n === 5 && isLigu(c)) candidates.push([...base, { name: '嚦咕嚦咕', tai: 8 }, ...suitItems(allKinds)])
  let best = candidates[0] ?? base
  for (const cand of candidates) if (sum(cand) > sum(best)) best = cand
  if (singleWait && !best.some((x) => x.name === '平胡')) best = [...best, { name: '獨聽', tai: 1 }]
  return { items: best, total: sum(best) }
}

/** 莊家台：莊家 1 台＋連 n 拉 n */
export function dealerItems(streak: number): TaiItem[] {
  const items = [{ name: '莊家', tai: 1 }]
  if (streak > 0) items.push({ name: `連${streak}拉${streak}`, tai: 2 * streak })
  return items
}
