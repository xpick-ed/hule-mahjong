// 所有音效都用 WebAudio 即時合成，不用下載素材。
// iOS 要在使用者第一次觸控時才能啟動聲音，所以 main.tsx 在第一次 pointerdown 呼叫 unlockAudio()。

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

function ac(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function unlockAudio() {
  ac()
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
    noise(0.035, { freq: 4200, q: 2.5, gain: 0.18 })
  },
  place() {
    noise(0.05, { freq: 1900, q: 3, gain: 0.45 })
    noise(0.04, { freq: 2800, q: 3, gain: 0.25, delay: 0.05 })
  },
  discard() {
    noise(0.22, { freq: 700, q: 0.6, gain: 0.25, filter: 'lowpass' })
  },
  seal() {
    tone(90, 0.3, { gain: 0.6, slideTo: 45 })
    noise(0.12, { freq: 300, q: 0.8, gain: 0.5 })
  },
  gong() {
    ;[110, 222, 329, 447].forEach((f, k) => tone(f, 2.4, { gain: 0.22 / (k + 1), attack: 0.01 }))
  },
  chip(i: number) {
    tone(penta(i), 0.14, { type: 'triangle', gain: 0.2 })
  },
  mult(i: number) {
    tone(penta(i, 196), 0.22, { type: 'square', gain: 0.07 })
    tone(penta(i, 392), 0.18, { type: 'triangle', gain: 0.12 })
  },
  xmult() {
    tone(130, 0.45, { type: 'sawtooth', gain: 0.09, slideTo: 390 })
    noise(0.2, { freq: 1200, q: 1, gain: 0.2 })
  },
  debuff() {
    tone(150, 0.12, { type: 'square', gain: 0.05 })
  },
  total() {
    ;[0, 2, 4].forEach((i, k) => tone(penta(i + 5), 0.3, { type: 'triangle', gain: 0.15, delay: k * 0.05 }))
  },
  coin() {
    tone(1567, 0.14, { type: 'triangle', gain: 0.14 })
    tone(2093, 0.22, { type: 'triangle', gain: 0.12, delay: 0.06 })
  },
  win() {
    ;[0, 1, 2, 3, 4, 5].forEach((i, k) => tone(penta(i + 5), 0.3, { type: 'triangle', gain: 0.16, delay: k * 0.07 }))
  },
  lose() {
    tone(220, 1.1, { gain: 0.25, slideTo: 98 })
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
