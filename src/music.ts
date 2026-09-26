// 背景音樂：用 WebAudio 即時合成，不用下載音檔。每一關一種氣氛：
//   home     首頁：輕快的汽水流行
//   alley    巷口麻將：慵懶的 lo-fi
//   party    公司尾牙：熱鬧的迪斯可
//   newyear  過年回老家：五聲音階、木魚、鑼
//   boss     雀神挑戰：小調、緊張
// 旋律用固定種子產生（每次聽到的都一樣），一輪 16 小節：A A B A，下一輪換一點變化。

import { audioContext } from './sfx'
import { speaking } from './voice'

export type MusicMood = 'home' | 'alley' | 'party' | 'newyear' | 'boss'

type Lead = 'pluck' | 'bell' | 'square' | 'epiano'

interface Song {
  bpm: number
  /** 後半拍往後推多少（0–0.3），lo-fi 的搖擺感 */
  swing: number
  /** 每小節一個和弦（MIDI 音高） */
  chords: number[][]
  /** 旋律用的音 */
  scale: number[]
  lead: Lead
  /** 每個八分音符出現旋律的機率 */
  density: number
  kick: string
  snare: string
  hat: string
  /** 貝斯：16 格，數字是和弦的第幾個音（- 不彈、o 高八度根音） */
  bass: string
  pad: number
  /** 過年：木魚、每 8 小節一聲鑼 */
  festive?: boolean
}

const SONGS: Record<MusicMood, Song> = {
  home: {
    bpm: 108,
    swing: 0.04,
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60, 64],
      [55, 59, 62],
    ],
    scale: [72, 74, 76, 79, 81, 84, 86, 88],
    lead: 'pluck',
    density: 0.5,
    kick: 'x.....x.x.......',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bass: '0.....0.0...2...',
    pad: 0.5,
  },
  alley: {
    bpm: 80,
    swing: 0.2,
    chords: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ],
    scale: [67, 69, 72, 74, 76, 79, 81],
    lead: 'epiano',
    density: 0.32,
    kick: 'x.........x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.xx',
    bass: '0.......0.2.....',
    pad: 0.7,
  },
  party: {
    bpm: 120,
    swing: 0,
    chords: [
      [53, 57, 60],
      [55, 59, 62],
      [52, 55, 59],
      [57, 60, 64],
    ],
    scale: [69, 72, 74, 76, 79, 81, 84],
    lead: 'square',
    density: 0.55,
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bass: '0.o.0.o.0.o.0.o.',
    pad: 0.35,
  },
  newyear: {
    bpm: 112,
    swing: 0,
    chords: [
      [50, 54, 57],
      [55, 59, 62],
      [57, 61, 64],
      [50, 54, 57],
    ],
    scale: [74, 76, 78, 81, 83, 86, 88],
    lead: 'pluck',
    density: 0.62,
    kick: 'x.......x.......',
    snare: '............x...',
    hat: '',
    bass: '0...2...0...1...',
    pad: 0.3,
    festive: true,
  },
  boss: {
    bpm: 92,
    swing: 0,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [50, 53, 57],
      [52, 56, 59],
    ],
    scale: [69, 71, 72, 76, 77, 81],
    lead: 'bell',
    density: 0.26,
    kick: 'x.....x...x.....',
    snare: '........x.......',
    hat: '..x...x...x...x.',
    bass: '0.0.0.0.0.0.0.0.',
    pad: 0.8,
  },
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

let ctx: AudioContext | null = null
let out: GainNode | null = null
let send: GainNode | null = null
let noise: AudioBuffer | null = null
let volume = 0.5
let want: MusicMood | null = null
let playing: MusicMood | null = null
let timer = 0
let step = 0
let nextAt = 0
let phrases: number[][][] = []
let cycle = 0

/** 音樂音量 0–1（0 = 關） */
export function setMusicVolume(v: number) {
  volume = v
  if (out && ctx) out.gain.setTargetAtTime(gainFor(v), ctx.currentTime, 0.1)
  if (v <= 0) stop()
  else if (want) start(want)
}

const gainFor = (v: number) => 0.3 * v

/** 換一首（同一首就繼續放） */
export function playMusic(mood: MusicMood) {
  want = mood
  if (volume <= 0 || playing === mood) return
  start(mood)
}

