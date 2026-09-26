import { create } from 'zustand'
import { chooseDiscard } from './engine/ai'
import { BANTER, CHARACTERS, tauntText, type LineKey, type Look } from './engine/characters'
import * as M from './engine/match'
import { newSeed } from './engine/rng'
import { SKINS, STAGES } from './engine/stages'
import { canTsumo, DEFAULT_RULES, type ClaimDecision, type HandEvent, type Rules } from './engine/table'
import { tileName, type Kind } from './engine/tiles'
import { dailyInfo, dailyOptions, shareText } from './daily'
import type { ClientMsg, RoomSettings, ServerMsg } from './engine/online'
import { clearRoomFromUrl, newCode, RoomConn, roomFromUrl, savedRoom } from './net'
import { playMusic, setMusicVolume, type MusicMood } from './music'
import * as P from './progress'
import type { Progress } from './progress'
import { judgeDiscard, pickNotes, type ReviewNote } from './review'
import { goLandscape } from './screen'
import { buzz, setSfxVolume, sfx } from './sfx'
import { STORIES } from './stories'
import { preloadVoices, setVoiceVolume, speak } from './voice'

const MATCH_KEY = 'hule.match.v2'
const PROGRESS_KEY = 'hule.progress.v2'
const SETTINGS_KEY = 'hule.settings.v2'

function load<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

function save(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // 存不了（無痕模式）就算了
  }
}

export type { Progress } from './progress'

export interface Settings {
  /** 音量 0–1（0 = 關）：音效、角色配音（報牌、喊牌、台詞）、背景音樂 */
  sfxVol: number
  voiceVol: number
  musicVol: number
  /** 你自己報牌、喊牌的聲音 */
  myVoice: 'f' | 'm'
  fast: boolean
  hints: boolean
  /** 有人看起來聽牌時，標出你手上哪些牌危險、哪些安全 */
  danger: boolean
  /** 你每一步可以想幾秒（10–60） */
  turnTime: number
  /** 牌桌規則（下一場開始生效） */
  rules: Rules
  /** 上次選的難度 */
  difficulty: M.Difficulty
  /** 你的名字（空的就叫「你」） */
  name: string
  /** 第一次打開時問過名字了（填了或跳過） */
  nameAsked: boolean
  /** 存檔版本 */
  v?: number
}

export const TURN_TIMES = [10, 15, 20, 30, 45, 60] as const

/** 學習中心的分頁 */
export type LearnTab = 'tips' | 'practice' | 'rules'

export interface Bubble {
  text: string
  key: number
}

export type Mood = 'normal' | 'happy' | 'sad'

/** 連線對打的狀態 */
export interface OnlineInfo {
  code: string
  /** connecting 連線中／open 連上了／retry 斷了在重連 */
  status: 'connecting' | 'open' | 'retry'
  /** 房間資料（誰在房間、誰是房主、設定） */
  room: Extract<ServerMsg, { t: 'room' }> | null
  /** 現在等真人動作的話，這台電腦的時間到哪一刻截止 */
  deadline: number | null
  /** 這一局結束後已經按「下一局」的座位 */
  ready: number[]
}

/** 開打前的確認畫面：選難度、提醒會蓋掉沒打完的那場 */
export type Prematch = { stage: number; daily?: string } | null

export interface MatchRewards {
  r: P.Rewards
  rankBefore: number
  rankAfter: number
  finished: P.MissionDef[]
  unlocked: P.AchDef[]
  levelUps: { id: string; lv: number }[]
  gains: Record<string, number>
  /** 這一場新拿到的關卡星星 */
  stars: { text: string; coins: number }[]
  /** 每日挑戰：這一場算不算成績（一天只算第一場） */
  dailyCounted?: boolean
}

interface UI {
  screen: 'home' | 'match' | 'room'
  /** 連線對打中（在房間裡或打牌中） */
  online: OnlineInfo | null
  /** 開房／加入的畫面：true 或預先填好的房號 */
  onlineSheet: boolean | string
  match: M.MatchState | null
  progress: Progress
  settings: Settings
  /** 選起來準備打的牌 */
  sel: number | null
  /** 絕招模式：換牌要選牌、偷看要選人 */
  mode: 'swap' | 'peek' | null
  chiOpen: boolean
  bubbles: Record<number, Bubble | undefined>
  moods: Record<number, Mood | undefined>
  /** 大字特效（碰！吃！槓！） */
  callout: { seat: number; text: string; key: number } | null
  menu: boolean
  learn: LearnTab | null
  /** 從覆盤點進來：直接打開這一課 */
  learnFocus: { ch: string; i: number } | null
  missions: boolean
  shop: boolean
  /** 戰績與成就 */
  records: boolean
  /** 角色：'list' 是全部，角色 id 是那個人的頁面 */
  people: string | null
  /** 問名字的畫面 */
  nameSheet: boolean
  /** 炫耀卡：要做成圖的那一手 */
  bragSnap: P.HandSnap | null
  prematch: Prematch
  /** 上一場的獎勵（結束畫面用） */
  rewards: MatchRewards | null
  toast: { msg: string; key: number } | null
  /** 已經處理過的牌局事件編號（台詞、音效）；每一局重新從 1 開始，所以也記是第幾局 */
  seenEvent: number
  seenHand: number
  /** 這一局教練記下來的打牌（還沒挑過） */
  notes: ReviewNote[]
  /** 這一局結束時挑出來的覆盤 */
  review: ReviewNote[]
  /** 這一局有喊「快了」的對手（危險牌提示會把他算進去） */
  heardTing: boolean[]
  /** 引導局：看過的提示 */
  guideSeen: string[]

