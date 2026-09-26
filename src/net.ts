// 連線對打：跟房間伺服器的 WebSocket。斷線會自己重連（同一個玩家 id，伺服器會讓你接回原本的位子）。
// 你在哪個房間記在 localStorage：重新整理頁面也會自動連回去。

import type { Look } from './engine/characters'
import { ROOM_CHARS, ROOM_RE, type ClientMsg, type ServerMsg } from './engine/online'

const PID_KEY = 'hule.pid'
const ROOM_KEY = 'hule.room'

function store(key: string, v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(key)
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
  } catch {
    // 無痕模式
  }
  return null
}

/** 這台裝置的玩家 id（跟排行榜的 uid 分開） */
export function playerId(): string {
  let id = store(PID_KEY)
  if (!id || !/^[0-9a-f]{24}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
    store(PID_KEY, id)
  }
  return id
}

/** 正式網站（claude.ai 的試玩版不能連線對打） */
export const SITE = 'https://hule.leh-x.workers.dev'
export const canPlayOnline = () => !/claude/.test(location.hostname)

export const savedRoom = () => {
  const c = store(ROOM_KEY)
  return c && ROOM_RE.test(c) ? c : null
}

export function newCode(): string {
  const r = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(r, (b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('')
}

/** 邀請連結：朋友點開就會加入這個房間 */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?room=${code}`

/** 網址上的 ?room=XXXXX（點邀請連結進來的） */
export function roomFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? ''
  return ROOM_RE.test(c) ? c : null
}

export function clearRoomFromUrl() {
  if (!location.search.includes('room=')) return
  const u = new URL(location.href)
  u.searchParams.delete('room')
  history.replaceState(null, '', u.pathname + u.search + u.hash)
}

export interface ConnOptions {
  code: string
  name: string
  voice: 'f' | 'm'
  /** 你的造型（朋友看得到） */
  look?: Look | null
  create: boolean
  onMessage: (m: ServerMsg) => void
  /** 連線狀態：connecting 連線中／open 連上了／retry 斷了在重連／closed 不會再連 */
  onStatus: (s: 'connecting' | 'open' | 'retry' | 'closed', why?: string) => void
}

export class RoomConn {
  private ws: WebSocket | null = null
  private tries = 0
  private stopped = false
  private opened = false
  private opt: ConnOptions

  constructor(opt: ConnOptions) {
    this.opt = opt
    store(ROOM_KEY, opt.code)
    this.open()
  }

  private url() {
    const { code, name, voice, create, look } = this.opt
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const q = new URLSearchParams({ pid: playerId(), name, voice })
    if (look) q.set('look', JSON.stringify(look))
    // 只有第一次（開房）帶 create；重連的時候房間已經在了
    if (create && !this.opened) q.set('create', '1')
    const path = location.pathname.replace(/[^/]*$/, '')
    return `${proto}//${location.host}${path}api/room/${code}/ws?${q}`
  }

  private open() {
    this.opt.onStatus(this.tries ? 'retry' : 'connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url())
    } catch {
      return this.fail('這裡不能連線（試玩版不支援連線對打）')
    }
    this.ws = ws
    ws.onopen = () => {
      this.tries = 0
      this.opened = true
      this.opt.onStatus('open')
    }
    ws.onmessage = (e) => {
      let msg: ServerMsg
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg
      } catch {
        return
      }
      if (msg.t === 'error' && msg.fatal) {
        this.stopped = true
        store(ROOM_KEY, null)
        this.opt.onStatus('closed', msg.msg)
        return
      }
      this.opt.onMessage(msg)
    }
    ws.onclose = (e) => {
      if (this.ws !== ws || this.stopped) return
      // 同一個人在別的分頁開了：這邊不要再搶回來
      if (e.code === 4000) return this.fail('你在別的地方開了這個房間')
      if (!this.opened && this.tries >= 2) return this.fail('連不上房間伺服器')
      this.tries++
      this.opt.onStatus('retry')
      window.setTimeout(() => !this.stopped && this.open(), Math.min(8000, 800 * this.tries))
    }
  }

  private fail(why: string) {
    this.stopped = true
    this.opt.onStatus('closed', why)
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  /** 離開房間：告訴伺服器、不再重連、忘記這個房間 */
  leave() {
    this.send({ t: 'leave' })
    this.stopped = true
    store(ROOM_KEY, null)
    this.ws?.close(1000)
  }

  /** 分頁關掉之類：不告訴伺服器（之後可以連回來） */
  close() {
    this.stopped = true
    this.ws?.close(1000)
  }
}
