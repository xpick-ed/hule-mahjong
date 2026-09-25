// 闖關：一關一個場景、三個對手、底／台。拿第一過關，解鎖下一關和一款桌布。

export interface Stage {
  id: number
  name: string
  place: string
  opponents: [string, string, string]
  base: number
  perTai: number
  startPoints: number
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
    opponents: ['queshen', 'longge', 'coco'],
    base: 2000,
    perTai: 500,
    startPoints: 100000,
    reward: SKINS.gold,
  },
]
