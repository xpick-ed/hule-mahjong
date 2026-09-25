import { describe, expect, it } from 'vitest'
import * as M from './engine/match'
import * as P from './progress'

describe('段位', () => {
  it('依點數算段位和下一段的距離', () => {
    expect(P.rankOf(0).name).toBe('新手')
    expect(P.rankOf(99).name).toBe('新手')
    expect(P.rankOf(100).name).toBe('初段')
    const r = P.rankOf(300)
    expect(r.name).toBe('二段')
    expect(r.into).toBe(50)
    expect(r.span).toBe(200)
    expect(P.rankOf(99999).next).toBeNull()
  })
})

describe('每日任務', () => {
  it('同一天的任務固定，三個指標都不一樣', () => {
    const a = P.ensureDaily(P.defaultProgress, '2026-09-26')
    const b = P.ensureDaily(P.defaultProgress, '2026-09-26')
    expect(a.daily!.ids).toEqual(b.daily!.ids)
    expect(new Set(a.daily!.ids.map((id) => P.MISSION[id].metric)).size).toBe(3)
    const c = P.ensureDaily(a, '2026-09-27')
    expect(c.daily!.date).toBe('2026-09-27')
  })
  it('計數、完成、領獎（只能領一次）', () => {
    let p = P.ensureDaily(P.defaultProgress, P.today())
    const id = p.daily!.ids[0]
    const def = P.MISSION[id]
    const r = P.bump(p, { [def.metric]: def.goal })
    expect(r.finished.map((f) => f.id)).toContain(id)
    p = P.claim(r.p, id)
    expect(p.coins).toBe(def.reward)
    expect(P.claim(p, id).coins).toBe(def.reward)
    expect(P.claimable(p)).toBe(0)
  })
})

describe('一場結束的獎勵', () => {
  it('名次、胡牌、段位', () => {
    const m = M.newMatch('reward', 1)
    m.points = [50000, 40000, 38000, 32000]
    m.history = [
      { winner: 0, from: 1, tai: 3 },
      { winner: 2, from: null, tai: 1 },
      { winner: 0, from: null, tai: 5 },
    ]
    const r = P.matchRewards(m)
    expect(r.place).toBe(0)
    // 第一名 300 × 1.5；胡 2 手 8 台：(2×20 + 8×10) × 1.5
    expect(r.coins).toBe(450 + 180)
    expect(r.rankDelta).toBe(50)
    expect(P.matchMetrics(m)).toEqual({ match: 1, first: 1, cleanMatch: 1 })
  })
})