export function stopMusic() {
  want = null
  stop()
}

function setup(): boolean {
  if (ctx) return true
  ctx = audioContext()
  if (!ctx) return false
  out = ctx.createGain()
  out.gain.value = gainFor(volume)
  out.connect(ctx.destination)
  // 一點點回音，讓合成器不那麼乾
  send = ctx.createGain()
  send.gain.value = 0.28
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.33
  const fb = ctx.createGain()
  fb.gain.value = 0.3
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  send.connect(delay)
  delay.connect(lp)
  lp.connect(fb)
  fb.connect(delay)
  lp.connect(out)
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    else if (want && volume > 0) start(want)
  })
  return true
}

function start(mood: MusicMood) {
  if (!setup() || !ctx || document.hidden) return
  stop()
  playing = mood
  step = 0
  cycle = 0
  phrases = makePhrases(SONGS[mood], mood.length * 97 + 11)
  nextAt = ctx.currentTime + 0.12
  out!.gain.cancelScheduledValues(ctx.currentTime)
  out!.gain.setValueAtTime(0.0001, ctx.currentTime)
  out!.gain.exponentialRampToValueAtTime(gainFor(volume), ctx.currentTime + 1.2)
  timer = window.setInterval(tick, 30)
}

function stop() {
  if (timer) window.clearInterval(timer)
  timer = 0
  if (ctx && out && playing) {
    // 淡出，已經排好的音符讓它自己結束
    out.gain.cancelScheduledValues(ctx.currentTime)
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15)
  }
  playing = null
}

function tick() {
  if (!ctx || !playing) return
  if (ctx.state !== 'running') {
    nextAt = ctx.currentTime + 0.1
    return
  }
  // 有人講話時音樂小聲一點
  const duck = speaking() ? 0.55 : 1
  out!.gain.setTargetAtTime(gainFor(volume) * duck, ctx.currentTime, 0.12)
  const song = SONGS[playing]
  const sixteenth = 60 / song.bpm / 4
  while (nextAt < ctx.currentTime + 0.15) {
    const swing = step % 2 === 1 ? song.swing * sixteenth : 0
    play(song, step, nextAt + swing)
    nextAt += sixteenth
    step++
    if (step % (16 * 16) === 0) {
      cycle++
      phrases = makePhrases(song, playing.length * 97 + 11 + cycle * 7)
    }
  }
}

// ---------- 旋律 ----------

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 兩段旋律（A、B），每段 4 小節 × 16 格；0 = 不彈 */
function makePhrases(song: Song, seed: number): number[][][] {
  const r = rng(seed)
  const make = (lift: number) => {
    let pos = Math.floor(song.scale.length / 2)
    return [0, 1, 2, 3].map((bar) => {
      const chord = song.chords[bar]
      const cells = new Array<number>(16).fill(0)
      for (let s = 0; s < 16; s += 2) {
        const strong = s % 8 === 0
        if (r() > song.density + (strong ? 0.25 : 0) - (bar === 3 && s >= 10 ? 0.5 : 0)) continue
        pos = Math.max(0, Math.min(song.scale.length - 1, pos + Math.round((r() - 0.5) * 3.2) + (r() < lift ? 1 : 0)))
        let note = song.scale[pos]
        // 強拍盡量落在和弦音上
        if (strong) {
          const tones = song.scale.filter((n) => chord.some((c) => (n - c) % 12 === 0))
          if (tones.length) note = tones.reduce((b, n) => (Math.abs(n - note) < Math.abs(b - note) ? n : b), tones[0])
        }
        cells[s] = note
        // 偶爾來個十六分音符裝飾
        if (song.density > 0.45 && r() < 0.18 && s + 1 < 16) cells[s + 1] = song.scale[Math.max(0, pos - 1)]
      }
      // 樂句最後一小節收在根音
      if (bar === 3) {
        const root = song.scale.find((n) => (n - chord[0]) % 12 === 0)
        if (root) cells[0] = root
      }
      return cells
    })
  }
  return [make(0.1), make(0.3)]
}

