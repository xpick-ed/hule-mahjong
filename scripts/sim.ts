// 四家電腦互打很多場：檢查規則引擎不會卡住，看胡牌方式、台數分布、流局率。
//   npm run sim            預設 200 場東風圈
//   npm run sim -- 1000 2  場數、關卡（0–3）
//   npm run sim -- 300 0 multi hard   加上：multi（一炮多響）、nopass（不過水）、cap3（連莊上限 3）、easy／hard

import { chooseClaim, chooseSelf, type AiStyle } from '../src/engine/ai'
import * as M from '../src/engine/match'
import * as T from '../src/engine/table'

const N = Number(process.argv[2] ?? 200)
const STAGE = Number(process.argv[3] ?? 0)
const FLAGS = process.argv.slice(4)
const RULES: T.Rules = {
  multiRon: FLAGS.includes('multi'),
  passWin: !FLAGS.includes('nopass'),
  streakCap: FLAGS.includes('cap3') ? 3 : 0,
}
const DIFF = (['easy', 'hard'] as const).find((d) => FLAGS.includes(d)) ?? 'normal'
const ME: AiStyle = { speed: 0.5, defense: 0.6, greed: 0.3, mistakes: 0.1 }

const stat = {
  matches: 0,
  hands: 0,
  exhausted: 0,
  tsumo: 0,
  ron: 0,
  tai: [] as number[],
  names: new Map<string, number>(),
  meFirst: 0,
  multi: 0,
  handsPerMatch: [] as number[],
  ms: 0,
  byChar: new Map<string, { wins: number; tai: number[]; dealIns: number; hands: number }>(),
}
const charStat = (id: string) => {
  let s = stat.byChar.get(id)
  if (!s) stat.byChar.set(id, (s = { wins: 0, tai: [], dealIns: 0, hands: 0 }))
  return s
}

const t0 = performance.now()
for (let i = 0; i < N; i++) {
  let m = M.newMatch(`sim-${i}`, STAGE, { rules: RULES, difficulty: DIFF })
  let guard = 0
  while (m.phase !== 'end') {
    if (++guard > 20000) throw new Error(`卡住了：seed sim-${i}`)
    if (m.phase === 'handEnd') {
      const w = m.result!.win
      if (m.result!.also?.length) stat.multi++
      stat.hands++
      if (!w) stat.exhausted++
      else {
        if (w.from === null) stat.tsumo++
        else stat.ron++
        stat.tai.push(w.score.total)
        for (const it of w.score.items) stat.names.set(it.name, (stat.names.get(it.name) ?? 0) + 1)
        const cs = charStat(m.chars[w.seat])
        cs.wins++
        cs.tai.push(w.score.total)
        if (w.from !== null) charStat(m.chars[w.from]).dealIns++
      }
      for (const c of m.chars) charStat(c).hands++
      m = M.nextHand(m)
      continue
    }
    if (M.waitingForYou(m)) {
      const h = m.hand
      if (h.phase === 'claim') m = M.claim(m, chooseClaim(h, 0, h.options[0]!, ME, m))
      else {
        const act = chooseSelf(h, 0, ME, m)
        if (act.type === 'tsumo') m = M.tsumo(m)
        else if (act.type === 'kong') m = M.kong(m, act.kind)
        else m = M.discard(m, act.tileId)
      }
      continue
    }
    const nm = M.step(m)
    if (nm === m) throw new Error(`沒有進展：seed sim-${i} phase ${m.hand.phase}`)
    m = nm
  }
  stat.matches++
  if (M.ranking(m)[0] === 0) stat.meFirst++
  stat.handsPerMatch.push(m.handNo)
  // 規則檢查：總分不變
  const total = m.points.reduce((s, p) => s + p, 0)
  if (total !== M.stageOf(m).startPoints * 4) throw new Error('分數總和不對')
  void T
}
stat.ms = performance.now() - t0

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const pct = (x: number, of: number) => `${((x / Math.max(1, of)) * 100).toFixed(0)}%`
const sorted = [...stat.tai].sort((a, b) => a - b)
console.log(`${stat.matches} 場、${stat.hands} 局（每場平均 ${avg(stat.handsPerMatch).toFixed(1)} 局），${(stat.ms / 1000).toFixed(1)} 秒`)
console.log(`自摸 ${pct(stat.tsumo, stat.hands)}、放槍 ${pct(stat.ron, stat.hands)}、流局 ${pct(stat.exhausted, stat.hands)}`)
console.log(`台數：平均 ${avg(stat.tai).toFixed(1)}，中位數 ${sorted[Math.floor(sorted.length / 2)]}，最大 ${sorted[sorted.length - 1]}`)
console.log(`規則：${JSON.stringify(RULES)}、難度 ${DIFF}；一炮多響 ${stat.multi} 次`)
console.log(`座位 0（中等電腦）拿第一：${pct(stat.meFirst, stat.matches)}`)
console.log(
  '常見台：' +
    [...stat.names.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k, v]) => `${k} ${pct(v, stat.tsumo + stat.ron)}`)
      .join('、'),
)
console.log('各角色：')
for (const [id, s] of [...stat.byChar.entries()].sort()) {
  const big = s.tai.filter((t) => t >= 4).length
  console.log(`  ${id.padEnd(8)} 胡 ${pct(s.wins, s.hands).padStart(4)}  平均 ${avg(s.tai).toFixed(1)} 台  4 台以上 ${pct(big, s.wins).padStart(4)}  放槍 ${pct(s.dealIns, s.hands).padStart(4)}`)
}
