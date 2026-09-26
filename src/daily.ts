// 每日挑戰：同一天大家拿到一模一樣的牌（同一個種子、同一關、標準規則、普通難度）。
// 一天只算第一場的成績；打完可以分享、上排行榜（網站上線後才有）。

import { dailyInfo as info, dailyOptions } from './daily-core'
import * as M from './engine/match'
import { today } from './progress'

export { dailyOptions }
export type { DailyInfo } from './daily-core'

export const dailyInfo = (date = today()) => info(date)

/** 每一局一格：你胡（🟩）、你自摸（🟨）、你放槍（🟥）、別人胡或流局（⬜） */
export function handGrid(m: M.MatchState): string {
  const byHand = new Map<number, string>()
  m.history.forEach((x, i) => {
    const cell = x.winner === 0 ? (x.from === null ? '🟨' : '🟩') : x.from === 0 ? '🟥' : '⬜'
    const k = x.hand ?? i
    const cur = byHand.get(k)
    // 一炮多響同一局有好幾筆：跟你有關的優先
    if (cur === undefined || (cur === '⬜' && cell !== '⬜')) byHand.set(k, cell)
  })
  return [...byHand.values()].join('')
}

export function shareText(m: M.MatchState, name?: string): string {
  const place = M.ranking(m).indexOf(0) + 1
  const pts = m.points[0] - M.stageOf(m).startPoints
  const title = m.daily
    ? `胡了！每日挑戰 ${m.daily.slice(5).replace('-', '/')}`
    : m.survival
      ? `胡了！生存模式第 ${m.survival.level + 1} 關・${M.stageOf(m).name}`
      : M.stageOf(m).tournament
        ? `胡了！全國錦標賽・${M.stageOf(m).name}`
        : `胡了！${M.stageOf(m).name}`
  const sign = pts > 0 ? '+' : pts < 0 ? '−' : ''
  const who = name?.trim() ? `${name.trim()} ` : ''
  return `${title}\n${who}第 ${place} 名 ${sign}${Math.abs(pts).toLocaleString('en-US')}\n${handGrid(m)}\n${location.origin}${location.pathname}`
}

/** 分享：手機跳分享選單，不行就複製到剪貼簿。回傳結果讓畫面顯示 */
export async function share(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
      await navigator.share({ text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

// ---------- 排行榜（Cloudflare Worker ＋ D1，worker/daily.ts） ----------

export interface BoardRow {
  name: string
  points: number
  place: number
  grid: string
  me?: boolean
}

export interface Board {
  rows: BoardRow[]
  total: number
  myRank: number | null
}

const UID_KEY = 'hule.uid'

export function uid(): string {
  try {
    let id = localStorage.getItem(UID_KEY)
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(UID_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

export async function fetchBoard(date: string): Promise<Board | null> {
  try {
    const r = await fetch(`./api/daily?date=${date}&uid=${uid()}`, { headers: { accept: 'application/json' } })
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as Board
  } catch {
    return null
  }
}

export async function submitScore(m: M.MatchState, name: string): Promise<Board | null> {
  if (!m.daily) return null
  try {
    const r = await fetch('./api/daily', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: m.daily,
        uid: uid(),
        name,
        points: m.points[0],
        place: M.ranking(m).indexOf(0) + 1,
        grid: handGrid(m),
        log: m.log ?? [],
      }),
    })
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as Board
  } catch {
    return null
  }
}
