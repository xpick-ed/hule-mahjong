// 牌局回顧（覆盤）：你每打一張牌，教練在旁邊記一下「有沒有更好的打法」。
// 一局結束時挑最值得說的 1–3 張，附上對應的教學。
//
// 危險牌提示也在這裡：只用「看得到的東西」判斷誰可能聽牌了（亮了幾組、剩幾張、有沒有喊聽），
// 不會偷看電腦的手牌。

import { danger, visible } from './engine/ai'
import { shanten, type Counts } from './engine/analysis'
import { CHARACTERS } from './engine/characters'
import type { MatchState } from './engine/match'
import { need, RESERVE, type HandState } from './engine/table'
import { cat, idx, isSuited, tileName, type Kind } from './engine/tiles'

export interface ReviewNote {
  /** 你這一局第幾次打牌 */
  turn: number
  kind: Kind
  better: Kind
  reason: 'speed' | 'uke' | 'defense'
  text: string
  /** 對應的教學：章節 id、第幾課 */
  lesson: { ch: string; i: number; title: string }
  /** 越大越值得說 */
  loss: number
  /** 打之前的手牌 */
  hand: Kind[]
  tileId: number
  dealtIn?: boolean
}

export const LESSON_FOR: Record<ReviewNote['reason'], ReviewNote['lesson']> = {
  speed: { ch: 'basic', i: 2, title: '先打哪張' },
  uke: { ch: 'efficiency', i: 0, title: '進張數：能讓你前進的牌' },
  defense: { ch: 'defense', i: 3, title: '棄胡：不求胡，只求不放槍' },
}

// ---------- 誰看起來聽牌了 ----------

/**
 * 從你的角度看，哪些對手可能聽牌了（只用公開資訊）：
 * 亮了三組以上；亮了兩組而且牌山過半；剩不到 30 張還亮了一組；或是剛剛喊了「快了」之類的話。
 */
export function publicThreats(h: HandState, heardTing: readonly boolean[] = []): number[] {
  const live = h.wall.length - RESERVE
  return [1, 2, 3].filter((s) => {
    const m = h.seats[s].melds.length
    return m >= 3 || (m >= 2 && live < 45) || (m >= 1 && live < 22) || !!heardTing[s]
  })
}

export type DangerLevel = 'safe' | 'risky' | 'danger'

/** 你手上每一種牌對「可能聽牌的人」有多危險 */
export function dangerMap(h: HandState, threats: number[]): Map<Kind, DangerLevel> {
  const out = new Map<Kind, DangerLevel>()
  if (!threats.length) return out
  const seen = visible(h, 0)
  for (const t of h.seats[0].hand) {
    if (out.has(t.kind)) continue
    const d = Math.max(...threats.map((s) => danger(h, s, t.kind, seen)))
    out.set(t.kind, d <= 0.1 ? 'safe' : d >= 0.7 ? 'danger' : 'risky')
  }
  return out
}

// ---------- 教練評估 ----------

interface Eval {
  kind: Kind
  sh: number
  uke: number
}

/** 每一種可以打的牌：打了差幾步、外面還有幾張會讓你前進（扣掉看得到的牌） */
function evaluateSeen(h: HandState): Eval[] {
  const me = h.seats[0]
  const n = need(h, 0)
  const c: Counts = new Array(34).fill(0)
  for (const t of me.hand) c[idx(t.kind)]++
  const seen = visible(h, 0)
  const out: Eval[] = []
  for (const kind of new Set(me.hand.map((t) => t.kind))) {
    const i = idx(kind)
    c[i]--
    const sh = shanten(c, n)
    let uke = 0
    for (let k = 0; k < 34; k++) {
      const left = 4 - seen[k]
      if (left <= 0) continue
      c[k]++
      if (shanten(c, n) < sh) uke += left
      c[k]--
    }
    c[i]++
    out.push({ kind, sh, uke })
  }
  return out.sort((a, b) => a.sh - b.sh || b.uke - a.uke)
}

