// 連線對打：伺服器和網頁共用的部分。
//   viewFor：從完整的牌局做出「某個人看得到的樣子」——座位轉成他在座位 0（畫面照單機版畫），
//            別人的手牌、牌山、亂數種子都蓋掉，想作弊也看不到。
//   訊息格式：網頁和房間伺服器之間傳的東西。

import type { Look } from './characters'
import type { MatchState, Move, SeatPlayer } from './match'
import type { HandState, Rules } from './table'
import type { Tile } from './tiles'

// ---------- 轉座位 ----------

/** 座位 s 轉成「k 坐在 0」之後的座位 */
const rs = <T extends number | null | undefined>(s: T, k: number): T => (typeof s === 'number' ? (((s - k + 4) % 4) as T) : s)
/** 以座位為索引的陣列跟著轉：新的第 i 個 = 舊的第 i+k 個 */
function ra<T>(a: T[], k: number): T[]
function ra<T>(a: T[] | undefined, k: number): T[] | undefined
function ra<T>(a: T[] | undefined, k: number): T[] | undefined {
  return a && a.map((_, i) => a[(i + k) % 4])
}

function rotateHand(h: HandState, k: number) {
  h.seats = ra(h.seats, k)
  for (const s of h.seats) for (const m of s.melds) m.from = rs(m.from, k)
  h.dealer = rs(h.dealer, k)
  h.turn = rs(h.turn, k)
  if (h.lastDiscard) h.lastDiscard.from = rs(h.lastDiscard.from, k)
  h.options = ra(h.options, k)
  h.decisions = ra(h.decisions, k)
  h.luckySeat = rs(h.luckySeat, k)
  h.tingSaid = ra(h.tingSaid, k)
  h.peekedBy = ra(h.peekedBy, k)
  h.passedWin = ra(h.passedWin, k)
  if (h.robbing) h.robbing.seat = rs(h.robbing.seat, k)
  for (const { e } of h.events) {
    const x = e as { seat?: number; from?: number | null; target?: number }
    if ('seat' in x) x.seat = rs(x.seat, k)
    if ('from' in x) x.from = rs(x.from, k)
    if ('target' in x) x.target = rs(x.target, k)
  }
}

/** 整場牌局轉成座位 k 坐在 0（複製一份，不改原本的） */
export function rotateMatch(src: MatchState, k: number): MatchState {
  const m = structuredClone(src)
  if (!k) return m
  m.chars = ra(m.chars, k)
  m.points = ra(m.points, k)
  m.humans = ra(m.humans, k)
  m.players = ra(m.players, k)
  m.dealer = rs(m.dealer, k)
  m.peek = rs(m.peek, k)
  if (m.aiSkills) m.aiSkills = Object.fromEntries(Object.entries(m.aiSkills).map(([s, n]) => [rs(Number(s), k), n]))
  rotateHand(m.hand, k)
  // 胡牌資料在 hand.win 和 result.win 是同一份（複製時也還是同一份）：每一份只能轉一次
  const wins = new Set([m.hand.win, ...(m.hand.also ?? []), m.result?.win, ...(m.result?.also ?? [])])
  for (const w of wins) {
    if (!w) continue
    w.seat = rs(w.seat, k)
    w.from = rs(w.from, k)
  }
  if (m.result) {
    const r = m.result
    for (const p of r.payments) {
      p.seat = rs(p.seat, k)
      if (p.to !== undefined) p.to = rs(p.to, k)
    }
    r.deltas = ra(r.deltas, k)
    r.dealer = rs(r.dealer, k)
  }
  for (const x of m.history) {
    x.winner = rs(x.winner, k)
    x.from = rs(x.from, k)
  }
  return m
}

// ---------- 蓋牌 ----------

const hidden = (seat: number, i: number): Tile => ({ id: -(seat * 100 + i + 1), kind: 'x' })

/**
 * 座位 seat 看得到的牌局：轉成他坐在 0，別人的手牌、牌山、剛摸的牌、吃碰選項、亂數都蓋掉。
 * 一局結束時手牌全部亮出來（跟真的打牌一樣）。
 */
