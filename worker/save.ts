// 存檔轉移碼 API（D1），worker/index.ts 把 /api/save 轉到這裡。
//   POST /api/save  { data: { v, at, items } }  → { code, until }
//   GET  /api/save?code=ABCD2345               → { data, until }
// 把這支手機的進度存起來換一組 8 碼，新手機輸入就搬過去；30 天後失效。
// 只收 BACKUP_KEYS 裡的東西（遊戲進度、設定、記帳），沒有密碼之類的資料。
// 表格第一次用到時自己建（也寫在 schema.sql）。

import { BACKUP_KEYS, SAVE_CHARS, SAVE_DAYS, SAVE_MAX, SAVE_RE, normalizeCode } from '../src/backup-core'
import { json, type DB, type Env } from './daily'

const TTL = SAVE_DAYS * 86400_000

async function ensure(db: DB) {
  await db.prepare('CREATE TABLE IF NOT EXISTS saves (code TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL)').run()
}

function newCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(r, (b) => SAVE_CHARS[b % SAVE_CHARS.length]).join('')
}

export async function saveGet(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: 'no-db' }, 503)
  const code = normalizeCode(new URL(request.url).searchParams.get('code') ?? '')
  if (!SAVE_RE.test(code)) return json({ error: 'code' }, 400)
  let row: { data: string; at: number } | null = null
  try {
    row = await env.DB.prepare('SELECT data, at FROM saves WHERE code = ?').bind(code).first<{ data: string; at: number }>()
  } catch {
    // 表格還沒建：當作找不到
  }
  if (!row || Date.now() - row.at > TTL) return json({ error: 'notfound' }, 404)
  return json({ data: JSON.parse(row.data), until: row.at + TTL })
}

export async function savePost(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: 'no-db' }, 503)
  const text = await request.text()
  if (text.length > SAVE_MAX) return json({ error: 'big' }, 413)
  let body: { data?: { items?: Record<string, unknown> } }
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'json' }, 400)
  }
  const src = body.data?.items
  if (!src || typeof src !== 'object') return json({ error: 'bad' }, 400)
  const items: Record<string, string> = {}
  for (const k of BACKUP_KEYS) if (typeof src[k] === 'string') items[k] = src[k] as string
  if (!items['hule.progress.v2']) return json({ error: 'bad' }, 400)
  const data = JSON.stringify({ v: 1, at: new Date().toISOString(), items })
  const db = env.DB
  await ensure(db)
  await db.prepare('DELETE FROM saves WHERE at < ?').bind(Date.now() - TTL).run()
  const now = Date.now()
  // 碰巧撞到別人的轉移碼就換一組
  for (let i = 0; i < 5; i++) {
    const code = newCode()
    try {
      await db.prepare('INSERT INTO saves (code, data, at) VALUES (?, ?, ?)').bind(code, data, now).run()
      return json({ code, until: now + TTL })
    } catch {
      continue
    }
  }
  return json({ error: 'busy' }, 503)
}
