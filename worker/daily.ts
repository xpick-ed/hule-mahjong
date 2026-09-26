// 每日挑戰排行榜 API（Cloudflare Workers ＋ D1），worker/index.ts 把 /api/daily 轉到這裡。
//   GET  /api/daily?date=2026-09-26&uid=…   前 20 名、總人數、你的名次
//   POST /api/daily  { date, uid, name, points, place, grid, log }
// 一個 uid 一天只收第一筆。log 是你的動作紀錄，同一個種子可以完整重播驗證分數；
// 重播一場大約要 0.5 秒 CPU，免費方案（每次 10ms）跑不動，所以預設只做基本檢查、
// 把紀錄存起來；付費方案可以設環境變數 VERIFY_REPLAY=1 讓每一筆都重播驗證。

import { dailyInfo, dailyOptions } from '../src/daily-core'
import * as M from '../src/engine/match'
import { STAGES } from '../src/engine/stages'

interface D1Result<T> {
  results: T[]
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  run(): Promise<unknown>
}
export interface Env {
  /** 還沒建 D1 的時候沒有這個 */
  DB?: { prepare(sql: string): D1Stmt }
  VERIFY_REPLAY?: string
  ASSETS: { fetch(req: Request): Promise<Response> }
}
interface Ctx {
  request: Request
  env: Env
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UID = /^[0-9a-f]{24}$/
const GRID = /^(?:🟩|🟨|🟥|⬜)*$/u

/** 台灣時間的日期前後一天都收（各地時區不同） */
function dateOk(date: string): boolean {
  if (!DATE.test(date)) return false
  const t = Date.parse(`${date}T00:00:00+08:00`)
  return Number.isFinite(t) && Math.abs(Date.now() - t) < 2.5 * 86400_000
}

type DB = NonNullable<Env['DB']>

async function board(db: DB, date: string, uid: string) {
  const top = await db.prepare('SELECT uid, name, points, place, grid FROM daily WHERE date = ? ORDER BY points DESC, at ASC LIMIT 20')
    .bind(date)
    .all<{ uid: string; name: string; points: number; place: number; grid: string }>()
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ?').bind(date).first<{ n: number }>())?.n ?? 0
  const mine = await db.prepare('SELECT points, at FROM daily WHERE date = ? AND uid = ?').bind(date, uid).first<{ points: number; at: number }>()
  let myRank: number | null = null
  if (mine) {
    const above = await db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ? AND (points > ? OR (points = ? AND at < ?))')
      .bind(date, mine.points, mine.points, mine.at)
      .first<{ n: number }>()
    myRank = (above?.n ?? 0) + 1
  }
  return {
    rows: top.results.map((r) => ({ name: r.name, points: r.points, place: r.place, grid: r.grid, ...(r.uid === uid ? { me: true } : {}) })),
    total,
    myRank,
  }
}

export async function onRequestGet({ request, env }: Ctx) {
  if (!env.DB) return json({ error: 'no-db' }, 503)
  const u = new URL(request.url)
  const date = u.searchParams.get('date') ?? ''
  const uid = u.searchParams.get('uid') ?? ''
  if (!DATE.test(date)) return json({ error: 'date' }, 400)
  return json(await board(env.DB, date, uid))
}

export async function onRequestPost({ request, env }: Ctx) {
  if (!env.DB) return json({ error: 'no-db' }, 503)
  let b: { date?: unknown; uid?: unknown; name?: unknown; points?: unknown; place?: unknown; grid?: unknown; log?: unknown }
  try {
    b = await request.json()
  } catch {
    return json({ error: 'json' }, 400)
  }
  const date = String(b.date ?? '')
  const uid = String(b.uid ?? '')
  const name = String(b.name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 12)
  const points = Number(b.points)
  const place = Number(b.place)
  const grid = String(b.grid ?? '')
  const log = Array.isArray(b.log) ? b.log : []
  const logText = JSON.stringify(log)
  const d = dailyInfo(date)
  const stage = STAGES[d.stage]
  if (!dateOk(date) || !UID.test(uid) || !name || !Number.isInteger(points) || ![1, 2, 3, 4].includes(place)) return json({ error: 'bad' }, 400)
  if (!GRID.test(grid) || [...grid].length > 40 || logText.length > 30000) return json({ error: 'bad' }, 400)
  // 分數合理範圍：起始分數的四倍以內
  if (Math.abs(points) > stage.startPoints * 4) return json({ error: 'bad' }, 400)

  let verified = 0
  if (env.VERIFY_REPLAY === '1') {
    try {
      const m = M.replay(d.seed, d.stage, dailyOptions(date), log as M.Act[])
      if (m.phase !== 'end' || m.points[0] !== points || M.ranking(m).indexOf(0) + 1 !== place) return json({ error: 'replay' }, 400)
      verified = 1
    } catch {
      return json({ error: 'replay' }, 400)
    }
  }
  await env.DB.prepare('INSERT OR IGNORE INTO daily (date, uid, name, points, place, grid, log, verified, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(date, uid, name, points, place, grid, logText, verified, Date.now())
    .run()
  return json(await board(env.DB, date, uid))
}
