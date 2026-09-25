import type { Meld } from './melds'
import type { PatternHit } from './patterns'
import { cat, isTerminal, type Tile } from './tiles'
import type { GodInst, RoundState, RunState } from './types'

export type Rarity = 1 | 2 | 3
export const RARITY_NAME: Record<Rarity, string> = { 1: '普通', 2: '少見', 3: '稀有' }

export interface HandCtx {
  run: RunState
  round: RoundState
  melds: readonly Meld[]
  eye: Meld
  patterns: readonly PatternHit[]
}

export interface Effect {
  chips?: number
  mult?: number
  xmult?: number
  coins?: number
}

export interface GodDef {
  id: string
  name: string
  rarity: Rarity
  price: number
  desc: string
  /** 被動：手牌上限、換牌次數、過關時每剩一次換牌多拿幾枚、第一次換牌免費 */
  handSize?: number
  discards?: number
  cashoutPerDiscard?: number
  freeFirstDiscard?: boolean
  /** 每張計分的牌觸發一次 */
  onTile?: (tile: Tile) => Effect | null
  /** 胡牌時，牌型之後、由左到右觸發 */
  onHand?: (ctx: HandCtx, inst: GodInst) => Effect | null
  /** 會變動的數字，顯示在說明下面 */
  status?: (inst: GodInst, run: RunState) => string
}

const has = (ctx: HandCtx, id: PatternHit['id']) => ctx.patterns.some((p) => p.id === id)

export const GOD_LIST: readonly GodDef[] = [
  {
    id: 'fu',
    name: '福星',
    rarity: 1,
    price: 5,
    desc: '每張計分的萬子 +4 分',
    onTile: (t) => (cat(t.kind) === 'm' ? { chips: 4 } : null),
  },
  {
    id: 'lu',
    name: '祿星',
    rarity: 1,
    price: 5,
    desc: '每張計分的筒子 +4 分',
    onTile: (t) => (cat(t.kind) === 'p' ? { chips: 4 } : null),
  },
  {
    id: 'shou',
    name: '壽星',
    rarity: 1,
    price: 5,
    desc: '每張計分的條子 +4 分',
    onTile: (t) => (cat(t.kind) === 's' ? { chips: 4 } : null),
  },
  {
    id: 'huye',
    name: '虎爺',
    rarity: 1,
    price: 5,
    desc: '每張計分的 1、9 +6 分',
    onTile: (t) => (isTerminal(t.kind) ? { chips: 6 } : null),
  },
  {
    id: 'yuelao',
    name: '月老',
    rarity: 1,
    price: 4,
    desc: '胡牌時 +4 台',
    onHand: () => ({ mult: 4 }),
  },
  {
    id: 'nezha',
    name: '哪吒',
    rarity: 1,
    price: 5,
    desc: '每組順子 +1 台',
    onHand: (ctx) => {
      const n = ctx.melds.filter((m) => m.type === 'chow').length
      return n ? { mult: n } : null
    },
  },
  {
    id: 'tudi',
    name: '土地公',
    rarity: 1,
    price: 5,
    desc: '每局換牌 +1 次',
    discards: 1,
  },
  {
    id: 'menshen',
    name: '門神',
    rarity: 1,
    price: 5,
    desc: '手牌上限 +1',
    handSize: 1,
  },
  {
    id: 'zaojun',
    name: '灶君',
    rarity: 1,
    price: 4,
    desc: '過關時，每剩 1 次換牌再 +2 銅錢',
    cashoutPerDiscard: 2,
  },
  {
    id: 'guangong',
    name: '關公',
    rarity: 2,
    price: 6,
    desc: '每組刻子或槓 +3 台',
    onHand: (ctx) => {
      const n = ctx.melds.filter((m) => m.type === 'pung' || m.type === 'kong').length
      return n ? { mult: 3 * n } : null
    },
  },
  {
    id: 'wenchang',
    name: '文昌帝君',
    rarity: 2,
    price: 6,
    desc: '斷么九時 +6 台',
    onHand: (ctx) => (has(ctx, 'duanyao') ? { mult: 6 } : null),
  },
  {
    id: 'lvdongbin',
    name: '呂洞賓',
    rarity: 2,
    price: 6,
    desc: '本局每換過一次牌，胡牌時 +2 台',
    onHand: (ctx) => (ctx.round.discardsUsed ? { mult: 2 * ctx.round.discardsUsed } : null),
  },
  {
    id: 'mile',
    name: '彌勒佛',
    rarity: 2,
    price: 6,
    desc: '每持有 5 枚銅錢 +1 台',
    onHand: (ctx) => {
      const n = Math.floor(ctx.run.coins / 5)
      return n ? { mult: n } : null
    },
    status: (_, run) => `目前 +${Math.floor(run.coins / 5)} 台`,
  },
  {
    id: 'guanyin',
    name: '觀音',
    rarity: 2,
    price: 6,
    desc: '每局第一次換牌不用次數',
    freeFirstDiscard: true,
  },
  {
    id: 'caishen',
    name: '財神爺',
    rarity: 2,
    price: 6,
    desc: '每次胡牌 +2 銅錢',
    onHand: () => ({ coins: 2 }),
  },
  {
    id: 'dasheng',
    name: '齊天大聖',
    rarity: 3,
    price: 8,
    desc: '一氣呵成（這一手沒換牌）時 ×3 台',
    onHand: (ctx) => (ctx.round.discardsThisHand === 0 ? { xmult: 3 } : null),
  },
  {
    id: 'laojun',
    name: '太上老君',
    rarity: 3,
    price: 8,
    desc: '每胡一次清一色或混一色，永久 +3 台',
    onHand: (ctx, inst) => {
      if (has(ctx, 'qingyise') || has(ctx, 'hunyise')) inst.n = (inst.n ?? 0) + 1
      return inst.n ? { mult: 3 * inst.n } : null
    },
    status: (inst) => `目前 +${3 * (inst.n ?? 0)} 台`,
  },
  {
    id: 'erlang',
    name: '二郎神',
    rarity: 3,
    price: 8,
    desc: '每組槓 ×2 台',
    onHand: (ctx) => {
      const n = ctx.melds.filter((m) => m.type === 'kong').length
      return n ? { xmult: 2 ** n } : null
    },
  },
  {
    id: 'yuhuang',
    name: '玉皇大帝',
    rarity: 3,
    price: 10,
    desc: '胡牌時 ×2 台',
    onHand: () => ({ xmult: 2 }),
  },
]

export const GODS: Record<string, GodDef> = Object.fromEntries(GOD_LIST.map((g) => [g.id, g]))

export const MAX_GODS = 5
