// 所有音效都用 WebAudio 即時合成，不用下載素材。
// iOS 要在使用者第一次觸控時才能啟動聲音，所以 main.tsx 在第一次 pointerdown 呼叫 unlockAudio()。

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let volume = 1

/** 音效音量 0–1（0 = 關） */
export function setSfxVolume(v: number) {
  volume = v
  enabled = v > 0
  if (master) master.gain.value = 0.55 * v
}

function ac(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.55 * volume
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlockAudio() {
  ac()
}

/** 給配音用：共用同一個 AudioContext（iOS 只解鎖一次） */
export function audioContext(): AudioContext | null {
  return ac()
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  attack?: number
  delay?: number
  slideTo?: number
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const c = enabled ? ac() : null
  if (!c || !master) return
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t0 + (o.attack ?? 0.005))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

let noiseBuf: AudioBuffer | null = null
function noise(dur: number, o: { freq?: number; q?: number; gain?: number; delay?: number; filter?: BiquadFilterType } = {}) {
  const c = enabled ? ac() : null
  if (!c || !master) return
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t0 = c.currentTime + (o.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = o.filter ?? 'bandpass'
  f.frequency.value = o.freq ?? 2000
  f.Q.value = o.q ?? 1
  const g = c.createGain()
  g.gain.setValueAtTime(o.gain ?? 0.2, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// 五聲音階（宮商角徵羽），計分時一步一步往上爬
const PENTA = [0, 2, 4, 7, 9]
function penta(i: number, base = 392): number {
  // 最多爬兩個八度，之後停在最高音，不然長的計分會爬到聽不見
  i = Math.max(0, Math.min(i, 12))
  const n = PENTA[i % 5] + 12 * Math.floor(i / 5)
  return base * 2 ** (n / 12)
}

export const sfx = {
  select() {
    noise(0.035, { freq: 4200, q: 2.5, gain: 0.16 })
  },
  // 打牌：牌碰桌面的「喀」
  discard() {
    noise(0.05, { freq: 1900, q: 3, gain: 0.5 })
    noise(0.04, { freq: 2900, q: 3, gain: 0.25, delay: 0.045 })
    tone(210, 0.06, { type: 'triangle', gain: 0.12 })
  },
  draw() {
    noise(0.03, { freq: 3200, q: 2, gain: 0.14 })
  },
  flower() {
    ;[0, 2, 4].forEach((i, k) => tone(penta(i + 7), 0.18, { type: 'triangle', gain: 0.1, delay: k * 0.05 }))
  },
  shuffle() {
    for (let k = 0; k < 7; k++) noise(0.05, { freq: 1500 + k * 180, q: 2, gain: 0.18, delay: k * 0.045 })
  },
  call(kind: 'chi' | 'pon' | 'kong') {
    const base = { chi: 2, pon: 4, kong: 6 }[kind]
    tone(penta(base), 0.12, { type: 'square', gain: 0.07 })
    tone(penta(base + 3), 0.22, { type: 'triangle', gain: 0.16, delay: 0.07 })
    noise(0.06, { freq: 1800, q: 2, gain: 0.3 })
  },
  hu() {
    tone(90, 0.3, { gain: 0.5, slideTo: 45 })
    ;[0, 2, 4, 5, 7, 9].forEach((i, k) => tone(penta(i + 3), 0.32, { type: 'triangle', gain: 0.16, delay: 0.05 + k * 0.065 }))
    ;[196, 294, 392].forEach((f) => tone(f, 1.4, { gain: 0.08, delay: 0.45, attack: 0.02 }))
  },
  // 結算時台數一項一項跳出來，音一格一格往上爬
  tick(i: number) {
    tone(penta(i + 2), 0.12, { type: 'triangle', gain: 0.16 })
    noise(0.03, { freq: 3000, q: 2, gain: 0.12 })
  },
  // 大牌演出：低音砸下來＋一串往上衝的音
  bigWin() {
    tone(70, 0.5, { gain: 0.55, slideTo: 40 })
    noise(0.35, { freq: 500, q: 0.7, gain: 0.35 })
    ;[0, 2, 4, 7, 9, 12].forEach((i, k) => tone(penta(i), 0.4, { type: 'square', gain: 0.06, delay: 0.08 + k * 0.06 }))
    ;[0, 4, 7].forEach((i) => tone(392 * 2 ** (i / 12), 1.6, { type: 'triangle', gain: 0.1, delay: 0.5, attack: 0.02 }))
  },
  // 倒數最後幾秒：短短的「嘀」
  timer(urgent: boolean) {
    tone(urgent ? 1320 : 990, 0.07, { type: 'square', gain: urgent ? 0.07 : 0.05 })
  },
  exhausted() {
    tone(330, 0.5, { gain: 0.12, slideTo: 220 })
  },
  magic() {
    ;[0, 4, 7, 12].forEach((i, k) => tone(523 * 2 ** (i / 12), 0.25, { type: 'sine', gain: 0.1, delay: k * 0.05 }))
  },
  coin() {
    tone(1567, 0.14, { type: 'triangle', gain: 0.14 })
    tone(2093, 0.22, { type: 'triangle', gain: 0.12, delay: 0.06 })
  },
  win() {
    ;[0, 1, 2, 3, 4, 5, 7].forEach((i, k) => tone(penta(i + 5), 0.3, { type: 'triangle', gain: 0.16, delay: k * 0.07 }))
  },
  lose() {
    tone(220, 1.1, { gain: 0.22, slideTo: 98 })
  },
  error() {
    tone(170, 0.1, { type: 'square', gain: 0.05 })
  },
  click() {
    noise(0.03, { freq: 2500, q: 1.5, gain: 0.15 })
  },
}

/** 支援的裝置（Android）才會震；iOS 網頁沒有震動 API */
export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // 有些瀏覽器在沒有使用者手勢時會丟錯
  }
}
