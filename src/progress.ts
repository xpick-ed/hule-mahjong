// 長期進度：金幣、段位、每日任務、商店（牌背、絕招補給）。
// 全部是純函式，store.ts 負責存檔和畫面。

import { hashSeed, randInt } from './engine/rng'
import * as M from './engine/match'
import { STAGES } from './engine/stages'

export interface Daily {
  date: string
  ids: string[]
  counts: Partial<Record<Metric, number>>
  claimed: string[]
}

export interface Progress {
  /** 已經過了幾關（0 = 一關都還沒過） */
  cleared: number
  skins: string[]
  skin: string
  wins: number
  matches: number
  coins: number
  rankPts: number
  backs: string[]
  back: string
  /** 商店買的絕招補給，下一場開打時加上去 */
  bonus: Record<M.SkillId, number>
  daily: Daily | null
  stats: Stats
  /** 成就：id → 解鎖日期 */
  ach: Record<string, string>
  /** 好感度：角色 id → 點數 */
  affinity: Record<string, number>
  /** 跟各角色的戰績 */
  vs: Record<string, { played: number; above: number }>
  /** 換上好感度滿級的新衣服 */
  outfit: Record<string, boolean>
  /** 引導局打過了（或跳過了） */
  tutorial: boolean
  /** 每日挑戰：今天最好的成績 */
  dailyBest: { date: string; place: number; points: number; share: string } | null
}

export interface Stats {
  hands: number
  wins: number
  tsumo: number
  dealIns: number
  totalTai: number
  best: { tai: number; items: string[]; date: string } | null
  /** 你當莊最多連幾次 */
  bestStreak: number
}

export const defaultProgress: Progress = {
  cleared: 0,
  skins: ['mint'],
  skin: 'mint',
  wins: 0,
  matches: 0,
  coins: 0,
  rankPts: 0,
  backs: ['pink'],
  back: 'pink',
  bonus: { swap: 0, peek: 0, lucky: 0 },
  daily: null,
  stats: { hands: 0, wins: 0, tsumo: 0, dealIns: 0, totalTai: 0, best: null, bestStreak: 0 },
  ach: {},
  affinity: {},
  vs: {},
  outfit: {},
  tutorial: false,
  dailyBest: null,
}

/** 舊存檔少了新欄位：補上預設值 */
export function migrate(p: Partial<Progress>): Progress {
  const q = { ...defaultProgress, ...p }
  q.stats = { ...defaultProgress.stats, ...(p.stats ?? {}) }
  // 已經打過的人不用再走引導局
  if (p.tutorial === undefined && (p.matches ?? 0) > 0) q.tutorial = true
  return q
}

// ---------- 段位 ----------

export const RANKS: readonly { name: string; at: number }[] = [
  { name: '新手', at: 0 },
  { name: '初段', at: 100 },
  { name: '二段', at: 250 },
  { name: '三段', at: 450 },
  { name: '四段', at: 700 },
  { name: '五段', at: 1000 },
  { name: '雀士', at: 1400 },
  { name: '雀豪', at: 1900 },
  { name: '雀聖', at: 2500 },
  { name: '雀神', at: 3200 },
]

export function rankOf(pts: number) {
  let i = 0
  while (i + 1 < RANKS.length && pts >= RANKS[i + 1].at) i++
  const next = RANKS[i + 1]
  return { i, name: RANKS[i].name, pts, next: next ?? null, into: pts - RANKS[i].at, span: next ? next.at - RANKS[i].at : 1 }
}

// ---------- 一場結束的獎勵 ----------

const STAGE_MULT = [1, 1.5, 2, 3]
const PLACE_COINS = [300, 150, 80, 30]
const PLACE_RANK = [40, 15, -5, -20]

export interface Rewards {
  place: number
  lines: { label: string; coins: number }[]
  coins: number
  rankDelta: number
}

