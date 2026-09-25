// 可決定性的亂數：整個狀態只有一個 32 位元整數，跟著存檔走。
// 同一個種子 + 同一串操作 = 同樣的結果（每日一局、重播、除錯都靠這個）。

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/** 有 rng 欄位的物件（通常是 RunState）。呼叫會推進它的狀態。 */
export interface HasRng {
  rng: number
}

// mulberry32
export function rand(r: HasRng): number {
  let t = (r.rng = (r.rng + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randInt(r: HasRng, n: number): number {
  return Math.floor(rand(r) * n)
}

export function pick<T>(r: HasRng, arr: readonly T[]): T {
  return arr[randInt(r, arr.length)]
}

/** Fisher–Yates，原地洗牌並回傳同一個陣列 */
export function shuffle<T>(r: HasRng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 給新的一輪用的隨機種子（只在介面用，引擎本身不碰 Math.random） */
export function newSeed(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
