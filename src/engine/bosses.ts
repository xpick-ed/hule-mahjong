import type { MeldType } from './melds'
import { cat, type Tile } from './tiles'

export interface BossDef {
  id: string
  name: string
  desc: string
  handSize?: number
  discards?: number
  targetMult?: number
  /** 這張牌不計分（仍然算牌型） */
  debuffTile?: (t: Tile) => boolean
  /** 這種面子整組不計分 */
  debuffMeld?: (type: MeldType) => boolean
}

export const BOSS_LIST: readonly BossDef[] = [
  { id: 'mengpo', name: '孟婆', desc: '手牌上限 −2', handSize: -2 },
  { id: 'leigong', name: '雷公', desc: '換牌次數 −2', discards: -2 },
  { id: 'niutou', name: '牛頭', desc: '順子不計分', debuffMeld: (m) => m === 'chow' },
  { id: 'mamian', name: '馬面', desc: '刻子、槓不計分', debuffMeld: (m) => m === 'pung' || m === 'kong' },
  { id: 'heiwuchang', name: '黑無常', desc: '萬子不計分', debuffTile: (t) => cat(t.kind) === 'm' },
  { id: 'panguan', name: '判官', desc: '筒子不計分', debuffTile: (t) => cat(t.kind) === 'p' },
  { id: 'baiwuchang', name: '白無常', desc: '條子不計分', debuffTile: (t) => cat(t.kind) === 's' },
  { id: 'yanluo', name: '閻羅王', desc: '目標分數 ×1.5', targetMult: 1.5 },
]

/** 北四局固定的最終魔王 */
export const FINAL_BOSS: BossDef = { id: 'xuanwu', name: '玄武', desc: '換牌 −2、手牌上限 −1', discards: -2, handSize: -1 }

export const BOSSES: Record<string, BossDef> = Object.fromEntries(
  [...BOSS_LIST, FINAL_BOSS].map((b) => [b.id, b]),
)
