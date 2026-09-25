import { create } from 'zustand'
import { CHARACTERS, line, type LineKey } from './engine/characters'
import * as M from './engine/match'
import { newSeed } from './engine/rng'
import { SKINS, STAGES } from './engine/stages'
import type { ClaimDecision, HandEvent } from './engine/table'
import type { Kind } from './engine/tiles'
import { buzz, setSoundEnabled, sfx } from './sfx'

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

export interface Progress {
  /** 已經過了幾關（0 = 一關都還沒過） */
  cleared: number
  skins: string[]
  skin: string
  wins: number
  matches: number
}

export interface Settings {
  sound: boolean
  fast: boolean
  hints: boolean
}

export interface Bubble {
  text: string
  key: number
}

export type Mood = 'normal' | 'happy' | 'sad'

interface UI {
  screen: 'home' | 'match'
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
  help: boolean
  toast: { msg: string; key: number } | null
  /** 已經處理過的牌局事件編號（台詞、音效） */
  seenEvent: number

  startStage(stage: number): void
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
  setHelp(on: boolean): void
  setSettings(s: Partial<Settings>): void
  setSkin(id: string): void
  showToast(msg: string): void
  say(seat: number, key: LineKey, chance?: number): void
  processEvents(): void
}

const defaultProgress: Progress = { cleared: 0, skins: ['mint'], skin: 'mint', wins: 0, matches: 0 }
const settings0 = { sound: true, fast: false, hints: true, ...(load<Settings>(SETTINGS_KEY) ?? {}) }
setSoundEnabled(settings0.sound)

export function savedMatch(): M.MatchState | null {
  const m = load<M.MatchState>(MATCH_KEY)
  return m && m.version === 2 && m.phase !== 'end' ? m : null
}

let bubbleKey = 1

export const useUI = create<UI>((set, get) => {
  const apply = (fn: (m: M.MatchState) => M.MatchState, extra: Partial<UI> = {}): M.MatchState | null => {
    const { match } = get()
    if (!match) return null
    try {
      const next = fn(match)
      set({ match: next, sel: null, ...extra })
      save(MATCH_KEY, next)
      get().processEvents()
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

  const finishMatch = (m: M.MatchState) => {
    const p = { ...get().progress }
    p.matches++
    const first = M.ranking(m)[0] === 0
    if (first) {
      p.wins++
      if (m.stage >= p.cleared) {
        p.cleared = m.stage + 1
        const reward = STAGES[m.stage].reward.id
        if (!p.skins.includes(reward)) p.skins = [...p.skins, reward]
      }
    }
    save(PROGRESS_KEY, p)
    save(MATCH_KEY, null)
    set({ progress: p })
    if (first) sfx.win()
    else sfx.lose()
  }

  return {
    screen: 'home',
    match: null,
    progress: { ...defaultProgress, ...(load<Progress>(PROGRESS_KEY) ?? {}) },
    settings: settings0,
    sel: null,
    mode: null,
    chiOpen: false,
    bubbles: {},
    moods: {},
    callout: null,
    menu: false,
    help: false,
    toast: null,
    seenEvent: 0,

    startStage(stage) {
      const match = M.newMatch(newSeed(), stage)
      save(MATCH_KEY, match)
      set({ match, screen: 'match', sel: null, mode: null, chiOpen: false, bubbles: {}, moods: {}, callout: null, seenEvent: 0, menu: false })
      sfx.shuffle()
      // 開場：隨便一個對手打招呼
      const seat = 1 + Math.floor(Math.random() * 3)
      window.setTimeout(() => get().say(seat, 'hello'), 500)
      get().processEvents()
    },
    resume() {
      const match = savedMatch()
      if (!match) return
      set({ match, screen: 'match', sel: null, mode: null, bubbles: {}, moods: {}, seenEvent: match.hand.eventN })
    },
    toHome() {
      set({ screen: 'home', menu: false, mode: null })
    },

    tapTile(id) {
      const { match, sel, mode } = get()
      if (!match || !M.waitingForYou(match) || match.hand.phase !== 'discard') return
      if (mode === 'swap') {
        if (apply((m) => M.useSkill(m, 'swap', id), { mode: null })) {
          sfx.magic()
          get().showToast('換好了')
        }
        return
      }
      if (sel === id) {
        if (apply((m) => M.discard(m, id))) {
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
      const next = apply((m) => M.claim(m, d), { chiOpen: false })
      if (next && d.type === 'pass') sfx.click()
    },
    tsumo() {
      apply((m) => M.tsumo(m))
    },
    kong(kind) {
      apply((m) => M.kong(m, kind))
    },
    skill(id) {
      const { mode, match } = get()
      if (!match) return
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
      if (apply((m) => M.useSkill(m, 'lucky'))) {
        sfx.magic()
        get().showToast('下一張會摸到好牌')
      }
    },
    peekAt(seat) {
      if (get().mode !== 'peek') return
      if (apply((m) => M.useSkill(m, 'peek', seat), { mode: null })) sfx.magic()
    },
    setChiOpen(on) {
      set({ chiOpen: on })
    },
    step() {
      apply((m) => M.step(m))
    },
    nextHand() {
      apply((m) => M.nextHand(m), { bubbles: {}, moods: {}, callout: null })
      sfx.shuffle()
    },

    setMenu(menu) {
      set({ menu })
    },
    setHelp(help) {
      set({ help, menu: false })
    },
    setSettings(s) {
      const settings = { ...get().settings, ...s }
      setSoundEnabled(settings.sound)
      save(SETTINGS_KEY, settings)
      set({ settings })
    },
    setSkin(id) {
      const p = { ...get().progress, skin: id }
      save(PROGRESS_KEY, p)
      set({ progress: p })
    },
    showToast(msg) {
      set({ toast: { msg, key: Date.now() } })
    },

    say(seat, key, chance = 1) {
      const m = get().match
      if (!m || seat === 0 || Math.random() > chance) return
      const ch = CHARACTERS[m.chars[seat]]
      const text = line(ch, key, Math.random())
      if (!text) return
      set({ bubbles: { ...get().bubbles, [seat]: { text, key: bubbleKey++ } } })
      const k = bubbleKey - 1
      window.setTimeout(() => {
        const b = get().bubbles[seat]
        if (b && b.key === k) set({ bubbles: { ...get().bubbles, [seat]: undefined } })
      }, 2600)
    },

    /** 看新的牌局事件：放音效、讓角色講話、換表情 */
    processEvents() {
      const m = get().match
      if (!m) return
      const evs = m.hand.events.filter((x) => x.n > get().seenEvent)
      if (!evs.length) return
      set({ seenEvent: evs[evs.length - 1].n })
      for (const { e } of evs) react(e, m)
    },
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
    switch (e.t) {
      case 'discard':
        if (e.seat !== 0) sfx.discard()
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
        say(e.seat, e.t, 0.75)
        break
      case 'ankan':
      case 'kakan':
        callout(e.seat, '槓')
        sfx.call('kong')
        say(e.seat, 'kong', 0.75)
        break
      case 'ting':
        say(e.seat, 'ting', 0.45)
        break
      case 'win': {
        // 胡牌由桌子中間的大章負責，不另外跳字
        sfx.hu()
        buzz(40)
        mood(e.seat, 'happy')
        if (e.seat !== 0) say(e.seat, e.from === null ? 'tsumo' : 'ron')
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
    void m
  }
})

export function tableSkin(id: string) {
  return SKINS[id] ?? SKINS.mint
}