export function matchRewards(m: M.MatchState): Rewards {
  const place = M.ranking(m).indexOf(0)
  const diff = M.DIFFICULTY[m.difficulty ?? 'normal']
  const mult = (STAGE_MULT[m.stage] ?? 1) * diff.coins
  const lines = [{ label: `第 ${place + 1} 名`, coins: Math.round(PLACE_COINS[place] * mult) }]
  const tai = m.history.filter((x) => x.winner === 0).reduce((s, x) => s + x.tai, 0)
  const wins = m.history.filter((x) => x.winner === 0).length
  if (wins) lines.push({ label: `胡了 ${wins} 手，共 ${tai} 台`, coins: Math.round((wins * 20 + tai * 10) * mult) })
  if (m.difficulty && m.difficulty !== 'normal') lines.push({ label: `${diff.name}難度 金幣 ×${diff.coins}`, coins: 0 })
  // 段位：輕鬆難度加得少、扣得也少；高手難度加得多
  const base = PLACE_RANK[place] * (1 + m.stage * 0.25)
  const k = m.difficulty === 'easy' ? 0.5 : m.difficulty === 'hard' ? (base > 0 ? 1.4 : 1) : 1
  const rankDelta = m.tutorial ? Math.max(0, Math.round(base)) : Math.round(base * k)
  return { place, lines, coins: lines.reduce((s, x) => s + x.coins, 0), rankDelta }
}

// ---------- 每日任務 ----------

export type Metric = 'win' | 'tsumo' | 'big4' | 'flush' | 'pon' | 'skill' | 'match' | 'first' | 'cleanMatch'

export interface MissionDef {
  id: string
  text: string
  metric: Metric
  goal: number
  reward: number
}

export const MISSIONS: readonly MissionDef[] = [
  { id: 'win2', text: '胡 2 次', metric: 'win', goal: 2, reward: 100 },
  { id: 'win4', text: '胡 4 次', metric: 'win', goal: 4, reward: 200 },
  { id: 'tsumo1', text: '自摸 1 次', metric: 'tsumo', goal: 1, reward: 120 },
  { id: 'big1', text: '胡一手 4 台以上', metric: 'big4', goal: 1, reward: 150 },
  { id: 'flush1', text: '胡一手混一色或清一色', metric: 'flush', goal: 1, reward: 250 },
  { id: 'pon3', text: '碰 3 次', metric: 'pon', goal: 3, reward: 80 },
  { id: 'skill2', text: '用 2 次絕招', metric: 'skill', goal: 2, reward: 80 },
  { id: 'match1', text: '打完 1 場東風圈', metric: 'match', goal: 1, reward: 80 },
  { id: 'first1', text: '拿 1 次第一', metric: 'first', goal: 1, reward: 200 },
  { id: 'clean1', text: '一整場都沒放槍', metric: 'cleanMatch', goal: 1, reward: 200 },
]

export const MISSION: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((x) => [x.id, x]))

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 今天的三個任務（同一天大家都一樣，換日自動換） */
export function ensureDaily(p: Progress, date = today()): Progress {
  if (p.daily?.date === date) return p
  const r = { rng: hashSeed(`daily-${date}`) }
  const pool = [...MISSIONS]
  const ids: string[] = []
  while (ids.length < 3) {
    const [x] = pool.splice(randInt(r, pool.length), 1)
    // 同一種指標只放一個（不會同時有「胡 2 次」和「胡 4 次」）
    if (!ids.some((id) => MISSION[id].metric === x.metric)) ids.push(x.id)
  }
  return { ...p, daily: { date, ids, counts: {}, claimed: [] } }
}

export function missionState(p: Progress, id: string) {
  const def = MISSION[id]
  const n = Math.min(def.goal, p.daily?.counts[def.metric] ?? 0)
  return { def, n, done: n >= def.goal, claimed: !!p.daily?.claimed.includes(id) }
}

export function claimable(p: Progress): number {
  return (p.daily?.ids ?? []).filter((id) => {
    const s = missionState(p, id)
    return s.done && !s.claimed
  }).length
}