// ---------- 樂器 ----------

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function osc(type: OscillatorType, freq: number, t: number, dur: number, peak: number, attack = 0.005, dest: AudioNode = out!, sendAmt = 0) {
  const c = ctx!
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  env(g, t, peak, attack, dur)
  o.connect(g).connect(dest)
  if (sendAmt && send) {
    const s = c.createGain()
    s.gain.value = sendAmt
    g.connect(s).connect(send)
  }
  o.start(t)
  o.stop(t + attack + dur + 0.05)
  return o
}

function filtered(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx!.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  f.connect(out!)
  return f
}

function lead(kind: Lead, midi: number, t: number, len: number) {
  const f = hz(midi)
  if (kind === 'pluck') {
    // 像古箏／木吉他：三角波＋高八度的正弦，很快衰減
    osc('triangle', f, t, 0.55, 0.32, 0.003, out!, 0.35)
    osc('sine', f * 2, t, 0.25, 0.1, 0.003, out!, 0.2)
  } else if (kind === 'epiano') {
    osc('sine', f, t, 0.9, 0.3, 0.01, out!, 0.4)
    osc('triangle', f * 2, t, 0.3, 0.05, 0.005)
  } else if (kind === 'bell') {
    osc('sine', f, t, 1.4, 0.24, 0.004, out!, 0.5)
    osc('sine', f * 3.01, t, 0.5, 0.07, 0.002, out!, 0.3)
  } else {
    const lp = filtered('lowpass', 2200)
    osc('square', f, t, Math.min(0.28, len), 0.12, 0.004, lp, 0.25)
  }
}

function pad(chord: number[], t: number, len: number, level: number) {
  if (!level) return
  const lp = filtered('lowpass', 900)
  for (const n of chord) {
    for (const det of [-6, 6]) {
      const o = osc('sawtooth', hz(n), t, len, 0.022 * level, 0.35, lp)
      o.detune.value = det
    }
  }
}

function kick(t: number) {
  const c = ctx!
  const o = c.createOscillator()
  const g = c.createGain()
  o.frequency.setValueAtTime(130, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
  env(g, t, 0.9, 0.002, 0.22)
  o.connect(g).connect(out!)
  o.start(t)
  o.stop(t + 0.3)
}

function hiss(t: number, type: BiquadFilterType, freq: number, peak: number, dur: number) {
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noise
  const f = filtered(type, freq, 0.9)
  const g = c.createGain()
  env(g, t, peak, 0.002, dur)
  f.disconnect()
  src.connect(f).connect(g).connect(out!)
  src.start(t, Math.random() * 0.5, dur + 0.05)
}

function woodblock(t: number, high: boolean) {
  osc('sine', high ? 1250 : 900, t, 0.07, 0.3, 0.001)
}

function gong(t: number) {
  for (const [f, a] of [
    [98, 0.16],
    [147.5, 0.08],
    [233, 0.05],
    [311, 0.03],
  ] as const) {
    osc('sine', f, t, 2.6, a, 0.01, out!, 0.3)
  }
  hiss(t, 'bandpass', 2600, 0.06, 0.9)
}

function play(song: Song, s: number, t: number) {
  const bar = Math.floor(s / 16)
  const cell = s % 16
  const chord = song.chords[bar % song.chords.length]
  const barLen = (60 / song.bpm) * 4
  // 16 小節：A A B A
  const form = [0, 0, 1, 0][Math.floor(bar / 4) % 4]
  const note = phrases[form]?.[bar % 4]?.[cell]

  if (cell === 0) pad(chord, t, barLen * 0.95, song.pad)
  if (song.kick[cell] === 'x') kick(t)
  if (song.snare[cell] === 'x') hiss(t, 'bandpass', 1800, 0.22, 0.14)
  if (song.hat[cell] === 'x') hiss(t, 'highpass', 7500, cell % 4 === 0 ? 0.06 : 0.04, 0.035)
  if (song.festive) {
    if (cell % 4 === 2) woodblock(t, cell === 6 || cell === 14)
    if (cell === 0 && bar % 8 === 0) gong(t)
  }
  const b = song.bass[cell]
  if (b && b !== '.' && b !== '-') {
    const n = b === 'o' ? chord[0] - 12 : chord[Number(b)] - 24
    osc('triangle', hz(n), t, 0.26, 0.42, 0.004)
    osc('sine', hz(n), t, 0.3, 0.3, 0.004)
  }
  if (note) lead(song.lead, note, t, (60 / song.bpm) / 2)
}