/** 手上看起來在做一色（六成以上是同一種花色＋字）：這時候不挑效率的毛病 */
function flushPlan(h: HandState): string | null {
  const me = h.seats[0]
  const kinds = [...me.hand.map((t) => t.kind), ...me.melds.flatMap((m) => m.tiles.map((t) => t.kind))]
  const n: Record<string, number> = { m: 0, p: 0, s: 0 }
  let honors = 0
  for (const k of kinds) {
    if (isSuited(k)) n[cat(k)]++
    else honors++
  }
  const suit = Object.keys(n).sort((a, b) => n[b] - n[a])[0]
  const meldsOk = me.melds.every((m) => m.tiles.every((t) => !isSuited(t.kind) || cat(t.kind) === suit))
  return meldsOk && (n[suit] + honors) / kinds.length >= 0.62 ? suit : null
}

/** 你準備打 kind 這張：跟最好的選擇比，差多少。沒什麼好說的就回傳 null */
export function judgeDiscard(m: MatchState, tileId: number, turn: number, heardTing: readonly boolean[] = []): ReviewNote | null {
  const h = m.hand
  const me = h.seats[0]
  const tile = me.hand.find((t) => t.id === tileId)
  if (!tile) return null
  const kind = tile.kind
  const hand = me.hand.map((t) => t.kind)
  const ev = evaluateSeen(h)
  const mine = ev.find((e) => e.kind === kind)!
  const best = ev[0]
  const base = { turn, kind, hand, tileId }

  // 防守：有人看起來聽了、你還差兩步以上，卻打了很危險的牌（旁邊明明有安全牌）
  const th = publicThreats(h, heardTing)
  if (th.length && best.sh >= 2) {
    const dm = dangerMap(h, th)
    const safe = ev.filter((e) => dm.get(e.kind) === 'safe').sort((a, b) => a.sh - b.sh || b.uke - a.uke)[0]
    if (dm.get(kind) === 'danger' && safe) {
      const who = th.map((s) => CHARACTERS[m.chars[s]].name).join('、')
      return {
        ...base,
        better: safe.kind,
        reason: 'defense',
        text: `${who}看起來快胡了，${tileName(kind)}很危險。你還差 ${best.sh} 步，先打安全的${tileName(safe.kind)}比較穩。`,
        lesson: LESSON_FOR.defense,
        loss: 160,
      }
    }
  }

  const plan = flushPlan(h)
  if (plan && isSuited(kind) && cat(kind) !== plan) return null

  if (mine.sh > best.sh) {
    return {
      ...base,
      better: best.kind,
      reason: 'speed',
      text:
        best.sh === 0
          ? `打${tileName(best.kind)}就聽牌了；打${tileName(kind)}還差 ${mine.sh} 步。`
          : `打${tileName(kind)}之後還差 ${mine.sh} 步聽牌，打${tileName(best.kind)}只差 ${best.sh} 步。`,
      lesson: LESSON_FOR.speed,
      loss: 100 + (mine.sh - best.sh) * 60 + best.uke,
    }
  }
  if (mine.sh === best.sh && best.uke - mine.uke >= 4 && mine.uke < best.uke * 0.75) {
    return {
      ...base,
      better: best.kind,
      reason: 'uke',
      text: `兩張打了都${best.sh === 0 ? '聽牌' : `差 ${best.sh} 步`}，但打${tileName(best.kind)}${best.sh === 0 ? '能胡的牌' : '會前進的牌'}外面還有 ${best.uke} 張，打${tileName(kind)}只有 ${mine.uke} 張。`,
      lesson: LESSON_FOR.uke,
      loss: best.uke - mine.uke,
    }
  }
  return null
}

/** 一局結束：挑最值得說的三張，照打牌順序排；放槍的那張一定會列出來 */
export function pickNotes(notes: ReviewNote[], m: MatchState): ReviewNote[] {
  const w = m.result?.win
  const all = notes.map((n) => (w && w.from === 0 && w.tile.id === n.tileId ? { ...n, dealtIn: true, loss: n.loss + 500 } : n))
  return all
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .sort((a, b) => a.turn - b.turn)
}
