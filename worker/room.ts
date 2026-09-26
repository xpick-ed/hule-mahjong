// 連線對打的房間：一個房號一個 Durable Object（Cloudflare 上的小伺服器），大家用 WebSocket 連進來。
//
// - 牌局在這裡跑（用跟單機一樣的規則引擎），每個人只收到自己看得到的那份（online.ts 的 viewFor）
// - 空位電腦補；電腦出牌照單機版的節奏（M.aiDelay）
// - 輪到真人：倒數時間到，或他斷線了，就替他打（M.autoMove）；他連回來就接手
// - 房間狀態存在 Durable Object 的儲存空間：大家都斷線、伺服器重開也能接著打；6 小時沒人就清掉

import { CHARACTERS } from '../src/engine/characters'
import * as M from '../src/engine/match'
import { newRoomCode, ROOM_RE, viewFor, type ClientMsg, type LobbyPlayer, type RoomSettings, type ServerMsg } from '../src/engine/online'
import { LADDER } from '../src/engine/stages'
import { DEFAULT_RULES, RuleError } from '../src/engine/table'

// ---------- Cloudflare 的型別（只宣告用到的） ----------

interface DOStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  deleteAll(): Promise<void>
  setAlarm(time: number): Promise<void>
}
interface DOState {
  storage: DOStorage
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>
}
interface CFWebSocket {
  accept(): void
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void
  addEventListener(type: 'close' | 'error', fn: () => void): void
}
declare const WebSocketPair: { new (): { 0: CFWebSocket; 1: CFWebSocket } }

// ---------- 房間資料 ----------

interface Player {
  pid: string
  name: string
  voice: 'f' | 'm'
  host: boolean
}

interface Saved {
  code: string
  phase: 'lobby' | 'playing'
  players: Player[]
  settings: RoomSettings
  match: M.MatchState | null
  /** 開打後：玩家 pid → 座位 */
  seatOf: Record<string, number>
  /** 現在等真人：哪一步（換一步就重新倒數）、倒數到什麼時候 */
  waitKey: string
  deadline: number | null
  /** 這一局結束後按了「下一局」的座位 */
  ready: number[]
}

const IDLE_MS = 6 * 3600 * 1000
/** 斷線的人輪到他時，等一下再替他打（讓大家看得到發生什麼事） */
const OFFLINE_DELAY = 1500
/** 一局結束後，最多等大家按「下一局」多久 */
const HAND_END_WAIT = 30000
const TURN_TIMES = [10, 15, 20, 30, 45, 60]

/** 房間裡名字重複（例如兩個都沒填、都叫小明）：後來的加編號 */
function uniqueName(name: string, others: { name: string }[]): string {
  if (!others.some((o) => o.name === name)) return name
  for (let i = 2; ; i++) {
    const n = `${name.slice(0, 7)}${i}`
    if (!others.some((o) => o.name === n)) return n
  }
}

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
const cleanName = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 8) || '小明'

export class Room {
  private ctx: DOState
  /** 測試用：所有等待時間乘上這個數（本機 wrangler dev --var ROOM_DELAY_SCALE:0.05） */
  private scale: number
  private s: Saved | null = null
  private sockets = new Map<string, CFWebSocket>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastTaunt = new Map<string, number>()

