// 從遊戲資料產生配音用的台詞表和聲音設定。
//   npx tsx scripts/voice-lines.ts   → voice/cast.json、voice/game.lines.json
// 然後：
//   .venv-voice/bin/python scripts/gen_voices.py      → voice-build/clips/
//   .venv-voice/bin/python scripts/voice_sprites.py   → public/voice/（每個角色一個音檔＋位置表）
//
// 台詞 id：<角色>.tile.<牌>、<角色>.call.<chi|pon|kong|hu|tsumo>、<角色>.line.<時機>.<第幾句>

import { mkdirSync, writeFileSync } from 'node:fs'
import { CHARACTERS, TAUNTS } from '../src/engine/characters'
import { KINDS, tileName } from '../src/engine/tiles'

interface Voice {
  voice: string
  rate: string
  pitch: string
  fx: string[]
}

const F1 = 'zh-TW-HsiaoChenNeural' // 曉臻
const F2 = 'zh-TW-HsiaoYuNeural' // 曉雨
const M1 = 'zh-TW-YunJheNeural' // 雲哲

type Calls = [chi: string, pon: string, kong: string, hu: string, tsumo: string]

// 2026-09-26 試聽後選定：美玲姐 A、林伯 A、二舅 A、阿嬤 B。其他人照同樣的思路配。
const CAST: Record<string, { name: string; voice: Voice; calls: Calls }> = {
  meiling: { name: '美玲姐', voice: { voice: F1, rate: '+12%', pitch: '+2Hz', fx: ['bright'] }, calls: ['吃！', '碰！', '槓！', '胡啦！', '自摸！'] },
  lin: { name: '林伯', voice: { voice: M1, rate: '-12%', pitch: '-10Hz', fx: ['elder'] }, calls: ['吃。', '碰。', '槓。', '胡了。', '自摸。'] },
  kai: { name: '阿凱', voice: { voice: M1, rate: '+6%', pitch: '+6Hz', fx: ['plain'] }, calls: ['吃。', '碰。', '槓。', '胡了。', '自摸。'] },
  wang: { name: '王經理', voice: { voice: M1, rate: '-4%', pitch: '-14Hz', fx: ['smooth'] }, calls: ['吃。', '碰！', '槓！', '胡了！', '自摸！'] },
  xiaomei: { name: '小美', voice: { voice: F2, rate: '+4%', pitch: '+10Hz', fx: ['bright'] }, calls: ['吃～', '碰！', '槓！', '胡了！', '自摸了！'] },
  jie: { name: '阿傑', voice: { voice: M1, rate: '+18%', pitch: '+2Hz', fx: ['loud'] }, calls: ['吃吃吃！', '碰！', '槓！', '胡！', '自摸！'] },
  ama: { name: '阿嬤', voice: { voice: F1, rate: '-20%', pitch: '-22Hz', fx: ['tremble', 'warm'] }, calls: ['吃啦。', '碰啦！', '槓！', '胡啦！', '自摸！'] },
  erjiu: { name: '二舅', voice: { voice: M1, rate: '+10%', pitch: '-4Hz', fx: ['hearty', 'loud'] }, calls: ['吃！', '碰！', '槓！', '胡啦！哈哈哈！', '自摸！乾杯！'] },
  biaomei: { name: '表妹', voice: { voice: F2, rate: '+2%', pitch: '+2Hz', fx: ['plain'] }, calls: ['吃。', '碰。', '槓。', '胡了～', '自摸～'] },
  queshen: { name: '雀神', voice: { voice: M1, rate: '-14%', pitch: '-20Hz', fx: ['mystic'] }, calls: ['吃。', '碰。', '槓。', '胡。', '自摸。'] },
  longge: { name: '龍哥', voice: { voice: M1, rate: '-6%', pitch: '-16Hz', fx: ['gruff'] }, calls: ['吃。', '碰。', '槓。', '胡。', '自摸。'] },
  coco: { name: 'Coco', voice: { voice: F2, rate: '+14%', pitch: '+8Hz', fx: ['bright', 'loud'] }, calls: ['吃！', '碰！', '槓！', '胡啦～！', '自摸！！'] },
  // 你自己的聲音（設定裡選女聲／男聲）：只有報牌和喊牌，沒有台詞
  'me-f': { name: '你（女聲）', voice: { voice: F2, rate: '+0%', pitch: '+0Hz', fx: ['plain'] }, calls: ['吃！', '碰！', '槓！', '胡！', '自摸！'] },
  'me-m': { name: '你（男聲）', voice: { voice: M1, rate: '+0%', pitch: '+0Hz', fx: ['plain'] }, calls: ['吃！', '碰！', '槓！', '胡！', '自摸！'] },
}

// 念的時候跟字幕不一樣的地方
const TTS_FIX: [RegExp, string][] = [
  [/\+(\d+)/g, '加$1'],
  [/KPI/g, 'K P I'],
]

// 牌名：數牌照念，字牌念成大家習慣的叫法
const TILE_SAY: Record<string, string> = { z1: '東風', z2: '南風', z3: '西風', z4: '北風', z5: '紅中', z6: '發財', z7: '白板' }

const CALL_KEYS = ['chi', 'pon', 'kong', 'hu', 'tsumo'] as const

function shift(v: string, d: number, unit: '%' | 'Hz') {
  const n = Number(v.replace(unit, '')) + d
  return `${n >= 0 ? '+' : ''}${n}${unit}`
}

const cast = Object.entries(CAST).map(([id, c]) => ({ id, name: c.name, voice: c.voice }))
const lines: Record<string, { who: string; text: string; tts?: string; rate?: string; pitch?: string }> = {}

for (const [who, c] of Object.entries(CAST)) {
  for (const k of KINDS) lines[`${who}.tile.${k}`] = { who, text: TILE_SAY[k] ?? tileName(k) }
  CALL_KEYS.forEach((k, i) => {
    const hype = k === 'hu' || k === 'tsumo'
    lines[`${who}.call.${k}`] = {
      who,
      text: c.calls[i],
      ...(hype ? { rate: shift(c.voice.rate, 10, '%'), pitch: shift(c.voice.pitch, 8, 'Hz') } : {}),
    }
  })
  // 你的嗆聲
  if (who.startsWith('me-')) for (const t of TAUNTS) lines[`${who}.taunt.${t.id}`] = { who, text: t.text }
  const ch = CHARACTERS[who]
  if (!ch) continue
  for (const [key, ls] of Object.entries(ch.lines)) {
    ls!.forEach((text, i) => {
      let tts = text
      for (const [re, to] of TTS_FIX) tts = tts.replace(re, to)
      lines[`${who}.line.${key}.${i}`] = { who, text, ...(tts !== text ? { tts } : {}) }
    })
  }
}

mkdirSync('voice', { recursive: true })
writeFileSync('voice/cast.json', JSON.stringify(cast, null, 1) + '\n')
writeFileSync('voice/game.lines.json', JSON.stringify(lines, null, 1) + '\n')
console.log(`${cast.length} 個聲音、${Object.keys(lines).length} 句`)
