// 存檔轉移碼（網頁這邊）：收集這支手機的進度上傳換一組碼；新手機輸入碼，下載回來寫進去、重新整理。

import { BACKUP_KEYS, normalizeCode, SAVE_RE } from './backup-core'
import { rankOf } from './progress'

export interface Backup {
  v: 1
  at: string
  items: Partial<Record<(typeof BACKUP_KEYS)[number], string>>
}

function collect(): Backup {
  const items: Backup['items'] = {}
  for (const k of BACKUP_KEYS) {
    try {
      const v = localStorage.getItem(k)
      if (v !== null) items[k] = v
    } catch {
      // 無痕模式
    }
  }
  return { v: 1, at: new Date().toISOString(), items }
}

async function call<T>(init?: RequestInit, code?: string): Promise<T> {
  let r: Response
  try {
    r = await fetch(`./api/save${code ? `?code=${code}` : ''}`, { ...init, headers: { 'content-type': 'application/json', accept: 'application/json' } })
  } catch {
    throw new Error('連不上伺服器，檢查一下網路')
  }
  if (r.status === 404) throw new Error('找不到這組轉移碼（打錯了，或已經超過 30 天）')
  if (!r.ok) throw new Error('伺服器忙線中，等一下再試')
  return (await r.json()) as T
}

/** 上傳這支手機的進度，拿到轉移碼和到期時間 */
export function upload(): Promise<{ code: string; until: number }> {
  return call({ method: 'POST', body: JSON.stringify({ data: collect() }) })
}

export async function download(raw: string): Promise<Backup> {
  const code = normalizeCode(raw)
  if (!SAVE_RE.test(code)) throw new Error('轉移碼是 8 個英文字母和數字')
  const r = await call<{ data: Backup }>(undefined, code)
  if (!r.data?.items?.['hule.progress.v2']) throw new Error('這組轉移碼的資料壞掉了')
  return r.data
}

/** 給你確認用：那一份的名字、金幣、打過幾場、段位、記帳有沒有在記 */
export function summary(b: Backup) {
  const parse = <T>(s: string | undefined): Partial<T> => {
    try {
      return s ? (JSON.parse(s) as Partial<T>) : {}
    } catch {
      return {}
    }
  }
  const p = parse<{ coins: number; matches: number; rankPts: number }>(b.items['hule.progress.v2'])
  const s = parse<{ name: string }>(b.items['hule.settings.v2'])
  const l = parse<{ current: unknown }>(b.items['hule.ledger.v1'])
  return { name: s.name?.trim() || '', coins: p.coins ?? 0, matches: p.matches ?? 0, rank: rankOf(p.rankPts ?? 0).name, ledger: !!l.current, at: b.at }
}

/** 換成那一份，然後重新整理 */
export function apply(b: Backup) {
  try {
    for (const k of BACKUP_KEYS) {
      const v = b.items[k]
      if (v === undefined) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    }
  } catch {
    throw new Error('這個瀏覽器不能存資料（無痕模式？）')
  }
  location.reload()
}

/** 網址上的 ?restore=XXXXXXXX（別的手機傳來的連結） */
export function restoreFromUrl(): string | null {
  const c = normalizeCode(new URLSearchParams(location.search).get('restore') ?? '')
  if (!SAVE_RE.test(c)) return null
  const u = new URL(location.href)
  u.searchParams.delete('restore')
  history.replaceState(null, '', u.pathname + u.search + u.hash)
  return c
}

export const restoreLink = (code: string) => `${location.origin}${location.pathname}?restore=${code}`
