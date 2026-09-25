import type { Meld, MeldType, Table } from './melds'
import type { PatternId } from './patterns'
import type { Enh, Kind, Tile } from './tiles'

export type Phase = 'round' | 'cashout' | 'shop' | 'gameover' | 'victory'

export interface GodInst {
  uid: number
  id: string
  /** 會成長的神明用來記數（例如太上老君胡過幾次清一色） */
  n?: number
}

export interface ItemInst {
  uid: number
  id: string
}

// 計分的每一步。c / m 是這一步之後的「分」和「台」，介面照著播就好。
export type Step = { c: number; m: number } & (
  | { t: 'meld'; i: number; chips: number; debuff?: boolean }
  | { t: 'tile'; id: number; chips: number; mult?: number; debuff?: boolean }
  | { t: 'pattern'; id: PatternId; count: number; mult: number }
  | { t: 'god'; uid: number; tileId?: number; chips?: number; mult?: number; xmult?: number; coins?: number }
)

export interface ScoreResult {
  kind: 'hu' | 'draw'
  steps: Step[]
  chips: number
  mult: number
  score: number
  patterns: { id: PatternId; count: number; mult: number }[]
  /** 這一手額外拿到的銅錢（財神爺之類） */
  coins: number
}

export interface RoundState {
  wind: number
  no: number
  target: number
  boss: string | null
  pile: Tile[]
  hand: Tile[]
  table: Table
  flowers: Tile[]
  handSize: number
  discardsLeft: number
  /** 本局總共換過幾次（呂洞賓用） */
  discardsUsed: number
  /** 這一手換過幾次（一氣呵成用） */
  discardsThisHand: number
  freeDiscardUsed: boolean
  total: number
  hands: number
  lastWasKong: boolean
  /** play：正在打；hu / draw：已經算好分，等畫面播完再 resolve */
  status: 'play' | 'hu' | 'draw'
  score: ScoreResult | null
}

export interface CashoutLine {
  label: string
  coins: number
}

export interface Cashout {
  lines: CashoutLine[]
  total: number
}

export type ShopSlot =
  | { kind: 'god'; id: string; price: number; sold?: boolean }
  | { kind: 'item'; id: string; price: number; sold?: boolean }
  | { kind: 'tile'; tile: { kind: Kind; enh?: Enh }; price: number; sold?: boolean }

export interface ShopState {
  slots: ShopSlot[]
  rerollCost: number
}

export interface RunStats {
  bestHand: number
  hus: number
  rounds: number
}

export interface RunState {
  version: 1
  seed: string
  rng: number
  deck: Tile[]
  nextId: number
  gods: GodInst[]
  items: ItemInst[]
  /** 牌譜等級。key 是面子種類或牌型 id，沒有就是 1 級 */
  levels: Partial<Record<MeldType | PatternId, number>>
  coins: number
  /** 目前在第幾圈（0 = 東）、第幾局（0–3） */
  wind: number
  no: number
  /** 每一圈魔王局的魔王 */
  bosses: string[]
  phase: Phase
  round: RoundState | null
  cashout: Cashout | null
  shop: ShopState | null
  stats: RunStats
  endless: boolean
}

export type { Meld }
