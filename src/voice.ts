// 配音：每個角色一個音檔（audio sprite），public/voice/index.json 記每句從幾秒開始、多長。
// 用 WebAudio 解碼後直接切片播放：延遲低、iOS 也穩。同一個角色講新的一句，舊的那句會停掉。

import { audioContext } from './sfx'

interface VoiceIndex {
  voices: Record<string, { file: string; clips: Record<string, [number, number]> }>
}

const BASE = './voice/'
let index: Promise<VoiceIndex | null> | null = null
let loaded: VoiceIndex | null = null
const buffers = new Map<string, AudioBuffer>()
const loading = new Map<string, Promise<AudioBuffer | null>>()
const playing = new Map<string, AudioBufferSourceNode>()
let enabled = true
let out: GainNode | null = null

function loadIndex(): Promise<VoiceIndex | null> {
  index ??= fetch(`${BASE}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<VoiceIndex>) : null))
    .catch(() => null)
    .then((j) => (loaded = j))
  return index
}

function loadVoice(who: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(who)
  if (hit) return Promise.resolve(hit)
  let p = loading.get(who)
  if (!p) {
    p = (async () => {
      const idx = await loadIndex()
      const v = idx?.voices[who]
      const ctx = audioContext()
      if (!v || !ctx) return null
      const res = await fetch(BASE + v.file)
      if (!res.ok) return null
      const buf = await ctx.decodeAudioData(await res.arrayBuffer())
      buffers.set(who, buf)
      return buf
    })().catch(() => null)
    loading.set(who, p)
  }
  return p
}

/** 開場先把這一場會用到的聲音載好 */
export function preloadVoices(whos: string[]) {
  for (const w of whos) void loadVoice(w)
}

export function setVoiceEnabled(on: boolean) {
  enabled = on
  if (!on) for (const src of playing.values()) src.stop()
}

export function hasClip(who: string, key: string): boolean {
  return !!loaded?.voices[who]?.clips[key]
}

/** 播一句。還沒載好就不播（不讓聲音晚到、跟畫面對不上），回傳這句多長（秒） */
export function speak(who: string, key: string): number {
  if (!enabled) return 0
  const clip = loaded?.voices[who]?.clips[key]
  const buf = buffers.get(who)
  if (!clip || !buf) {
    void loadVoice(who)
    return 0
  }
  const ctx = audioContext()
  if (!ctx) return 0
  if (!out) {
    out = ctx.createGain()
    out.gain.value = 0.95
    out.connect(ctx.destination)
  }
  playing.get(who)?.stop()
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(out)
  const [start, dur] = clip
  src.start(0, Math.max(0, start - 0.02), dur + 0.12)
  playing.set(who, src)
  src.onended = () => {
    if (playing.get(who) === src) playing.delete(who)
  }
  return dur
}