export function viewFor(m: MatchState, seat: number, players: SeatPlayer[]): MatchState {
  const v = rotateMatch({ ...m, players }, seat)
  const h = v.hand
  v.seed = ''
  v.rng = 0
  delete v.log
  delete v.aiSkills
  h.wall = h.wall.map(() => hidden(9, 0))
  const reveal = h.phase === 'over'
  for (let s = 1; s < 4; s++) {
    if (!reveal) h.seats[s].hand = h.seats[s].hand.map((_, i) => hidden(s, i))
    h.options[s] = null
    h.decisions[s] = null
    h.tingSaid[s] = false
    if (h.passedWin) h.passedWin[s] = false
  }
  if (h.turn !== 0) h.drawn = null
  if (h.luckySeat !== 0) h.luckySeat = null
  delete h.peekedBy
  // 別的真人「聽牌了」不能讓你知道；電腦的聽牌只拿來講台詞，留著
  h.events = h.events.filter(({ e }) => !(e.t === 'ting' && e.seat !== 0 && v.humans?.[e.seat]))
  return v
}

/**
 * 觀眾看得到的牌局：從第一個真人的位子看（他坐在畫面下方），四家的手牌全部蓋著，只看得到打出來、亮出來的牌。
 * 一局結束時跟大家一樣全部攤開。
 */
export function watchView(m: MatchState, players: SeatPlayer[]): MatchState {
  const base = Math.max(0, players.findIndex((p) => p.human))
  const v = viewFor(m, base, players)
  const h = v.hand
  if (h.phase !== 'over') h.seats[0].hand = h.seats[0].hand.map((_, i) => hidden(0, i))
  h.options[0] = null
  h.decisions[0] = null
  h.drawn = null
  h.luckySeat = null
  h.tingSaid[0] = false
  if (h.passedWin) h.passedWin[0] = false
  h.events = h.events.filter(({ e }) => !(e.t === 'ting' && v.humans?.[e.seat]))
  v.skills = {}
  v.peek = null
  v.spectator = true
  return v
}

/** 觀眾畫面上的座位 0 是第幾個座位 */
export const watchBase = (players: SeatPlayer[]) => Math.max(0, players.findIndex((p) => p.human))

// ---------- 房間訊息 ----------

export interface RoomSettings {
  /** 第幾關的場景和底／台 */
  stage: number
  rules: Rules
  /** 每一步幾秒 */
  turnTime: number
  /** 電腦出牌快一點 */
  fast?: boolean
}

export interface LobbyPlayer {
  name: string
  host: boolean
  connected: boolean
  voice: 'f' | 'm'
  look?: Look
}

/** 網頁 → 房間 */
export type ClientMsg =
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'move'; move: Move }
  /** 這一局看完了，準備下一局 */
  | { t: 'next' }
  /** 打完一場，回到房間再開一場（房主） */
  | { t: 'again' }
  | { t: 'taunt'; id: string }
  | { t: 'leave' }

/** 房間 → 網頁 */
export type ServerMsg =
  | {
      t: 'room'
      code: string
      phase: 'lobby' | 'playing'
      players: LobbyPlayer[]
      /** 你在 players 裡是第幾個；-1 是觀眾 */
      you: number
      settings: RoomSettings
      /** 幾個人在觀戰 */
      watchers?: number
    }
  | {
      t: 'state'
      /** 你看得到的牌局（你在座位 0） */
      m: MatchState
      /** 現在等真人動作的話，還剩幾毫秒 */
      timeLeft: number | null
      /** 這一局結束後，已經按「下一局」的座位（你看到的座位） */
      ready: number[]
    }
  | { t: 'taunt'; seat: number; id: string }
  | { t: 'error'; msg: string; fatal?: boolean }

/** 房號：5 碼，拿掉容易看錯的 0 O 1 I */
export const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_RE = /^[A-HJ-NP-Z2-9]{5}$/

export function newRoomCode(rand: () => number): string {
  let s = ''
  for (let i = 0; i < 5; i++) s += ROOM_CHARS[Math.floor(rand() * ROOM_CHARS.length)]
  return s
}