  constructor(ctx: DOState, env: { ROOM_DELAY_SCALE?: string }) {
    this.ctx = ctx
    this.scale = Number(env.ROOM_DELAY_SCALE) > 0 ? Number(env.ROOM_DELAY_SCALE) : 1
    void ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Saved>('room')) ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const code = url.pathname.split('/')[3] ?? ''
    if (!ROOM_RE.test(code)) return new Response('bad room', { status: 400 })
    if (request.headers.get('upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    const pid = url.searchParams.get('pid') ?? ''
    if (!/^[0-9a-f]{24}$/.test(pid)) return new Response('bad pid', { status: 400 })
    const name = cleanName(url.searchParams.get('name') ?? '')
    const voice = url.searchParams.get('voice') === 'm' ? 'm' : 'f'
    // 開房的人帶 create=1；照房號加入的人，房間要已經存在
    const creating = url.searchParams.get('create') === '1'

    const pair = new WebSocketPair()
    const ws = pair[1]
    ws.accept()
    const fresh = !this.s || this.s.players.length === 0
    if (fresh && !creating) {
      this.reject(ws, `找不到房間 ${code}，房號對嗎？`)
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
    }
    if (fresh) this.s = null
    this.s ??= {
      code,
      phase: 'lobby',
      players: [],
      settings: { stage: 0, rules: DEFAULT_RULES, turnTime: 20 },
      match: null,
      seatOf: {},
      waitKey: '',
      deadline: null,
      ready: [],
    }
    this.join(ws, pid, name, voice)
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
  }

  async alarm() {
    // 很久沒人：清掉房間
    if (this.sockets.size === 0) {
      this.s = null
      await this.ctx.storage.deleteAll()
    } else await this.ctx.storage.setAlarm(Date.now() + IDLE_MS)
  }

  // ---------- 進出房間 ----------

  private join(ws: CFWebSocket, pid: string, name: string, voice: 'f' | 'm') {
    const s = this.s!
    let p = s.players.find((x) => x.pid === pid)
    if (!p) {
      if (s.phase === 'playing') return this.reject(ws, '這一桌已經開打了，等他們打完這場再加入')
      if (s.players.length >= 4) return this.reject(ws, '房間滿了（最多 4 個人）')
      p = { pid, name: uniqueName(name, s.players), voice, host: s.players.length === 0 }
      s.players.push(p)
    } else {
      p.name = uniqueName(name, s.players.filter((x) => x !== p))
      p.voice = voice
    }
    // 同一個人從別的分頁連進來：舊的那條斷掉
    const old = this.sockets.get(pid)
    if (old && old !== ws) old.close(4000, '在別的地方開了這個房間')
    this.sockets.set(pid, ws)
    ws.addEventListener('message', (e) => this.onMessage(pid, ws, e.data))
    const gone = () => this.onClose(pid, ws)
    ws.addEventListener('close', gone)
    ws.addEventListener('error', gone)
    void this.ctx.storage.setAlarm(Date.now() + IDLE_MS)
    this.pump()
  }

  private reject(ws: CFWebSocket, msg: string) {
    this.send(ws, { t: 'error', msg, fatal: true })
    ws.close(4001, 'rejected')
  }

  private onClose(pid: string, ws: CFWebSocket) {
    if (this.sockets.get(pid) !== ws) return
    this.sockets.delete(pid)
    const s = this.s
    if (!s) return
    // 還沒開打就離開：房主換人。開打之後斷線的人由電腦代打，連回來可以接手
    this.pump()
  }

  private leave(pid: string) {
    const s = this.s!
    if (s.phase === 'lobby') {
      const i = s.players.findIndex((x) => x.pid === pid)
      if (i >= 0) {
        const wasHost = s.players[i].host
        s.players.splice(i, 1)
        if (wasHost && s.players[0]) s.players[0].host = true
      }
    }
    const ws = this.sockets.get(pid)
    this.sockets.delete(pid)
    ws?.close(1000, 'left')
    this.pump()
  }

  // ---------- 收訊息 ----------

  private onMessage(pid: string, ws: CFWebSocket, raw: unknown) {
    const s = this.s
    if (!s || typeof raw !== 'string' || raw.length > 4000) return
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw) as ClientMsg
    } catch {
      return
    }
    const me = s.players.find((x) => x.pid === pid)
    if (!me) return
    const seat = s.seatOf[pid]
    try {
      switch (msg.t) {
        case 'settings':
          if (!me.host || s.phase !== 'lobby') return
          this.applySettings(msg.settings)
          break
        case 'start':
          if (!me.host || s.phase !== 'lobby') return
          this.start()
          break
        case 'move':
          if (!s.match || seat === undefined) return
          s.match = M.act(s.match, seat, msg.move)
          break
        case 'next':
          if (!s.match || seat === undefined || s.match.phase !== 'handEnd') return
          if (!s.ready.includes(seat)) s.ready.push(seat)
          if (this.everyoneReady()) this.nextHand()
          break
        case 'again':
          if (!me.host || s.match?.phase !== 'end') return
          s.phase = 'lobby'
          s.match = null
          s.seatOf = {}
          // 離開的人不再佔位子
          s.players = s.players.filter((p) => this.sockets.has(p.pid))
          if (s.players.length && !s.players.some((p) => p.host)) s.players[0].host = true
          break
        case 'taunt': {
          if (seat === undefined || typeof msg.id !== 'string' || msg.id.length > 20 || Date.now() - (this.lastTaunt.get(pid) ?? 0) < 2000) return
          this.lastTaunt.set(pid, Date.now())
          for (const [other, sock] of this.sockets) {
            const os = s.seatOf[other]
            if (other !== pid && os !== undefined) this.send(sock, { t: 'taunt', seat: (seat - os + 4) % 4, id: msg.id })
          }
          return
        }
        case 'leave':
          return this.leave(pid)
      }
    } catch (e) {
      if (e instanceof RuleError) return this.send(ws, { t: 'error', msg: e.message })
      throw e
    }
    this.pump()
  }

  private applySettings(x: Partial<RoomSettings>) {
    const st = this.s!.settings
    // 連線只開闖關的六關（錦標賽是自己一個人的挑戰）
    if (typeof x.stage === 'number' && LADDER[x.stage]) st.stage = x.stage
    if (typeof x.turnTime === 'number' && TURN_TIMES.includes(x.turnTime)) st.turnTime = x.turnTime
    if (typeof x.fast === 'boolean') st.fast = x.fast
    if (x.rules) {
      st.rules = {
        multiRon: !!x.rules.multiRon,
        passWin: x.rules.passWin !== false,
        streakCap: [0, 3, 5].includes(x.rules.streakCap) ? x.rules.streakCap : 0,
      }
    }
  }

  private start() {
    const s = this.s!
    // 已經離開的人不算；真人隨機坐，空位電腦補
    s.players = s.players.filter((p) => this.sockets.has(p.pid))
    this.fixHost()
    const order = [...s.players].sort(() => rnd() - 0.5)
    const seats = [0, 1, 2, 3].sort(() => rnd() - 0.5).slice(0, order.length)
    s.seatOf = Object.fromEntries(order.map((p, i) => [p.pid, seats[i]]))
    const humans = [0, 1, 2, 3].map((x) => seats.includes(x))
    s.match = M.newMatch(newRoomCode(rnd) + Date.now(), s.settings.stage, { rules: s.settings.rules, difficulty: 'normal', humans })
    s.phase = 'playing'
    s.ready = []
    s.waitKey = ''
    s.deadline = null
  }

  /** 房主斷線了：換一個還在的人當房主 */
  private fixHost() {
    const s = this.s!
    const host = s.players.find((p) => p.host)
    if (host && this.sockets.has(host.pid)) return
    const next = s.players.find((p) => this.sockets.has(p.pid))
    if (!next) return
    for (const p of s.players) p.host = p === next
  }

  private connectedSeats(): number[] {
    const s = this.s!
    return Object.entries(s.seatOf)
      .filter(([pid]) => this.sockets.has(pid))
      .map(([, seat]) => seat)
  }

  private everyoneReady() {
    const s = this.s!
    return this.connectedSeats().every((x) => s.ready.includes(x))
  }

  private nextHand() {
    const s = this.s!
    s.match = M.nextHand(s.match!)
    s.ready = []
  }

  // ---------- 推動牌局 ----------

  /** 狀態變了：排下一件事（電腦出牌／等真人倒數／等大家看完這一局），存檔，告訴大家 */
  private pump() {
    const s = this.s
    if (!s) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (s.phase === 'lobby') this.fixHost()
    const m = s.match
    if (s.phase === 'playing' && m) {
      if (m.phase === 'play') {
        const pending = M.humansPending(m)
        if (pending.length) {
          const key = `${m.handNo}:${m.hand.eventN}:${m.hand.phase}`
          if (key !== s.waitKey || !s.deadline) {
            s.waitKey = key
            s.deadline = Date.now() + s.settings.turnTime * 1000 * this.scale
          }
          const online = this.connectedSeats()
          const offline = pending.filter((x) => !online.includes(x))
          const wait = offline.length ? OFFLINE_DELAY * this.scale : Math.max(0, s.deadline - Date.now())
          this.timer = setTimeout(() => this.autoPlay(offline.length ? offline : pending), wait)
        } else {
          s.deadline = null
          this.timer = setTimeout(() => this.aiStep(), M.aiDelay(m, rnd()) * (s.settings.fast ? 0.5 : 1) * this.scale)
        }
      } else if (m.phase === 'handEnd') {
        s.deadline = null
        if (this.everyoneReady()) this.timer = setTimeout(() => this.advance(), 0)
        else this.timer = setTimeout(() => this.advance(), HAND_END_WAIT * this.scale)
      }
    }
    void this.ctx.storage.put('room', s)
    this.broadcast()
  }

  private aiStep() {
    const s = this.s
    if (!s?.match) return
    try {
      const n = M.step(s.match)
      if (n === s.match) return
      s.match = n
    } catch (e) {
      console.error('aiStep', e)
      return
    }
    this.pump()
  }

  /** 時間到／斷線：替這幾個座位打 */
  private autoPlay(seats: number[]) {
    const s = this.s
    if (!s?.match) return
    for (const seat of seats) {
      try {
        const mv = M.autoMove(s.match, seat, { rng: (rnd() * 2 ** 32) >>> 0 || 1 })
        if (mv) s.match = M.act(s.match, seat, mv)
      } catch (e) {
        console.error('autoPlay', e)
      }
    }
    s.deadline = null
    this.pump()
  }

  private advance() {
    const s = this.s
    if (s?.match?.phase !== 'handEnd') return
    this.nextHand()
    this.pump()
  }

  // ---------- 送訊息 ----------

  private send(ws: CFWebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // 已經斷了
    }
  }

  private broadcast() {
    const s = this.s!
    const lobby: LobbyPlayer[] = s.players.map((p) => ({ name: p.name, host: p.host, connected: this.sockets.has(p.pid), voice: p.voice }))
    const m = s.match
    const seatPlayers: M.SeatPlayer[] | null = m
      ? [0, 1, 2, 3].map((seat) => {
          const pid = Object.keys(s.seatOf).find((k) => s.seatOf[k] === seat)
          const p = pid ? s.players.find((x) => x.pid === pid) : undefined
          return p ? { name: p.name, human: true, voice: p.voice, connected: this.sockets.has(p.pid) } : { name: CHARACTERS[m.chars[seat]]?.name ?? '電腦', human: false }
        })
      : null
    const timeLeft = s.deadline ? Math.max(0, s.deadline - Date.now()) : null
    for (const [pid, ws] of this.sockets) {
      const you = s.players.findIndex((p) => p.pid === pid)
      this.send(ws, { t: 'room', code: s.code, phase: s.phase, players: lobby, you, settings: s.settings })
      const seat = s.seatOf[pid]
      if (m && seatPlayers && seat !== undefined && s.phase === 'playing') {
        this.send(ws, { t: 'state', m: viewFor(m, seat, seatPlayers), timeLeft, ready: s.ready.map((x) => (x - seat + 4) % 4) })
      }
    }
  }
}
