// 語音試聽：挑 4 個聲線差最多的角色，每人兩種聲音候選（A／B），
// 各唸幾張牌名、吃碰槓胡、幾句台詞。產生 voice/audition/ 的資料，給 gen_voices.py 生成。
//   npx tsx scripts/voice-audition.ts
//   .venv-voice/bin/python scripts/gen_voices.py --data voice/audition --out voice-audition
//   node scripts/voice-audition-page.mjs   → 試聽頁

import { mkdirSync, writeFileSync } from 'node:fs'
import { CHARACTERS } from '../src/engine/characters'

interface Voice {
  voice: string
  rate: string
  pitch: string
  fx: string[]
}

const F1 = 'zh-TW-HsiaoChenNeural' // 曉臻
const F2 = 'zh-TW-HsiaoYuNeural' // 曉雨
const M1 = 'zh-TW-YunJheNeural' // 雲哲

const CANDIDATES: Record<string, { A: Voice; B: Voice; calls: Record<string, string> }> = {
  meiling: {
    A: { voice: F1, rate: '+12%', pitch: '+2Hz', fx: ['bright'] },
    B: { voice: F2, rate: '+8%', pitch: '-6Hz', fx: ['warm'] },
    calls: { chi: '吃！', pon: '碰！', kong: '槓！', hu: '胡啦！', tsumo: '自摸！' },
  },
  lin: {
    A: { voice: M1, rate: '-12%', pitch: '-10Hz', fx: ['elder'] },
    B: { voice: M1, rate: '-6%', pitch: '-18Hz', fx: ['gruff'] },
    calls: { chi: '吃。', pon: '碰。', kong: '槓。', hu: '胡了。', tsumo: '自摸。' },
  },
  erjiu: {
    A: { voice: M1, rate: '+10%', pitch: '-4Hz', fx: ['hearty', 'loud'] },
    B: { voice: M1, rate: '+4%', pitch: '-12Hz', fx: ['drunk', 'hearty'] },
    calls: { chi: '吃！', pon: '碰！', kong: '槓！', hu: '胡啦！哈哈哈！', tsumo: '自摸！乾杯！' },
  },
  ama: {
    A: { voice: F2, rate: '-15%', pitch: '-14Hz', fx: ['elder'] },
    B: { voice: F1, rate: '-20%', pitch: '-22Hz', fx: ['tremble', 'warm'] },
    calls: { chi: '吃啦。', pon: '碰啦！', kong: '槓！', hu: '胡啦！', tsumo: '自摸！' },
  },
}

const TILES: [string, string][] = [
  ['m1', '一萬'],
  ['p5', '五筒'],
  ['s7', '七條'],
  ['z1', '東風'],
  ['z5', '紅中'],
  ['z6', '發財'],
  ['z7', '白板'],
  ['m9', '九萬'],
]

const cast: unknown[] = []
const lines: Record<string, { who: string; text: string; rate?: string; pitch?: string }> = {}

for (const [id, c] of Object.entries(CANDIDATES)) {
  const ch = CHARACTERS[id]
  for (const v of ['A', 'B'] as const) {
    const who = `${id}-${v}`
    cast.push({ id: who, name: `${ch.name} ${v}`, voice: c[v] })
    for (const [k, name] of TILES) lines[`${who}.tile.${k}`] = { who, text: name }
    for (const [k, text] of Object.entries(c.calls)) {
      // 胡、自摸要比平常更激動：快一點、高一點
      const hype = k === 'hu' || k === 'tsumo'
      lines[`${who}.call.${k}`] = { who, text, ...(hype ? { rate: bump(c[v].rate, 10), pitch: bumpHz(c[v].pitch, 8) } : {}) }
    }
    lines[`${who}.line.hello`] = { who, text: ch.lines.hello![0] }
    lines[`${who}.line.ting`] = { who, text: ch.lines.ting![0] }
    lines[`${who}.line.dealIn`] = { who, text: ch.lines.dealIn![0] }
  }
}

function bump(rate: string, d: number) {
  return `${Number(rate.replace('%', '')) + d >= 0 ? '+' : ''}${Number(rate.replace('%', '')) + d}%`
}
function bumpHz(p: string, d: number) {
  const n = Number(p.replace('Hz', '')) + d
  return `${n >= 0 ? '+' : ''}${n}Hz`
}

mkdirSync('voice/audition', { recursive: true })
writeFileSync('voice/audition/cast.json', JSON.stringify(cast, null, 1) + '\n')
writeFileSync('voice/audition/audition.lines.json', JSON.stringify(lines, null, 1) + '\n')
console.log(`${cast.length} 組聲音、${Object.keys(lines).length} 句`)
