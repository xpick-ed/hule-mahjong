// 每日挑戰的共用部分（網頁和排行榜 API 都用）：日期 → 種子、關卡、規則。

import type { MatchOptions } from './engine/match'
import { hashSeed } from './engine/rng'
import { STAGES } from './engine/stages'
import { DEFAULT_RULES } from './engine/table'

export interface DailyInfo {
  date: string
  seed: string
  stage: number
}

export function dailyInfo(date: string): DailyInfo {
  return { date, seed: `daily-${date}`, stage: hashSeed(`daily-stage-${date}`) % STAGES.length }
}

/** 每日挑戰固定：預設規則、普通難度 */
export const dailyOptions = (date: string): MatchOptions => ({ rules: DEFAULT_RULES, difficulty: 'normal', daily: date })