/** 加計數；回傳新的進度和「這次剛完成」的任務 */
export function bump(p: Progress, add: Partial<Record<Metric, number>>): { p: Progress; finished: MissionDef[] } {
  const q = ensureDaily(p)
  const before = q.daily!.ids.filter((id) => missionState(q, id).done)
  const counts = { ...q.daily!.counts }
  for (const [k, v] of Object.entries(add) as [Metric, number][]) if (v) counts[k] = (counts[k] ?? 0) + v
  const next = { ...q, daily: { ...q.daily!, counts } }
  const finished = next.daily.ids.filter((id) => missionState(next, id).done && !before.includes(id)).map((id) => MISSION[id])
  return { p: next, finished }
}

export function claim(p: Progress, id: string): Progress {
  const s = missionState(p, id)
  if (!s.done || s.claimed) return p
  return { ...p, coins: p.coins + s.def.reward, daily: { ...p.daily!, claimed: [...p.daily!.claimed, id] } }
}

/** 一局結束時，你這一局做到了什麼 */
export function handMetrics(m: M.MatchState): Partial<Record<Metric, number>> {
  const w = m.result?.win
  const pon = m.hand.seats[0].melds.filter((x) => x.type === 'pung' && x.from !== undefined).length
  const out: Partial<Record<Metric, number>> = { pon }
  if (w && w.seat === 0) {
    out.win = 1
    if (w.from === null) out.tsumo = 1
    if (w.score.total >= 4) out.big4 = 1
    if (w.score.items.some((x) => x.name === '混一色' || x.name === '清一色')) out.flush = 1
  }
  return out
}

export function matchMetrics(m: M.MatchState): Partial<Record<Metric, number>> {
  const first = M.ranking(m)[0] === 0
  const dealtIn = m.history.some((x) => x.from === 0)
  return { match: 1, first: first ? 1 : 0, cleanMatch: dealtIn ? 0 : 1 }
}

// ---------- 商店 ----------

export interface BackDef {
  id: string
  name: string
  price: number
  /** CSS：牌背底色與花紋 */
  bg: string
  ring: string
}

export const BACKS: readonly BackDef[] = [
  { id: 'pink', name: '草莓粉', price: 0, bg: '#ff8fa3', ring: 'rgba(255,255,255,.55)' },
  { id: 'sky', name: '汽水藍', price: 300, bg: '#6cc3f5', ring: 'rgba(255,255,255,.6)' },
  { id: 'mint', name: '薄荷糖', price: 300, bg: '#5fd6bd', ring: 'rgba(255,255,255,.6)' },
  { id: 'grape', name: '葡萄紫', price: 500, bg: '#a98bff', ring: 'rgba(255,255,255,.55)' },
  { id: 'check', name: '格子餐巾', price: 800, bg: 'repeating-conic-gradient(#ef3d5c 0 25%, #fff 0 50%) 0 0 / 6px 6px', ring: 'rgba(239,61,92,.9)' },
  { id: 'night', name: '黑金', price: 1200, bg: 'linear-gradient(135deg, #1d2a4a, #34406b)', ring: '#ffb020' },
]

export const BACK: Record<string, BackDef> = Object.fromEntries(BACKS.map((b) => [b.id, b]))

export const SUPPLY: readonly { id: M.SkillId; price: number }[] = [
  { id: 'swap', price: 120 },
  { id: 'peek', price: 150 },
  { id: 'lucky', price: 200 },
]

// ---------- 戰績、成就 ----------

export interface AchDef {
  id: string
  name: string
  desc: string
  /** 還沒解鎖時不顯示內容 */
  secret?: boolean
}

