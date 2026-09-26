// 你自己的造型：髮型、髮色、膚色、衣服、背景、配件。有些免費，有些用金幣買，皇冠要拿全國錦標賽冠軍。

import type { Extra, Look } from './engine/characters'
import { SLOT } from './engine/looks'
import type { Progress } from './progress'

export type WardrobeTab = 'hair' | 'hairColor' | 'skin' | 'shirt' | 'bg' | 'extra'

export interface WardrobeItem {
  /** `${種類}:${值}`，買過的記在 progress.wardrobe */
  id: string
  tab: WardrobeTab
  name: string
  value: string
  price: number
  /** 要先拿到這個成就才能穿 */
  unlock?: { ach: string; text: string }
}

export const WARDROBE_TABS: readonly [WardrobeTab, string][] = [
  ['hair', '髮型'],
  ['hairColor', '髮色'],
  ['skin', '膚色'],
  ['shirt', '衣服'],
  ['bg', '背景'],
  ['extra', '配件'],
]

const item = (tab: WardrobeTab, value: string, name: string, price = 0, unlock?: WardrobeItem['unlock']): WardrobeItem => ({
  id: `${tab}:${value}`,
  tab,
  name,
  value,
  price,
  ...(unlock ? { unlock } : {}),
})

export const WARDROBE: readonly WardrobeItem[] = [
  item('hair', 'short', '短髮'),
  item('hair', 'long', '長髮'),
  item('hair', 'bob', '鮑伯頭'),
  item('hair', 'ponytail', '馬尾'),
  item('hair', 'spiky', '刺蝟頭', 120),
  item('hair', 'slick', '油頭', 120),
  item('hair', 'bun', '包包頭', 120),
  item('hair', 'perm', '燙捲', 150),
  item('hair', 'bald', '光頭', 150),

  item('hairColor', '#1d2a4a', '黑'),
  item('hairColor', '#3b2a3f', '深棕'),
  item('hairColor', '#6b4a2e', '棕'),
  item('hairColor', '#9aa0a6', '灰'),
  item('hairColor', '#d9a441', '金', 100),
  item('hairColor', '#b8323f', '酒紅', 100),
  item('hairColor', '#ff8fa3', '粉紅', 150),
  item('hairColor', '#3a6df0', '藍', 150),
  item('hairColor', '#13a37f', '綠', 150),

  item('skin', '#f6c9a8', '淺'),
  item('skin', '#e8b48f', '中'),
  item('skin', '#d49a6a', '小麥'),
  item('skin', '#a86f4c', '深'),

  item('shirt', '#ef3d5c', '紅'),
  item('shirt', '#3a6df0', '藍'),
  item('shirt', '#13a37f', '綠'),
  item('shirt', '#ffb020', '黃'),
  item('shirt', '#1d2a4a', '深藍'),
  item('shirt', '#f4f4f4', '白'),
  item('shirt', '#8b5cf6', '紫', 60),
  item('shirt', '#ff8fa3', '粉紅', 60),
  item('shirt', '#2b2f3a', '黑', 60),

  item('bg', '#e6edff', '天空'),
  item('bg', '#ffe3ea', '草莓'),
  item('bg', '#e4f6ef', '薄荷'),
  item('bg', '#fff1d6', '奶茶'),
  item('bg', '#ece3ff', '葡萄'),
  item('bg', '#eef1f7', '灰'),

  item('extra', 'glasses', '眼鏡'),
  item('extra', 'sunglasses', '墨鏡', 150),
  item('extra', 'cap', '棒球帽', 100),
  item('extra', 'helmet', '安全帽', 200),
  item('extra', 'douli', '斗笠', 200),
  item('extra', 'headband', '必勝頭巾', 150),
  item('extra', 'headphones', '耳機', 150),
  item('extra', 'bow', '蝴蝶結', 80),
  item('extra', 'hairflower', '髮花', 100),
  item('extra', 'earrings', '耳環', 80),
  item('extra', 'mustache', '小鬍子', 80),
  item('extra', 'beard', '大鬍子', 120),
  item('extra', 'tie', '領帶', 80),
  item('extra', 'crown', '皇冠', 0, { ach: 'tourneyChamp', text: '拿到全國錦標賽冠軍' }),
]

export const WARDROBE_ITEM: Record<string, WardrobeItem> = Object.fromEntries(WARDROBE.map((x) => [x.id, x]))

/** 已經可以穿（免費、買過、或達成條件） */
export function owns(p: Progress, it: WardrobeItem): boolean {
  if (it.unlock) return !!p.ach[it.unlock.ach]
  return it.price === 0 || p.wardrobe.includes(it.id)
}

/** 這個造型用到哪些東西 */
export function itemsOf(look: Look): WardrobeItem[] {
  const ids = [`hair:${look.hair}`, `hairColor:${look.hairColor}`, `skin:${look.skin}`, `shirt:${look.shirt}`, `bg:${look.bg}`, ...(look.extras ?? []).map((e) => `extra:${e}`)]
  return ids.map((id) => WARDROBE_ITEM[id]).filter(Boolean)
}

/** 換成這個造型還要花多少錢、還有哪些沒解鎖 */
export function costOf(p: Progress, look: Look): { coins: number; buy: WardrobeItem[]; locked: WardrobeItem[] } {
  const need = itemsOf(look).filter((it) => !owns(p, it))
  const locked = need.filter((it) => it.unlock)
  const buy = need.filter((it) => !it.unlock)
  return { coins: buy.reduce((s, it) => s + it.price, 0), buy, locked }
}

/** 試穿：選一樣東西（配件再點一次拿掉；同一個位置的換掉） */
export function tryOn(look: Look, it: WardrobeItem): Look {
  if (it.tab !== 'extra') return { ...look, [it.tab]: it.value } as Look
  const ex = it.value as Extra
  const cur = look.extras ?? []
  if (cur.includes(ex)) return { ...look, extras: cur.filter((x) => x !== ex) }
  return { ...look, extras: [...cur.filter((x) => SLOT[x] !== SLOT[ex]), ex] }
}

/** 這樣東西有沒有穿在身上 */
export function wearing(look: Look, it: WardrobeItem): boolean {
  if (it.tab === 'extra') return (look.extras ?? []).includes(it.value as Extra)
  return (look as unknown as Record<string, string>)[it.tab] === it.value
}
