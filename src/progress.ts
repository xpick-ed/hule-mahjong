// 長期進度：金幣、段位、每日任務、商店（牌背、絕招補給）。
// 全部是純函式，store.ts 負責存檔和畫面。

import { hashSeed, randInt } from './engine/rng'
import * as M from './engine/match'

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
  const mult = STAGE_MULT[m.stage] ?? 1
  const lines = [{ label: `第 ${place + 1} 名`, coins: Math.round(PLACE_COINS[place] * mult) }]
  const tai = m.history.filter((x) => x.winner === 0).reduce((s, x) => s + x.tai, 0)
  const wins = m.history.filter((x) => x.winner === 0).length
  if (wins) lines.push({ label: `胡了 ${wins} 手，共 ${tai} 台`, coins: Math.round((wins * 20 + tai * 10) * mult) })
  const rankDelta = Math.round(PLACE_RANK[place] * (1 + m.stage * 0.25))
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