export const ACHIEVEMENTS: readonly AchDef[] = [
  { id: 'firstWin', name: '開胡', desc: '第一次胡牌' },
  { id: 'firstTsumo', name: '自己來', desc: '第一次自摸' },
  { id: 'menqing', name: '門清自摸', desc: '沒吃沒碰，自摸胡牌' },
  { id: 'pinghu', name: '平平淡淡', desc: '胡一手平胡' },
  { id: 'toitoi', name: '碰碰胡', desc: '五組都是刻子' },
  { id: 'hunyise', name: '混一色', desc: '一種花色加字牌' },
  { id: 'qingyise', name: '清一色', desc: '整手只有一種花色' },
  { id: 'anke3', name: '藏起來', desc: '三暗刻以上' },
  { id: 'sanyuan', name: '三元', desc: '小三元或大三元' },
  { id: 'sixi', name: '四喜', desc: '小四喜或大四喜', secret: true },
  { id: 'ziyise', name: '字一色', desc: '整手都是字牌', secret: true },
  { id: 'ligu', name: '嚦咕嚦咕', desc: '七對加一組刻子', secret: true },
  { id: 'flowers', name: '八仙過海', desc: '八張花到手（七搶一也算）', secret: true },
  { id: 'kongFlower', name: '槓上開花', desc: '開槓補的牌自摸' },
  { id: 'lastTile', name: '海底撈月', desc: '胡最後一張牌' },
  { id: 'robKong', name: '搶槓', desc: '胡別人加槓的那張' },
  { id: 'heaven', name: '天選之人', desc: '天胡或地胡', secret: true },
  { id: 'tai8', name: '大牌', desc: '一手 8 台以上（不含莊家台）' },
  { id: 'streak3', name: '莊家不下莊', desc: '你當莊連 3 次' },
  { id: 'clean', name: '滴水不漏', desc: '一整場沒放槍，還拿第一' },
  { id: 'clear1', name: '巷口出名', desc: '巷口麻將拿第一' },
  { id: 'clear4', name: '雀神退位', desc: '雀神挑戰拿第一' },
  { id: 'hardFirst', name: '高手中的高手', desc: '高手難度拿第一' },
  { id: 'daily', name: '每日一局', desc: '打完一場每日挑戰' },
  { id: 'matches10', name: '常客', desc: '打完 10 場' },
  { id: 'matches50', name: '老手', desc: '打完 50 場' },
  { id: 'allFriends', name: '交遊廣闊', desc: '跟 12 個角色都打過牌' },
  { id: 'bestFriend', name: '麻吉', desc: '跟一個角色好感度滿級' },
]

export const ACH: Record<string, AchDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))

function unlock(p: Progress, ids: string[]): { p: Progress; unlocked: AchDef[] } {
  const fresh = ids.filter((id) => !p.ach[id])
  if (!fresh.length) return { p, unlocked: [] }
  const date = today()
  return { p: { ...p, ach: { ...p.ach, ...Object.fromEntries(fresh.map((id) => [id, date])) } }, unlocked: fresh.map((id) => ACH[id]) }
}

/** 一局結束：更新戰績、檢查這一手有沒有解鎖成就 */
export function recordHand(p: Progress, m: M.MatchState): { p: Progress; unlocked: AchDef[] } {
  const r = m.result
  if (!r) return { p, unlocked: [] }
  const st = { ...p.stats }
  st.hands++
  const ids: string[] = []
  for (const w of M.winsOf(r)) {
    if (w.from === 0) st.dealIns++
    if (w.seat !== 0) continue
    st.wins++
    st.totalTai += w.score.total
    if (w.from === null) st.tsumo++
    if (!st.best || w.score.total > st.best.tai) st.best = { tai: w.score.total, items: w.score.items.map((x) => `${x.name} ${x.tai}`), date: today() }
    const names = w.score.items.map((x) => x.name)
    const has = (...n: string[]) => n.some((x) => names.includes(x))
    ids.push('firstWin')
    if (w.from === null) ids.push('firstTsumo')
    if (has('門清自摸')) ids.push('menqing')
    if (has('平胡')) ids.push('pinghu')
    if (has('碰碰胡')) ids.push('toitoi')
    if (has('混一色')) ids.push('hunyise')
    if (has('清一色')) ids.push('qingyise')
    if (has('三暗刻', '四暗刻', '五暗刻')) ids.push('anke3')
    if (has('小三元', '大三元')) ids.push('sanyuan')
    if (has('小四喜', '大四喜')) ids.push('sixi')
    if (has('字一色')) ids.push('ziyise')
    if (has('嚦咕嚦咕')) ids.push('ligu')
    if (has('八仙過海', '七搶一')) ids.push('flowers')
    if (has('槓上開花')) ids.push('kongFlower')
    if (has('海底撈月', '河底撈魚')) ids.push('lastTile')
    if (has('搶槓')) ids.push('robKong')
    if (has('天胡', '地胡')) ids.push('heaven')
    if (w.score.total >= 8) ids.push('tai8')
  }
  if (r.dealer === 0 && r.streak > st.bestStreak) st.bestStreak = r.streak
  if (r.dealer === 0 && r.streak >= 3) ids.push('streak3')
  return unlock({ ...p, stats: st }, ids)
}

