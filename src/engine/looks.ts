// 頭像的樣子：網頁和房間伺服器共用。連線時你的造型會傳給朋友看，伺服器用 cleanLook 檢查過才轉發。

import type { Extra, Hair, Look } from './characters'

export const HAIRS: readonly Hair[] = ['short', 'long', 'bob', 'ponytail', 'spiky', 'slick', 'bun', 'perm', 'bald']

export const EXTRAS: readonly Extra[] = [
  'glasses',
  'sunglasses',
  'cap',
  'helmet',
  'douli',
  'headband',
  'crown',
  'headphones',
  'bow',
  'hairflower',
  'earrings',
  'mustache',
  'beard',
  'tie',
]

/** 同一個位置只能戴一樣（帽子戴一頂、眼鏡戴一副） */
export const SLOT: Record<Extra, string> = {
  cap: 'head',
  helmet: 'head',
  douli: 'head',
  crown: 'head',
  headband: 'head',
  headphones: 'head',
  glasses: 'eyes',
  sunglasses: 'eyes',
  bow: 'hair',
  hairflower: 'hair',
  earrings: 'ears',
  mustache: 'mustache',
  beard: 'beard',
  tie: 'neck',
}

/** 還沒換過造型時的樣子 */
export const DEFAULT_LOOK: Look = { skin: '#f6c9a8', hair: 'short', hairColor: '#1d2a4a', shirt: '#ef3d5c', bg: '#e6edff', extras: [] }

const HEX = /^#[0-9a-f]{6}$/i

/** 從外面來的造型（存檔、網址、朋友傳來的）：只留認得的東西，不對就回傳 null */
export function cleanLook(x: unknown): Look | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.hair !== 'string' || !HAIRS.includes(o.hair as Hair)) return null
  const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d)
  const extras: Extra[] = []
  for (const e of Array.isArray(o.extras) ? o.extras : []) {
    if (typeof e !== 'string' || !EXTRAS.includes(e as Extra)) continue
    const ex = e as Extra
    // 同一個位置只留第一個
    if (extras.some((y) => SLOT[y] === SLOT[ex])) continue
    extras.push(ex)
  }
  return {
    skin: color(o.skin, DEFAULT_LOOK.skin),
    hair: o.hair as Hair,
    hairColor: color(o.hairColor, DEFAULT_LOOK.hairColor),
    shirt: color(o.shirt, DEFAULT_LOOK.shirt),
    bg: color(o.bg, DEFAULT_LOOK.bg),
    extras,
  }
}
