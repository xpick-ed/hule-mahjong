// 闖關：一關一個場景、三個對手、底／台。拿第一過關，解鎖下一關和一款桌布。

import type { SkillId } from './match'

export type StageRule = 'raffle' | 'newyear' | 'boss' | 'storm' | 'final'

export interface Stage {
  id: number
  name: string
  place: string
  /** 這一關的特別規則 */
  rule?: StageRule
  ruleText?: string
  opponents: [string, string, string]
  base: number
  perTai: number
  startPoints: number
  /** 打幾圈（1 = 東風圈；2 = 東風、南風兩圈） */
  rounds?: number
  /** 全國錦標賽的第幾站（1–3）；闖關的關卡沒有 */
  tournament?: number
  /** 這一站可以用的特別道具（各一次，每次開打重新發） */
  items?: SkillId[]
  /** 過關解鎖的桌布 */
  reward: TableSkin
}

export interface TableSkin {
  id: string
  name: string
  color: string
  rim: string
  edge: string
}

export const SKINS: Record<string, TableSkin> = {
  mint: { id: 'mint', name: '薄荷綠', color: '#33c2a0', rim: '#2aa98b', edge: '#1f8a70' },
  sky: { id: 'sky', name: '汽水藍', color: '#4aa3f0', rim: '#3a8fdb', edge: '#2a73b8' },
  peach: { id: 'peach', name: '蜜桃橘', color: '#ff8a65', rim: '#f0764f', edge: '#d35d38' },
  grape: { id: 'grape', name: '葡萄紫', color: '#8b5cf6', rim: '#7a49ea', edge: '#5f33c4' },
  gold: { id: 'gold', name: '雀神金', color: '#f2b705', rim: '#dca300', edge: '#b58500' },
  storm: { id: 'storm', name: '颱風藍', color: '#3c6e9e', rim: '#2f5d8a', edge: '#214669' },
  ruby: { id: 'ruby', name: '冠軍紅', color: '#d7263d', rim: '#bd1f33', edge: '#951628' },
  cup: { id: 'cup', name: '錦標綠金', color: '#1f7a55', rim: '#18664a', edge: '#0f4d36' },
}

export const STAGES: readonly Stage[] = [
  {
    id: 0,
    name: '巷口麻將',
    place: '美髮院樓上，冷氣很強',
    opponents: ['meiling', 'lin', 'kai'],
    base: 300,
    perTai: 100,
    startPoints: 20000,
    reward: SKINS.sky,
  },
  {
    id: 1,
    name: '公司尾牙',
    place: '餐廳包廂，主管也在',
    rule: 'raffle',
    ruleText: '尾牙摸彩：你胡的牌裡有紅中，就能抽獎拿金幣',
    opponents: ['wang', 'xiaomei', 'jie'],
    base: 500,
    perTai: 200,
    startPoints: 40000,
    reward: SKINS.peach,
  },
  {
    id: 2,
    name: '過年回老家',
    place: '阿嬤家客廳，紅包滿天飛',
    rule: 'newyear',
    ruleText: '過年紅包：自摸的話三家都付兩倍',
    opponents: ['ama', 'erjiu', 'biaomei'],
    base: 1000,
    perTai: 300,
    startPoints: 60000,
    reward: SKINS.grape,
  },
  {
    id: 3,
    name: '雀神挑戰',
    place: '傳說中的地下室牌館',
    rule: 'boss',
    ruleText: '高手過招：對手也會用絕招',
    opponents: ['queshen', 'longge', 'coco'],
    base: 2000,
    perTai: 500,
    startPoints: 100000,
    reward: SKINS.gold,
  },
  {
    id: 4,
    name: '颱風夜民宿',
    place: '海邊民宿客廳，外面風雨交加',
    rule: 'storm',
    ruleText: '颱風假打通宵：打東風、南風兩圈',
    opponents: ['captain', 'xiuqin', 'leo'],
    base: 2500,
    perTai: 600,
    startPoints: 120000,
    rounds: 2,
    reward: SKINS.storm,
  },
  {
    id: 5,
    name: '全國麻將大賽',
    place: '小巨蛋決賽，全台轉播中',
    rule: 'final',
    ruleText: '決賽加碼：自摸多算 1 台',
    opponents: ['acai', 'nova', 'zheng'],
    base: 3000,
    perTai: 800,
    startPoints: 150000,
    reward: SKINS.ruby,
  },
  // ---------- 全國錦標賽（另外一條路：三站，拿第一才晉級） ----------
  {
    id: 6,
    name: '長春路週賽',
    place: '長春路巷口，每週六下午的老朋友局',
    tournament: 1,
    items: ['lucky', 'swap'],
    ruleText: '特別道具：好運、換牌（各一次）',
    opponents: ['shange', 'daqing', 'chenji'],
    base: 1000,
    perTai: 300,
    startPoints: 50000,
    reward: SKINS.cup,
  },
  {
    id: 7,
    name: '竹東鎮比賽',
    place: '竹東鎮活動中心，鎮上的高手都來了',
    tournament: 2,
    items: ['peek', 'shield'],
    ruleText: '特別道具：偷看、免死金牌（各一次）',
    opponents: ['xiaoliu', 'xiaohao', 'xiaoyuan'],
    base: 2000,
    perTai: 500,
    startPoints: 80000,
    reward: SKINS.cup,
  },
  {
    id: 8,
    name: '全國錦標賽',
    place: '決賽桌，全國的眼睛都在看',
    tournament: 3,
    items: ['double', 'shield'],
    ruleText: '特別道具：加倍卡、免死金牌（各一次）',
    opponents: ['dushen', 'duxia', 'dusheng'],
    base: 5000,
    perTai: 1000,
    startPoints: 200000,
    reward: SKINS.cup,
  },
]

/** 闖關的六關（錦標賽不算）：首頁的關卡、每日挑戰、生存模式、連線房間都用這個 */
export const LADDER = STAGES.filter((s) => !s.tournament)
/** 全國錦標賽的三站 */
export const TOURNEY = STAGES.filter((s) => s.tournament)