  setOnlineSheet(v: boolean | string): void
  /** 開一個新房間（你是房主） */
  createRoom(): void
  joinRoom(code: string): void
  leaveRoom(): void
  /** 房間裡的指令：改設定、開打、再來一場 */
  roomSend(msg: ClientMsg): void
  /** 打開網頁時：從邀請連結、或上次沒離開的房間連回去 */
  bootOnline(): void
  openStage(p: Prematch): void
  startStage(stage: number, opt?: { difficulty?: M.Difficulty; daily?: string; tutorial?: boolean }): void
  resume(): void
  toHome(): void
  tapTile(id: number): void
  claim(d: ClaimDecision): void
  tsumo(): void
  kong(kind: Kind): void
  skill(id: M.SkillId): void
  peekAt(seat: number): void
  setChiOpen(on: boolean): void
  step(): void
  nextHand(): void
  setMenu(on: boolean): void
  setLearn(tab: LearnTab | null, focus?: { ch: string; i: number }): void
  /** 時間到：系統幫你打 */
  autoPlay(): void
  setSettings(s: Partial<Settings>): void
  setSkin(id: string): void
  setMissions(on: boolean): void
  setShop(on: boolean): void
  setRecords(on: boolean): void
  setNameSheet(on: boolean): void
  /** 打開炫耀卡（null 關掉） */
  brag(snap: P.HandSnap | null): void
  setPeople(id: string | null): void
  setOutfit(id: string, on: boolean): void
  claimMission(id: string): void
  taunt(id: string): void
  buyBack(id: string): void
  equipBack(id: string): void
  buySupply(id: M.SkillId): void
  showToast(msg: string): void
  seeGuide(id: string): void
  skipTutorial(): void
  /** 讓對手講一句（泡泡＋配音），有講就回傳 true */
  say(seat: number, key: LineKey, chance?: number): boolean
  processEvents(): void
}

/** 設定存檔的版本：2 = 危險牌提示改成預設關 */
const SETTINGS_VERSION = 2

function loadSettings(): Settings {
  const raw = load<Partial<Settings> & { sound?: boolean; voice?: boolean }>(SETTINGS_KEY) ?? {}
  // 舊版是「音效／配音 開關」，換成音量
  const { sound, voice, ...rest } = raw
  // 舊存檔裡的危險牌提示是當時的預設值（開），不是自己選的：改回新的預設（關）
  if ((rest.v ?? 1) < 2) delete rest.danger
  return {
    sfxVol: sound === false ? 0 : 0.8,
    voiceVol: voice === false ? 0 : 0.9,
    musicVol: 0.45,
    myVoice: 'f',
    fast: false,
    hints: true,
    danger: false,
    turnTime: 20,
    difficulty: 'normal',
    name: '',
    nameAsked: false,
    ...rest,
    rules: { ...DEFAULT_RULES, ...(rest.rules ?? {}) },
    v: SETTINGS_VERSION,
  }
}

const settings0 = loadSettings()
setSfxVolume(settings0.sfxVol)
setVoiceVolume(settings0.voiceVol)
setMusicVolume(settings0.musicVol)

/** 你的名字：沒填就叫「你」 */
export function myName(s: Settings = useUI.getState().settings): string {
  return s.name.trim() || '你'
}

export const useMyName = () => useUI((s) => s.settings.name.trim() || '你')

export function moodFor(stage: number): MusicMood {
  return (['alley', 'party', 'newyear', 'boss'] as const)[stage] ?? 'alley'
}

/** 現在畫面該放的音樂（第一次點畫面、聲音解鎖時用） */
export function currentMood(): MusicMood {
  const { screen, match } = useUI.getState()
  return screen === 'match' && match ? moodFor(match.stage) : 'home'
}

