import { create } from 'zustand'
import * as G from './engine/game'
import { newSeed } from './engine/rng'
import type { RunState, Step } from './engine/types'
import { buzz, setSoundEnabled, sfx } from './sfx'

const SAVE_KEY = 'hule.run.v1'
const SETTINGS_KEY = 'hule.settings.v1'

function load<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

function store(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 無痕模式或空間滿了：存不了就算了，遊戲照玩
  }
}

export type Info =
  | { kind: 'god'; uid: number }
  | { kind: 'item'; uid: number }
  | { kind: 'slot'; index: number }
  | { kind: 'boss' }
  | null

interface Settings {
  speed: number
  sound: boolean
}

interface UI {
  screen: 'title' | 'run'
  run: RunState | null
  /** 選取的手牌 id，依點選順序 */
  sel: number[]
  /** 計分動畫播到第幾步；-1 = 蓋印章那一下 */
  seq: number
  /** 最近一次讓手牌離開的原因（決定離場動畫） */
  lastAction: 'play' | 'discard' | null
  info: Info
  help: boolean
  menu: boolean
  toast: { msg: string; key: number } | null
  settings: Settings

  newRun(): void
  resume(): void
  toTitle(): void
  toggle(id: number): void
  clearSel(): void
  play(): void
  discard(): void
  advance(): void
  skip(): void
  resolve(): void
  collect(): void
  buy(index: number): void
  reroll(): void
  next(): void
  sellGod(uid: number): void
  sellItem(uid: number): void
  moveGod(uid: number, dir: -1 | 1): void
  applyItem(uid: number): void
  endless(): void
  setInfo(info: Info): void
  setHelp(on: boolean): void
  setMenu(on: boolean): void
  setSettings(s: Partial<Settings>): void
  showToast(msg: string): void
}

const savedSettings = load<Settings>(SETTINGS_KEY) ?? { speed: 1, sound: true }
setSoundEnabled(savedSettings.sound)

export function hasSave(): boolean {
  const r = load<RunState>(SAVE_KEY)
  return !!r && r.version === 1 && r.phase !== 'gameover' && r.phase !== 'victory'
}

function stepSound(s: Step, i: number) {
  switch (s.t) {
    case 'meld':
      if (s.debuff) sfx.debuff()
      else sfx.place()
      break
    case 'tile':
      if (s.debuff) sfx.debuff()
      else if (s.mult) sfx.mult(i)
      else sfx.chip(i)
      break
    case 'pattern':
      sfx.mult(i)
      break
    case 'god':
      if (s.xmult) sfx.xmult()
      else if (s.mult) sfx.mult(i)
      else if (s.coins) sfx.coin()
      else sfx.chip(i)
      break
  }
}

export const useUI = create<UI>((set, get) => {
  /** 跑一個引擎動作；不合法就跳提示，不會壞掉 */
  const apply = (fn: (r: RunState) => RunState, extra: Partial<UI> = {}): RunState | null => {
    const { run } = get()
    if (!run) return null
    try {
      const next = fn(run)
      set({ run: next, sel: [], ...extra })
      store(SAVE_KEY, next)
      return next
    } catch (e) {
      if (e instanceof G.GameError) {
        get().showToast(e.message)
        sfx.error()
        return null
      }
      throw e
    }
  }

  const afterMove = (next: RunState | null) => {
    if (!next?.round) return
    if (next.round.status === 'hu') {
      sfx.seal()
      sfx.gong()
      buzz(30)
    } else if (next.round.status === 'draw') {
      sfx.seal()
    }
  }

  return {
    screen: 'title',
    run: null,
    sel: [],
    seq: -1,
    lastAction: null,
    info: null,
    help: false,
    menu: false,
    toast: null,
    settings: savedSettings,

    newRun() {
      const run = G.newRun(newSeed())
      store(SAVE_KEY, run)
      set({ run, screen: 'run', sel: [], seq: -1, info: null, menu: false, lastAction: null })
      sfx.place()
    },
    resume() {
      const run = load<RunState>(SAVE_KEY)
      if (run) set({ run, screen: 'run', sel: [], seq: -1, info: null })
    },
    toTitle() {
      const { run } = get()
      if (run && (run.phase === 'gameover' || run.phase === 'victory')) store(SAVE_KEY, null)
      set({ screen: 'title', menu: false, info: null })
    },

    toggle(id) {
      const { sel, run } = get()
      if (run?.round?.status !== 'play') return
      sfx.select()
      buzz(5)
      set({ sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] })
    },
    clearSel() {
      set({ sel: [] })
    },
    play() {
      const next = apply((r) => G.playMeld(r, get().sel), { seq: -1, lastAction: 'play' })
      if (next) {
        sfx.place()
        buzz(12)
      }
      afterMove(next)
    },
    discard() {
      const next = apply((r) => G.discard(r, get().sel), { seq: -1, lastAction: 'discard' })
      if (next) sfx.discard()
      afterMove(next)
    },

    advance() {
      const { run, seq } = get()
      const steps = run?.round?.score?.steps
      if (!steps) return
      const i = seq + 1
      set({ seq: i })
      if (i < steps.length) stepSound(steps[i], i)
      else sfx.total()
    },
    skip() {
      const { run, seq } = get()
      const steps = run?.round?.score?.steps
      if (!steps || seq >= steps.length) return
      set({ seq: steps.length })
      sfx.total()
    },
    resolve() {
      const next = apply((r) => G.resolveScore(r), { seq: -1, lastAction: null })
      if (!next) return
      if (next.phase === 'cashout') {
        sfx.win()
        buzz(40)
      } else if (next.phase === 'gameover') {
        sfx.lose()
      } else afterMove(next)
    },
    collect() {
      if (apply((r) => G.collect(r))) sfx.coin()
    },
    buy(index) {
      if (apply((r) => G.buy(r, index), { info: null })) sfx.coin()
    },
    reroll() {
      if (apply((r) => G.reroll(r))) sfx.click()
    },
    next() {
      if (apply((r) => G.nextRound(r), { seq: -1, lastAction: null })) sfx.place()
    },
    sellGod(uid) {
      if (apply((r) => G.sellGod(r, uid), { info: null })) sfx.coin()
    },
    sellItem(uid) {
      if (apply((r) => G.sellItem(r, uid), { info: null })) sfx.coin()
    },
    moveGod(uid, dir) {
      const sel = get().sel
      apply((r) => G.moveGod(r, uid, dir), { sel })
    },
    applyItem(uid) {
      const next = apply((r) => G.useItem(r, uid, get().sel), { info: null })
      if (next) {
        sfx.mult(4)
        afterMove(next)
      }
    },
    endless() {
      if (apply((r) => G.continueEndless(r), { seq: -1 })) sfx.place()
    },

    setInfo(info) {
      set({ info })
      if (info) sfx.click()
    },
    setHelp(help) {
      set({ help, menu: false })
    },
    setMenu(menu) {
      set({ menu })
    },
    setSettings(s) {
      const settings = { ...get().settings, ...s }
      setSoundEnabled(settings.sound)
      store(SETTINGS_KEY, settings)
      set({ settings })
    },
    showToast(msg) {
      set({ toast: { msg, key: Date.now() } })
    },
  }
})
