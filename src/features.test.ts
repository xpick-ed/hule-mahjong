// 新功能：覆盤、危險牌、成就、好感度、每日挑戰重播。

import { describe, expect, it } from 'vitest'
import { chooseClaim, chooseSelf } from './engine/ai'
import { CHARACTERS } from './engine/characters'
import * as M from './engine/match'
import type { Tile } from './engine/tiles'
import { dailyInfo, dailyOptions, handGrid } from './daily'
import * as P from './progress'
import { dangerMap, judgeDiscard, publicThreats } from './review'

let id = 9000
const tiles = (s: string): Tile[] => s.split(' ').map((kind) => ({ id: id++, kind }))

/** 一場引擎開出來的比賽，手牌換成指定的 */
function withHand(hand: string): M.MatchState {
  const m = M.newMatch('review', 0)
  const h = m.hand
  h.turn = 0
  h.phase = 'discard'
  h.seats[0].hand = tiles(hand)
  h.seats[0].melds = []
  h.drawn = h.seats[0].hand[h.seats[0].hand.length - 1]
  return m
}

describe('教練覆盤', () => {
  it('拆掉搭子、留孤張：記一筆，建議打孤張', () => {
    // 北風是孤張；打 m5 會拆掉 m4 m5 m6 這組
    const m = withHand('m1 m2 m3 m4 m5 m6 p2 p3 p4 s5 s6 s7 z1 z1 z1 s2 z4')
    const bad = m.hand.seats[0].hand.find((t) => t.kind === 'm5')!
    const note = judgeDiscard(m, bad.id, 3)
    expect(note).not.toBeNull()
    expect(note!.reason).toBe('speed')
    expect(['z4', 's2']).toContain(note!.better)
    const good = m.hand.seats[0].hand.find((t) => t.kind === 'z4')!
    expect(judgeDiscard(m, good.id, 3)).toBeNull()
  })
  it('有人亮三組、你還差很多：打沒看過的中張算危險，建議打安全牌', () => {
    const m = withHand('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z2 z3 z4 z5 z6 z7 m5')
    const opp = m.hand.seats[1]
    opp.melds = [
      { type: 'pung', tiles: tiles('p9 p9 p9'), from: 2 },
      { type: 'pung', tiles: tiles('s1 s1 s1'), from: 2 },
      { type: 'pung', tiles: tiles('m9 m9 m9'), from: 2 },
    ]
    opp.discards = tiles('z7 z1').map((tile) => ({ tile }))
    expect(publicThreats(m.hand)).toContain(1)
    const dm = dangerMap(m.hand, [1])
    expect(dm.get('z7')).toBe('safe')
    expect(dm.get('m5')).toBe('danger')
    const n = judgeDiscard(m, m.hand.seats[0].hand.find((t) => t.kind === 'm5')!.id, 5)
    expect(n?.reason).toBe('defense')
    expect(['z7', 'z1']).toContain(n!.better)
  })
})

describe('成就、好感度', () => {
  it('胡清一色：解鎖開胡、清一色，戰績記下最大的一手', () => {
    const m = M.newMatch('ach', 0)
    m.phase = 'handEnd'
    m.result = {
      win: { seat: 0, from: 1, tile: { id: 1, kind: 'm1' }, score: { items: [{ name: '清一色', tai: 8 }, { name: '門清', tai: 1 }], total: 9 }, hand: [] },
      dealerItems: null,
      payments: [],
      deltas: [0, 0, 0, 0],
      dealer: 2,
      streak: 0,
    }
    const { p, unlocked } = P.recordHand(P.defaultProgress, m)
    expect(unlocked.map((a) => a.id)).toEqual(expect.arrayContaining(['firstWin', 'qingyise', 'tai8']))
    expect(p.stats.wins).toBe(1)
    expect(p.stats.best!.tai).toBe(9)
    // 同一個成就不會解鎖兩次
    expect(P.recordHand(p, m).unlocked).toHaveLength(0)
  })
  it('打完一場：三個對手都加好感度，名次比他高的加更多；升級會回報', () => {
    const m = M.newMatch('aff', 0)
    m.points = [30000, 20000, 15000, 15000]
    m.phase = 'end'
    const p0 = { ...P.defaultProgress, matches: 1, affinity: { [m.chars[1]]: 15 } }
    const r = P.recordMatch(p0, m, Object.keys(CHARACTERS))
    expect(r.gains[m.chars[1]]).toBeGreaterThanOrEqual(20)
    expect(r.levelUps.some((x) => x.id === m.chars[1] && x.lv === 1)).toBe(true)
    expect(r.p.vs[m.chars[2]]).toEqual({ played: 1, above: 1 })
    expect(P.affinityLevel(200).lv).toBe(5)
    expect(P.affinityLevel(49).lv).toBe(1)
  })
  it('舊存檔補上新欄位；打過的人不用再走引導局', () => {
    const q = P.migrate({ matches: 3, coins: 10 } as Partial<P.Progress>)
    expect(q.stats.hands).toBe(0)
    expect(q.tutorial).toBe(true)
    expect(P.migrate({}).tutorial).toBe(false)
  })
})

describe('每日挑戰', () => {
  it('同一天同一副牌', () => {
    const a = dailyInfo('2026-09-26')
    expect(dailyInfo('2026-09-26')).toEqual(a)
    const m1 = M.newMatch(a.seed, a.stage, dailyOptions(a.date))
    const m2 = M.newMatch(a.seed, a.stage, dailyOptions(a.date))
    expect(m1.hand.seats[0].hand).toEqual(m2.hand.seats[0].hand)
  })
  it('照動作紀錄重播，得到一模一樣的結果', () => {
    const d = dailyInfo('2026-01-01')
    const style = { speed: 0.5, defense: 0.5, greed: 0.2, mistakes: 0.2 }
    let m = M.newMatch(d.seed, d.stage, dailyOptions(d.date))
    const log: M.Act[] = []
    const rng = { rng: 12345 }
    for (let g = 0; g < 5000 && m.phase !== 'end'; g++) {
      const t = m.ticks ?? 0
      if (m.phase === 'handEnd') {
        log.push([t, 'n'])
        m = M.nextHand(m)
      } else if (M.waitingForYou(m)) {
        const h = m.hand
        if (h.phase === 'claim') {
          const c = chooseClaim(h, 0, h.options[0]!, style, rng)
          log.push([t, 'c', c])
          m = M.claim(m, c)
        } else {
          const a = chooseSelf(h, 0, style, rng)
          if (a.type === 'tsumo') (log.push([t, 't']), (m = M.tsumo(m)))
          else if (a.type === 'kong') (log.push([t, 'k', a.kind]), (m = M.kong(m, a.kind)))
          else (log.push([t, 'd', a.tileId]), (m = M.discard(m, a.tileId)))
        }
      } else m = M.step(m)
    }
    expect(m.phase).toBe('end')
    const r = M.replay(d.seed, d.stage, dailyOptions(d.date), log)
    expect(r.phase).toBe('end')
    expect(r.points).toEqual(m.points)
    expect(handGrid(r)).toBe(handGrid(m))
    expect([...handGrid(m)].length).toBe(new Set(m.history.map((x) => x.hand)).size)
  })
})