export function savedMatch(): M.MatchState | null {
  const m = load<M.MatchState>(MATCH_KEY)
  return m && m.version === 2 && m.phase !== 'end' ? m : null
}

/** 角色的樣子：好感度滿級、換上新衣服的話用新的 */
export function lookFor(p: Progress, id: string): Look {
  const base = CHARACTERS[id].look
  const o = STORIES[id]?.outfit
  return o && p.outfit[id] && P.affinityLevel(p.affinity[id] ?? 0).lv >= 5 ? { ...base, ...o.look } : base
}

let bubbleKey = 1
let tauntReady = 0
/** 上一次角色鬥嘴的時間（別太常講） */
let banterAt = 0

/** 這個座位用哪個聲音：你是 me-f／me-m，連線的朋友照他選的，電腦是角色 id */
function voiceOf(m: M.MatchState, seat: number, my: Settings['myVoice']): string {
  if (seat === 0) return `me-${my}`
  const p = m.players?.[seat]
  return p?.human ? `me-${p.voice ?? 'f'}` : m.chars[seat]
}

let conn: RoomConn | null = null

function preloadFor(m: M.MatchState, my: Settings['myVoice']) {
  preloadVoices([0, 1, 2, 3].map((s) => voiceOf(m, s, my)))
}

/** 你的動作（不含步數），每日挑戰會記下來 */
type ActBody = M.Act extends [number, ...infer R] ? R : never