// ---------- 好感度 ----------

/** 每一級要的點數：Lv1 認識、Lv2 故事一、Lv3 專屬台詞、Lv4 故事二、Lv5 新衣服 */
export const AFFINITY_LEVELS = [0, 20, 50, 90, 140, 200] as const

export function affinityLevel(pts: number) {
  let lv = 0
  while (lv + 1 < AFFINITY_LEVELS.length && pts >= AFFINITY_LEVELS[lv + 1]) lv++
  const next = AFFINITY_LEVELS[lv + 1]
  return { lv, pts, next: next ?? null, into: pts - AFFINITY_LEVELS[lv], span: next ? next - AFFINITY_LEVELS[lv] : 1 }
}

export interface MatchRecord {
  p: Progress
  unlocked: AchDef[]
  /** 好感度升級的角色 */
  levelUps: { id: string; lv: number }[]
  /** 這一場每個對手加了多少好感度 */
  gains: Record<string, number>
}

/** 一場結束：好感度、對戰紀錄、成就 */
export function recordMatch(p: Progress, m: M.MatchState, allChars: readonly string[]): MatchRecord {
  const order = M.ranking(m)
  const myPlace = order.indexOf(0)
  const affinity = { ...p.affinity }
  const vs = { ...p.vs }
  const gains: Record<string, number> = {}
  const levelUps: MatchRecord['levelUps'] = []
  for (let seat = 1; seat < 4; seat++) {
    const id = m.chars[seat]
    const above = myPlace < order.indexOf(seat)
    // 一起打過的牌：你胡他的、他胡你的
    const touches = m.history.filter((x) => (x.winner === 0 && x.from === seat) || (x.winner === seat && x.from === 0)).length
    const gain = 10 + (above ? 10 : 0) + Math.min(6, touches * 2)
    const before = affinityLevel(affinity[id] ?? 0).lv
    affinity[id] = (affinity[id] ?? 0) + gain
    gains[id] = gain
    const after = affinityLevel(affinity[id]).lv
    if (after > before) levelUps.push({ id, lv: after })
    const v = vs[id] ?? { played: 0, above: 0 }
    vs[id] = { played: v.played + 1, above: v.above + (above ? 1 : 0) }
  }
  const q = { ...p, affinity, vs }
  const ids: string[] = []
  const first = myPlace === 0
  const dealtIn = m.history.some((x) => x.from === 0)
  if (first && !dealtIn) ids.push('clean')
  if (first && m.stage === 0) ids.push('clear1')
  if (first && m.stage === STAGES.length - 1) ids.push('clear4')
  if (first && m.difficulty === 'hard') ids.push('hardFirst')
  if (m.daily) ids.push('daily')
  if (q.matches >= 10) ids.push('matches10')
  if (q.matches >= 50) ids.push('matches50')
  if (allChars.every((id) => vs[id])) ids.push('allFriends')
  if (Object.values(affinity).some((x) => affinityLevel(x).lv >= AFFINITY_LEVELS.length - 1)) ids.push('bestFriend')
  const u = unlock(q, ids)
  return { p: u.p, unlocked: u.unlocked, levelUps, gains }
}
