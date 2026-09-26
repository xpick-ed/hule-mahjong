// 連線對打：好幾個真人座位、每個人看到的牌局（轉座位、蓋牌）。

import { describe, expect, it } from 'vitest'
import * as M from './match'
import { rotateMatch, viewFor } from './online'

const HUMANS = [true, false, true, false]
const players: M.SeatPlayer[] = HUMANS.map((h, i) => ({ name: h ? `玩家${i}` : '電腦', human: h }))

/** 真人都用「自動」出牌，電腦照常：打完一整場 */
function playOut(m: M.MatchState, seed = 1): M.MatchState {
  const rng = { rng: seed }
  for (let g = 0; g < 30000 && m.phase !== 'end'; g++) {
    if (m.phase === 'handEnd') {
      m = M.nextHand(m)
      continue
    }
    const pending = M.humansPending(m)
    if (pending.length) m = M.act(m, pending[0], M.autoMove(m, pending[0], rng)!)
    else {
      const n = M.step(m)
      if (n === m) throw new Error('卡住了')
      m = n
    }
  }
  return m
}

describe('連線對打：好幾個真人', () => {
  it('真人座位不會被電腦代打；輪到真人時電腦停下來等', () => {
    let m = M.newMatch('online-1', 0, { humans: HUMANS })
    expect(m.chars[0]).toBe('me')
    expect(m.chars[2]).toBe('me')
    expect(m.online).toBe(true)
    expect(m.skills).toEqual({ swap: 0, peek: 0, lucky: 0 })
    for (let g = 0; g < 500 && !M.humansPending(m).length && m.phase === 'play'; g++) m = M.step(m)
    const who = M.humansPending(m)
    expect(who.length).toBeGreaterThan(0)
    expect(M.step(m)).toBe(m)
  })
  it('不能替別人或電腦出牌', () => {
    const m = M.newMatch('online-2', 0, { humans: HUMANS })
    expect(() => M.act(m, 1, ['t'])).toThrow()
  })
  it('兩個真人打完一整場，分數總和不變', () => {
    for (const seed of ['a', 'b', 'c']) {
      const m = playOut(M.newMatch(`online-${seed}`, 1, { humans: HUMANS }))
      expect(m.phase).toBe('end')
      expect(m.points.reduce((s, x) => s + x, 0)).toBe(M.stageOf(m).startPoints * 4)
    }
  })
  it('四個真人也可以', () => {
    const m = playOut(M.newMatch('online-4', 0, { humans: [true, true, true, true] }))
    expect(m.phase).toBe('end')
  })
})

describe('每個人看到的牌局', () => {
  it('轉一圈回到原樣', () => {
    let m = M.newMatch('rot', 0, { humans: HUMANS })
    for (let g = 0; g < 40; g++) {
      const p = M.humansPending(m)
      m = p.length ? M.act(m, p[0], M.autoMove(m, p[0], { rng: g + 1 })!) : M.step(m)
    }
    for (const k of [1, 2, 3]) expect(rotateMatch(rotateMatch(m, k), (4 - k) % 4)).toEqual(m)
  })
  it('座位 2 看到：自己在 0、別人的手牌和牌山都蓋住、沒有亂數', () => {
    const m = M.newMatch('view', 0, { humans: HUMANS })
    const v = viewFor(m, 2, players)
    expect(v.hand.seats[0].hand).toEqual(m.hand.seats[2].hand)
    expect(v.players![0].name).toBe('玩家2')
    expect(v.chars[2]).toBe(m.chars[0])
    expect(v.dealer).toBe((m.dealer - 2 + 4) % 4)
    for (const s of [1, 2, 3]) expect(v.hand.seats[s].hand.every((t) => t.kind === 'x')).toBe(true)
    expect(v.hand.wall.every((t) => t.kind === 'x')).toBe(true)
    expect(v.hand.wall).toHaveLength(m.hand.wall.length)
    expect(v.rng).toBe(0)
    expect(v.seed).toBe('')
    // 原本那份沒被改到
    expect(m.hand.seats[0].hand.some((t) => t.kind !== 'x')).toBe(true)
  })
  it('每個人看到的胡牌的人、放槍的人、輸贏都對得上', () => {
    for (const seed of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6']) {
      let m = M.newMatch(`win-${seed}`, 0, { humans: HUMANS })
      const rng = { rng: 9 }
      for (let g = 0; g < 5000 && m.phase === 'play'; g++) {
        const p = M.humansPending(m)
        m = p.length ? M.act(m, p[0], M.autoMove(m, p[0], rng)!) : M.step(m)
      }
      const w = m.result?.win
      if (!w) continue
      for (const seat of [0, 1, 2, 3]) {
        const v = viewFor(m, seat, players)
        const vw = v.result!.win!
        expect(vw.seat).toBe((w.seat - seat + 4) % 4)
        expect(v.hand.win!.seat).toBe(vw.seat)
        expect(v.result!.deltas[vw.seat]).toBeGreaterThan(0)
        if (w.from !== null) expect(vw.from).toBe((w.from - seat + 4) % 4)
        expect(v.players![vw.seat].name).toBe(players[w.seat].name)
      }
    }
  })
  it('一局結束時手牌全部亮出來', () => {
    let m = M.newMatch('reveal', 0, { humans: HUMANS })
    const rng = { rng: 5 }
    for (let g = 0; g < 5000 && m.phase === 'play'; g++) {
      const p = M.humansPending(m)
      m = p.length ? M.act(m, p[0], M.autoMove(m, p[0], rng)!) : M.step(m)
    }
    const v = viewFor(m, 0, players)
    expect(v.hand.seats[1].hand.some((t) => t.kind !== 'x')).toBe(true)
  })
})