export const useUI = create<UI>((set, get) => {
  const apply = (fn: (m: M.MatchState) => M.MatchState, extra: Partial<UI> = {}, act?: ActBody): M.MatchState | null => {
    const { match } = get()
    if (!match) return null
    try {
      const next = fn(match)
      if (act && next.daily) next.log = [...(match.log ?? []), [match.ticks ?? 0, ...act] as M.Act]
      set({ match: next, sel: null, ...extra })
      save(MATCH_KEY, next)
      get().processEvents()
      if (next.phase === 'handEnd' && match.phase === 'play') handEnded(next)
      if (next.phase === 'end' && match.phase !== 'end') finishMatch(next)
      return next
    } catch (e) {
      if (e instanceof M.RuleError) {
        get().showToast(e.message)
        sfx.error()
        return null
      }
      throw e
    }
  }

  const setProgress = (p: Progress) => {
    save(PROGRESS_KEY, p)
    set({ progress: p })
  }

  /** 任務計數；剛完成的任務跳提示 */
  const track = (add: Partial<Record<P.Metric, number>>): P.MissionDef[] => {
    const { p, finished } = P.bump(get().progress, add)
    setProgress(p)
    if (finished.length) window.setTimeout(() => get().showToast(`任務完成：${finished.map((f) => f.text).join('、')}`), 1600)
    return finished
  }

  const announce = (unlocked: P.AchDef[], delay: number) => {
    unlocked.forEach((a, i) => window.setTimeout(() => get().showToast(`成就解鎖：${a.name}`), delay + i * 1800))
  }

  /** 你要打這張：教練先記一下 */
  const note = (m: M.MatchState, tileId: number) => {
    const turn = m.hand.seats[0].discards.length + 1
    const n = judgeDiscard(m, tileId, turn, get().heardTing)
    if (n) set({ notes: [...get().notes, n] })
  }

  const handEnded = (m: M.MatchState) => {
    track(P.handMetrics(m))
    // 尾牙摸彩的金幣直接進口袋
    const prize = (m.result?.extras ?? []).reduce((s, x) => s + (x.coins ?? 0), 0)
    if (prize) setProgress({ ...get().progress, coins: get().progress.coins + prize })
    const rec = P.recordHand(get().progress, m)
    setProgress(rec.p)
    announce(rec.unlocked, 2400)
    collect(m)
    set({ review: pickNotes(get().notes, m) })
  }

  /** 你胡了：收進牌型圖鑑，第一次收集到的跳提示 */
  const collect = (m: M.MatchState) => {
    const al = P.recordAlbum(get().progress, m)
    if (al.p === get().progress) return
    setProgress(al.p)
    al.fresh.forEach((name, i) => window.setTimeout(() => get().showToast(`圖鑑新收集：${name}`), 3200 + i * 1800))
  }

  const finishMatch = (m: M.MatchState) => {
    let p = { ...get().progress }
    p.matches++
    const first = M.ranking(m)[0] === 0
    if (first && !m.daily) {
      p.wins++
      if (m.stage >= p.cleared) {
        p.cleared = m.stage + 1
        const reward = STAGES[m.stage].reward.id
        if (!p.skins.includes(reward)) p.skins = [...p.skins, reward]
      }
    } else if (first) p.wins++
    if (m.tutorial) p.tutorial = true
    const r = P.matchRewards(m)
    const rankBefore = p.rankPts
    p.coins += r.coins
    p.rankPts = Math.max(0, p.rankPts + r.rankDelta)
    const bumped = P.bump(p, P.matchMetrics(m))
    p = bumped.p
    const rec = P.recordMatch(p, m, Object.keys(CHARACTERS))
    p = rec.p
    const st = P.recordStars(p, m)
    p = st.p
    // 每日挑戰：一天只算第一場
    let dailyCounted: boolean | undefined
    if (m.daily) {
      dailyCounted = p.dailyBest?.date !== m.daily
      if (dailyCounted) p.dailyBest = { date: m.daily, place: M.ranking(m).indexOf(0) + 1, points: m.points[0], share: shareText(m, get().settings.name) }
    }
    setProgress(p)
    save(MATCH_KEY, null)
    set({ rewards: { r, rankBefore, rankAfter: p.rankPts, finished: bumped.finished, unlocked: rec.unlocked, levelUps: rec.levelUps, gains: rec.gains, stars: st.fresh, dailyCounted } })
    announce(rec.unlocked, 1800)
    if (first) sfx.win()
    else sfx.lose()
  }

  const newHandState = { notes: [] as ReviewNote[], review: [] as ReviewNote[], heardTing: [false, false, false, false] }

  // ---------- 連線對打 ----------

  /** 你的一步送給房間；畫面等伺服器回傳新的牌局再更新 */
  const move = (mv: M.Move) => {
    conn?.send({ t: 'move', move: mv })
    set({ sel: null, mode: null })
  }

  const connectRoom = (code: string, create: boolean) => {
    conn?.close()
    const { settings } = get()
    let sentRules = false
    conn = new RoomConn({
      code,
      create,
      name: settings.name.trim() || '玩家',
      voice: settings.myVoice,
      onStatus: (status, why) => {
        if (status === 'closed') {
          conn = null
          set({ online: null, screen: 'home', match: null, onlineSheet: false })
          playMusic('home')
          if (why) get().showToast(why)
          return
        }
        const o = get().online
        if (o) set({ online: { ...o, status } })
      },
      onMessage: (msg) => {
        onServer(msg)
        // 開房的人：把自己的牌桌規則帶進房間
        if (create && !sentRules && msg.t === 'room' && msg.players[msg.you]?.host) {
          sentRules = true
          conn?.send({ t: 'settings', settings: { rules: settings.rules, turnTime: settings.turnTime } satisfies Partial<RoomSettings> })
        }
      },
    })
    set({ online: { code, status: 'connecting', room: null, deadline: null, ready: [] }, onlineSheet: false, screen: 'room', match: null, menu: false })
    playMusic('home')
  }

  const onServer = (msg: ServerMsg) => {
    const o = get().online
    if (!o) return
    if (msg.t === 'room') {
      set({ online: { ...o, room: msg } })
      // 回到房間（打完一場，房主按了再來一場）
      if (msg.phase === 'lobby' && get().screen === 'match') set({ screen: 'room', match: null })
      return
    }
    if (msg.t === 'taunt') {
      const m = get().match
      const t = tauntText(msg.id)
      if (!m || !t) return
      if (t.voiced) speak(voiceOf(m, msg.seat, get().settings.myVoice), `taunt.${msg.id}`)
      set({ bubbles: { ...get().bubbles, [msg.seat]: { text: t.text, key: bubbleKey++ } } })
      const k = bubbleKey - 1
      window.setTimeout(() => {
        const b = get().bubbles[msg.seat]
        if (b && b.key === k) set({ bubbles: { ...get().bubbles, [msg.seat]: undefined } })
      }, 2400)
      return
    }
    if (msg.t === 'error') {
      get().showToast(msg.msg)
      sfx.error()
      return
    }
    // 新的牌局畫面
    const prev = get().match
    const m = msg.m
    const deadline = msg.timeLeft === null ? null : Date.now() + msg.timeLeft
    const fresh = !prev || !prev.online || m.handNo < prev.handNo || (prev.phase === 'end' && m.phase !== 'end')
    const extra: Partial<UI> = {}
    if (fresh) {
      // 新的一場，或重新整理後連回來：之前的事件不重播
      Object.assign(extra, { bubbles: {}, moods: {}, callout: null, seenEvent: prev ? 0 : m.hand.eventN, seenHand: m.handNo, sel: null, mode: null, ...newHandState })
      preloadFor(m, get().settings.myVoice)
      playMusic(moodFor(m.stage))
    } else if (m.handNo !== prev.handNo) Object.assign(extra, { bubbles: {}, moods: {}, callout: null, ...newHandState })
    set({ match: m, screen: 'match', online: { ...o, deadline, ready: msg.ready }, ...extra })
    get().processEvents()
    if (prev?.phase === 'play' && m.phase === 'handEnd' && prev.handNo === m.handNo) {
      set({ review: pickNotes(get().notes, m) })
      collect(m)
    }
  }

  return {
    screen: 'home',
    match: null,
    online: null,
    onlineSheet: false,
    progress: P.ensureDaily(P.migrate(load<Progress>(PROGRESS_KEY) ?? {})),
    settings: settings0,
    sel: null,
    mode: null,
    chiOpen: false,
    bubbles: {},
    moods: {},
    callout: null,
    menu: false,
    learn: null,
    learnFocus: null,
    missions: false,
    shop: false,
    records: false,
    people: null,
    // 第一次打開（還沒問過名字、也沒有打過）先問名字
    nameSheet: !settings0.nameAsked && !settings0.name,
    bragSnap: null,
    prematch: null,
    rewards: null,
    toast: null,
    seenEvent: 0,
    seenHand: 0,
    ...newHandState,
    guideSeen: [],

    setOnlineSheet(v) {
      set({ onlineSheet: v })
    },
    createRoom() {
      connectRoom(newCode(), true)
    },
    joinRoom(code) {
      connectRoom(code.trim().toUpperCase(), false)
    },
    leaveRoom() {
      conn?.leave()
      conn = null
      set({ online: null, screen: 'home', match: null, menu: false, mode: null })
      playMusic('home')
    },
    roomSend(msg) {
      conn?.send(msg)
    },
    bootOnline() {
      const fromUrl = roomFromUrl()
      clearRoomFromUrl()
      const code = fromUrl ?? savedRoom()
      if (!code || get().online) return
      // 還沒有名字：先開房間畫面填名字
      if (!get().settings.name.trim()) return set({ onlineSheet: code, nameSheet: false })
      if (fromUrl) set({ nameSheet: false })
      get().joinRoom(code)
    },
    openStage(prematch) {
      set({ prematch })
    },
    startStage(stage, opt = {}) {
      void goLandscape()
      const { settings, progress } = get()
      let match: M.MatchState
      if (opt.daily) {
        const d = dailyInfo(opt.daily)
        match = M.newMatch(d.seed, d.stage, dailyOptions(d.date))
        match.log = []
      } else {
        const tutorial = !!opt.tutorial
        const difficulty = tutorial ? 'easy' : (opt.difficulty ?? settings.difficulty)
        match = M.newMatch(newSeed(), stage, { rules: settings.rules, difficulty, tutorial })
        if (!tutorial && opt.difficulty && opt.difficulty !== settings.difficulty) get().setSettings({ difficulty: opt.difficulty })
        // 商店買的絕招補給這一場用
        const { bonus } = progress
        if (bonus.swap || bonus.peek || bonus.lucky) {
          for (const k of Object.keys(bonus) as M.SkillId[]) match.skills[k] += bonus[k]
          setProgress({ ...get().progress, bonus: { swap: 0, peek: 0, lucky: 0 } })
        }
      }
      save(MATCH_KEY, match)
      set({
        match,
        screen: 'match',
        sel: null,
        mode: null,
        chiOpen: false,
        bubbles: {},
        moods: {},
        callout: null,
        seenEvent: 0,
        seenHand: match.handNo,
        menu: false,
        rewards: null,
        prematch: null,
        guideSeen: [],
        ...newHandState,
      })
      preloadFor(match, settings.myVoice)
      playMusic(moodFor(match.stage))
      sfx.shuffle()
      // 開場：隨便一個對手打招呼（好感度夠的角色會講專屬台詞）；有特別規則就提醒一下
      const seat = 1 + Math.floor(Math.random() * 3)
      const friendly = P.affinityLevel(get().progress.affinity[match.chars[seat]] ?? 0).lv >= 3
      window.setTimeout(() => get().say(seat, friendly && Math.random() < 0.7 ? 'friend' : 'hello'), 500)
      const rule = STAGES[match.stage].ruleText
      if (match.daily) window.setTimeout(() => get().showToast(`每日挑戰：今天大家的牌都一樣${rule ? `。${rule}` : ''}`), 1200)
      else if (rule) window.setTimeout(() => get().showToast(rule), 1200)
      get().processEvents()
    },
    resume() {
      const match = savedMatch()
      if (!match) return
      void goLandscape()
      set({ match, screen: 'match', sel: null, mode: null, bubbles: {}, moods: {}, seenEvent: match.hand.eventN, seenHand: match.handNo, prematch: null, ...newHandState })
      preloadFor(match, get().settings.myVoice)
      playMusic(moodFor(match.stage))
    },
    toHome() {
      set({ screen: 'home', menu: false, mode: null, progress: P.ensureDaily(get().progress) })
      playMusic('home')
    },

    tapTile(id) {
      const { match, sel, mode } = get()
      if (!match || !M.waitingForYou(match) || match.hand.phase !== 'discard') return
      if (mode === 'swap') {
        if (apply((m) => M.useSkill(m, 'swap', id), { mode: null }, ['s', 'swap', id])) {
          sfx.magic()
          get().showToast('換好了')
          track({ skill: 1 })
        }
        return
      }
      if (sel === id) {
        note(match, id)
        if (match.online) {
          move(['d', id])
          sfx.discard()
          buzz(10)
          return
        }
        if (apply((m) => M.discard(m, id), {}, ['d', id])) {
          sfx.discard()
          buzz(10)
        }
        return
      }
      sfx.select()
      buzz(5)
      set({ sel: id })
    },
    claim(d) {
      if (get().match?.online) {
        set({ chiOpen: false })
        move(['c', d])
        if (d.type === 'pass') sfx.click()
        return
      }
      const next = apply((m) => M.claim(m, d), { chiOpen: false }, ['c', d])
      if (next && d.type === 'pass') {
        sfx.click()
        const m = get().match
        if (m && M.rulesOf(m).passWin && m.hand.passedWin?.[0]) get().showToast('過水：摸牌之前不能胡別人打的牌')
      }
    },
    tsumo() {
      if (get().match?.online) return move(['t'])
      apply((m) => M.tsumo(m), {}, ['t'])
    },
    kong(kind) {
      if (get().match?.online) return move(['k', kind])
      apply((m) => M.kong(m, kind), {}, ['k', kind])
    },
    skill(id) {
      const { mode, match } = get()
      if (!match) return
      if (match.online) return get().showToast('連線對打不能用絕招')
      if (id === 'swap') {
        if (mode === 'swap') return set({ mode: null })
        if (!M.waitingForYou(match) || match.hand.phase !== 'discard') return get().showToast('輪到你打牌時才能換')
        if (match.skills.swap <= 0) return get().showToast('這一場用完了')
        set({ mode: 'swap', sel: null })
        get().showToast('點一張要換掉的牌')
        return
      }
      if (id === 'peek') {
        if (mode === 'peek') return set({ mode: null })
        if (match.skills.peek <= 0) return get().showToast('這一場用完了')
        set({ mode: 'peek', sel: null })
        get().showToast('點一家的頭像來偷看')
        return
      }
      if (apply((m) => M.useSkill(m, 'lucky'), {}, ['s', 'lucky'])) {
        sfx.magic()
        get().showToast('下一張會摸到好牌')
        track({ skill: 1 })
      }
    },
    peekAt(seat) {
      if (get().mode !== 'peek') return
      if (apply((m) => M.useSkill(m, 'peek', seat), { mode: null }, ['s', 'peek', seat])) {
        sfx.magic()
        track({ skill: 1 })
      }
    },
    setChiOpen(on) {
      set({ chiOpen: on })
    },
    step() {
      if (get().match?.online) return
      apply((m) => M.step(m))
    },
    nextHand() {
      if (get().match?.online) {
        conn?.send({ t: 'next' })
        return
      }
      apply((m) => M.nextHand(m), { bubbles: {}, moods: {}, callout: null, ...newHandState }, ['n'])
      sfx.shuffle()
    },

    setMenu(menu) {
      set({ menu })
    },
    setLearn(learn, focus) {
      set({ learn, menu: false, learnFocus: focus ?? null })
    },
    autoPlay() {
      const m = get().match
      // 連線時由伺服器代打
      if (!m || m.online || !M.waitingForYou(m)) return
      const h = m.hand
      set({ mode: null, chiOpen: false, sel: null })
      if (h.phase === 'claim') {
        const o = h.options[0]!
        get().claim(o.hu ? { type: 'hu' } : { type: 'pass' })
        get().showToast(o.hu ? '時間到，幫你胡了' : '時間到，自動跳過')
        return
      }
      if (canTsumo(h, 0)) {
        get().tsumo()
        get().showToast('時間到，幫你自摸了')
        return
      }
      // 照電腦建議的打法幫你打一張
      const t = chooseDiscard(h, 0, { speed: 0.5, defense: 0.5, greed: 0.2, mistakes: 0 }, { rng: Date.now() >>> 0 || 1 })
      if (apply((mm) => M.discard(mm, t.id), {}, ['d', t.id])) {
        sfx.discard()
        get().showToast(`時間到，幫你打了${tileName(t.kind)}`)
      }
    },
    setSettings(s) {
      const settings = { ...get().settings, ...s }
      setSfxVolume(settings.sfxVol)
      setVoiceVolume(settings.voiceVol)
      setMusicVolume(settings.musicVol)
      save(SETTINGS_KEY, settings)
      set({ settings })
      const m = get().match
      if (m && s.myVoice) {
        preloadFor(m, settings.myVoice)
        window.setTimeout(() => speak(`me-${settings.myVoice}`, 'call.pon'), 300)
      }
      if (s.musicVol !== undefined && s.musicVol > 0) playMusic(currentMood())
    },
    setSkin(id) {
      setProgress({ ...get().progress, skin: id })
    },
    setMissions(on) {
      set({ missions: on, progress: P.ensureDaily(get().progress) })
    },
    setShop(on) {
      set({ shop: on })
    },
    setNameSheet(on) {
      set({ nameSheet: on })
    },
    brag(snap) {
      set({ bragSnap: snap })
    },
    setRecords(on) {
      set({ records: on })
    },
    setPeople(id) {
      set({ people: id })
    },
    setOutfit(id, on) {
      setProgress({ ...get().progress, outfit: { ...get().progress.outfit, [id]: on } })
    },
    claimMission(id) {
      const before = get().progress.coins
      const p = P.claim(get().progress, id)
      if (p.coins > before) {
        setProgress(p)
        sfx.coin()
      }
    },
    taunt(id) {
      const m = get().match
      const t = tauntText(id)
      if (!m || !t || Date.now() < tauntReady) return
      tauntReady = Date.now() + (t.voiced ? 4000 : 2500)
      if (t.voiced) speak(`me-${get().settings.myVoice}`, `taunt.${id}`)
      set({ bubbles: { ...get().bubbles, 0: { text: t.text, key: bubbleKey++ } } })
      const k = bubbleKey - 1
      window.setTimeout(() => {
        const b = get().bubbles[0]
        if (b && b.key === k) set({ bubbles: { ...get().bubbles, 0: undefined } })
      }, 2200)
      if (m.online) conn?.send({ t: 'taunt', id })
      // 隨便一個電腦對手回嘴（連線時朋友會自己回）
      window.setTimeout(() => get().say(1 + Math.floor(Math.random() * 3), 'reply'), 1100)
    },
    buyBack(id) {
      const p = get().progress
      const b = P.BACK[id]
      if (!b || p.backs.includes(id)) return
      if (p.coins < b.price) return get().showToast('金幣不夠')
      setProgress({ ...p, coins: p.coins - b.price, backs: [...p.backs, id], back: id })
      sfx.coin()
    },
    equipBack(id) {
      const p = get().progress
      if (p.backs.includes(id)) setProgress({ ...p, back: id })
    },
    buySupply(id) {
      const p = get().progress
      const item = P.SUPPLY.find((x) => x.id === id)!
      if (p.coins < item.price) return get().showToast('金幣不夠')
      setProgress({ ...p, coins: p.coins - item.price, bonus: { ...p.bonus, [id]: p.bonus[id] + 1 } })
      sfx.coin()
    },
    showToast(msg) {
      set({ toast: { msg, key: Date.now() } })
    },
    seeGuide(id) {
      if (!get().guideSeen.includes(id)) set({ guideSeen: [...get().guideSeen, id] })
    },
    skipTutorial() {
      setProgress({ ...get().progress, tutorial: true })
      const m = get().match
      if (m?.tutorial) {
        const next = { ...m, tutorial: false }
        set({ match: next })
        save(MATCH_KEY, next)
      }
    },

    say(seat, key, chance = 1) {
      const m = get().match
      if (!m || seat === 0 || m.players?.[seat]?.human || Math.random() > chance) return false
      const ls = CHARACTERS[m.chars[seat]]?.lines[key]
      if (!ls?.length) return false
      const i = Math.floor(Math.random() * ls.length)
      const text = ls[i]
      speak(m.chars[seat], `line.${key}.${i}`)
      set({ bubbles: { ...get().bubbles, [seat]: { text, key: bubbleKey++ } } })
      if (key === 'ting') {
        const heard = [...get().heardTing]
        heard[seat] = true
        set({ heardTing: heard })
      }
      const k = bubbleKey - 1
      window.setTimeout(() => {
        const b = get().bubbles[seat]
        if (b && b.key === k) set({ bubbles: { ...get().bubbles, [seat]: undefined } })
      }, 2600)
      return true
    },

    /** 看新的牌局事件：放音效、讓角色講話、換表情 */
    processEvents() {
      const m = get().match
      if (!m) return
      const seen = get().seenHand === m.handNo ? get().seenEvent : 0
      const evs = m.hand.events.filter((x) => x.n > seen)
      if (get().seenHand !== m.handNo) set({ seenHand: m.handNo, seenEvent: 0 })
      if (!evs.length) return
      set({ seenEvent: evs[evs.length - 1].n })
      for (const { e } of evs) react(e, m)
    },
  }

  /** 兩個電腦角色鬥嘴一下（一局最多講幾次，間隔至少 40 秒） */
  function banter() {
    const m = get().match
    if (!m || m.phase !== 'play' || m.hand.phase === 'over' || Date.now() - banterAt < 40000 || Math.random() > 0.08) return
    const seatOf = (id: string) => [1, 2, 3].find((s) => m.chars[s] === id && !m.players?.[s]?.human)
    const options = BANTER.map((x, n) => ({ x, n, sa: seatOf(x.a), sb: seatOf(x.b) })).filter((o) => o.sa !== undefined && o.sb !== undefined)
    if (!options.length) return
    const bubbles = get().bubbles
    const o = options[Math.floor(Math.random() * options.length)]
    if (bubbles[o.sa!] || bubbles[o.sb!]) return
    banterAt = Date.now()
    const show = (seat: number, id: string, text: string) => {
      speak(id, `banter.${o.n}`)
      set({ bubbles: { ...get().bubbles, [seat]: { text, key: bubbleKey++ } } })
      const k = bubbleKey - 1
      window.setTimeout(() => {
        const b = get().bubbles[seat]
        if (b && b.key === k) set({ bubbles: { ...get().bubbles, [seat]: undefined } })
      }, 2800)
    }
    show(o.sa!, o.x.a, o.x.say)
    window.setTimeout(() => {
      const now = get().match
      if (now && now.handNo === m.handNo && now.hand.phase !== 'over') show(o.sb!, o.x.b, o.x.reply)
    }, 2300)
  }

  function mood(seat: number, md: Mood) {
    set({ moods: { ...get().moods, [seat]: md } })
    window.setTimeout(() => set({ moods: { ...get().moods, [seat]: undefined } }), 3200)
  }

  function callout(seat: number, text: string) {
    set({ callout: { seat, text, key: bubbleKey++ } })
  }

  function react(e: HandEvent, m: M.MatchState) {
    const say = get().say
    const my = get().settings.myVoice
    const voice = (seat: number, key: string) => speak(voiceOf(m, seat, my), key)
    switch (e.t) {
      case 'discard':
        if (e.seat !== 0) sfx.discard()
        voice(e.seat, `tile.${e.tile.kind}`)
        if (e.seat !== 0) window.setTimeout(() => banter(), 1100)
        break
      case 'draw':
        if (e.seat === 0) sfx.draw()
        break
      case 'flower':
        sfx.flower()
        break
      case 'chi':
      case 'pon':
      case 'kong':
        callout(e.seat, { chi: '吃', pon: '碰', kong: '槓' }[e.t])
        sfx.call(e.t)
        // 有講台詞（「碰！這張我等很久了」）就不另外喊，不然只喊一聲「碰！」
        if (!say(e.seat, e.t, 0.6)) voice(e.seat, `call.${e.t}`)
        break
      case 'ankan':
      case 'kakan':
        callout(e.seat, '槓')
        sfx.call('kong')
        if (!say(e.seat, 'kong', 0.6)) voice(e.seat, 'call.kong')
        break
      case 'ting':
        say(e.seat, 'ting', 0.45)
        break
      case 'skill': {
        const name = CHARACTERS[m.chars[e.seat]].name
        callout(e.seat, M.SKILLS[e.id].name)
        sfx.magic()
        say(e.seat, 'skill')
        window.setTimeout(() => get().showToast(e.id === 'peek' ? `${name}偷看了你的手牌！` : `${name}用了「${M.SKILLS[e.id].name}」`), 300)
        break
      }
      case 'win': {
        // 胡牌由桌子中間的大章負責，不另外跳字
        sfx.hu()
        buzz(40)
        mood(e.seat, 'happy')
        if (!say(e.seat, e.from === null ? 'tsumo' : 'ron')) voice(e.seat, e.from === null ? 'call.tsumo' : 'call.hu')
        if (M.winsOf(m.hand).some((w) => w.seat === e.seat && w.score.items.some((x) => x.name === '搶槓'))) callout(e.seat, '搶槓')
        if (e.from !== null) {
          mood(e.from, 'sad')
          window.setTimeout(() => say(e.from!, 'dealIn', 0.8), 900)
        } else {
          for (const s of [1, 2, 3]) if (s !== e.seat) mood(s, 'sad')
        }
        break
      }
      case 'exhausted': {
        sfx.exhausted()
        const s = 1 + Math.floor(Math.random() * 3)
        say(s, 'exhausted', 0.8)
        break
      }
    }
  }
})

export function tableSkin(id: string) {
  return SKINS[id] ?? SKINS.mint
}
