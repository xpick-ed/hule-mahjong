// 新功能：覆盤、危險牌、成就、好感度、每日挑戰重播。

import { describe, expect, it } from 'vitest'
import { chooseClaim, chooseSelf } from './engine/ai'
import { CHARACTERS } from './engine/characters'
import * as M from './engine/match'
import * as T from './engine/table'
import type { Tile } from './engine/tiles'
import { dailyInfo, dailyOptions, handGrid } from './daily'
import * as P from './progress'
import { LADDER, STAGES } from './engine/stages'
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

describe('關卡星星、牌型圖鑑', () => {
  const ended = (stage: number, history: M.MatchState['history'], points: number[]) => {
    const m = M.newMatch('stars', stage)
    m.phase = 'end'
    m.history = history
    m.points = points
    return m
  }
  it('第一關：拿第一、胡一手 3 台、沒放槍，一次拿三顆，各給金幣', () => {
    const m = ended(0, [{ winner: 0, from: 1, tai: 3, hand: 1, items: ['門清', '平胡'] }, { winner: 2, from: 3, tai: 1, hand: 2 }], [30000, 15000, 20000, 15000])
    const { p, fresh } = P.recordStars(P.defaultProgress, m)
    expect(fresh.map((x) => x.text)).toEqual(['拿第一', '胡一手 3 台以上', '一整場沒放槍'])
    expect(P.starsOf(p, 0)).toEqual([true, true, true])
    expect(p.coins).toBe(300)
    // 已經拿過的不會再給
    expect(P.recordStars(p, m).fresh).toHaveLength(0)
  })
  it('放槍就拿不到「沒放槍」；星星可以分好幾場拿', () => {
    const m = ended(0, [{ winner: 1, from: 0, tai: 2, hand: 1 }], [10000, 30000, 20000, 20000])
    const { p, fresh } = P.recordStars(P.defaultProgress, m)
    expect(fresh).toHaveLength(0)
    const m2 = ended(0, [{ winner: 0, from: null, tai: 1, hand: 1, items: ['自摸'] }], [30000, 15000, 20000, 15000])
    expect(P.starsOf(P.recordStars(p, m2).p, 0)).toEqual([true, false, true])
  })
  it('舊存檔：已過關的關卡補第一顆星', () => {
    const q = P.migrate({ cleared: 2, matches: 5 } as Partial<P.Progress>)
    expect(P.starsOf(q, 0)[0]).toBe(true)
    expect(P.starsOf(q, 1)[0]).toBe(true)
    expect(P.starsOf(q, 2)[0]).toBe(false)
  })
  it('圖鑑：第一次胡到的牌型收進來，留台數最高的那一手', () => {
    const m = M.newMatch('album', 0)
    const win = (total: number, items: string[]) => ({ seat: 0, from: null, tile: { id: 1, kind: 'p9' }, hand: [], score: { total, items: items.map((name) => ({ name, tai: 1 })) } })
    m.result = { win: win(3, ['門清自摸', '正花 ×2']), dealerItems: null, payments: [], deltas: [0, 0, 0, 0], dealer: 1, streak: 0 }
    const a = P.recordAlbum(P.defaultProgress, m)
    expect(a.fresh.sort()).toEqual(['正花', '門清自摸'])
    m.result = { ...m.result, win: win(5, ['門清自摸', '四暗刻']) }
    const b = P.recordAlbum(a.p, m)
    expect(b.fresh).toEqual(['四暗刻'])
    expect(b.p.album['門清自摸']).toMatchObject({ count: 2, best: { tai: 5 } })
    // 別人胡的不算
    m.result = { ...m.result, win: { ...win(8, ['清一色']), seat: 2 } }
    expect(P.recordAlbum(b.p, m).fresh).toHaveLength(0)
  })
})

describe('生存模式', () => {
  it('起始分數照帶進來的本錢倍數；第七關回到第一關、高手難度', () => {
    const m = M.newMatch('sv', 1, { survival: { level: 1, ratio: 1.5 } })
    expect(m.points[0]).toBe(STAGES[1].startPoints * 1.5)
    expect(m.points[1]).toBe(STAGES[1].startPoints)
    expect(M.survivalStage(6, LADDER.length)).toEqual({ stage: 0, loop: 2 })
  })
  const end = (level: number, points: number[]) => {
    const m = M.newMatch('sv-end', level % STAGES.length, { survival: { level, ratio: 1 } })
    m.phase = 'end'
    m.points = points
    return m
  }
  it('沒拿最後一名：晉級，本錢倍數帶到下一關，記錄最佳', () => {
    const s = STAGES[0].startPoints
    const { p, res } = P.recordSurvival(P.defaultProgress, end(0, [s * 1.5, s * 0.5, s * 1.2, s * 0.8]))
    expect(res).toMatchObject({ out: false, stages: 1, ratio: 1.5, best: true })
    expect(p.survivalRun).toEqual({ level: 1, ratio: 1.5 })
    expect(p.survivalBest?.stages).toBe(1)
  })
  it('拿最後一名：淘汰，進度清掉，紀錄是撐過的關數', () => {
    const s = STAGES[2].startPoints
    const start = { ...P.defaultProgress, survivalRun: { level: 2, ratio: 1.1 }, survivalBest: { stages: 1, ratio: 1, date: 'x' } }
    const { p, res, unlocked } = P.recordSurvival(start, end(2, [s * 0.4, s * 1.2, s * 1.1, s * 1.3]))
    expect(res).toMatchObject({ out: true, stages: 2, best: true })
    expect(p.survivalRun).toBeNull()
    expect(p.coins).toBe(200)
    expect(unlocked).toHaveLength(0)
  })
})

describe('全國錦標賽', () => {
  const idx = (event: number) => STAGES.findIndex((s) => s.tournament === event)
  it('每站兩個特別道具，各一次；不會有別的絕招', () => {
    expect(M.newMatch('t1', idx(1)).skills).toEqual({ lucky: 1, swap: 1 })
    expect(M.newMatch('t2', idx(2)).skills).toEqual({ peek: 1, shield: 1 })
    expect(M.newMatch('t3', idx(3)).skills).toEqual({ double: 1, shield: 1 })
  })
  /** 座位 0 打出 m3，座位 1 剛好聽 m3（放槍）；win0 = true 時反過來：座位 1 打 m3 給你胡 */
  const setup = (event: number, win0 = false) => {
    let n = 7000
    const t = (x: string) => x.split(' ').map((kind) => ({ id: n++, kind }))
    const m = M.newMatch(`item-${event}-${win0}`, idx(event))
    const waiting = 'm1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 m4 m5'
    const junk = 'z2 z2 z3 z3 z4 z4 z6 z6 s9 s9 p9 p9 m9 m9 s1 s2'
    const junk2 = 'p1 z2 z3 z4 z6 z7 s9 p9 m9 p5 p6 s1 s3 s4 p7 s8'
    const hands = win0 ? [waiting, 'm3 ' + junk2, junk, junk] : ['m3 ' + junk2, waiting, junk, junk]
    m.hand.seats.forEach((s, i) => {
      s.hand = t(hands[i])
      s.melds = []
      s.flowers = []
      s.discards = []
    })
    const turn = win0 ? 1 : 0
    m.hand.wall = t(Array(40).fill('z7').join(' '))
    m.hand.turn = turn
    m.hand.phase = 'discard'
    m.hand.drawn = m.hand.seats[turn].hand[0]
    m.hand.events = []
    m.dealer = 2
    m.hand.dealer = 2
    return m
  }
  it('免死金牌：這一局放槍不用付，贏的人照拿；用過就沒了', () => {
    let m = M.useSkill(setup(2), 'shield')
    expect(m.skills.shield).toBe(0)
    expect(() => M.useSkill(m, 'shield')).toThrow()
    m = M.discard(m, m.hand.seats[0].hand.find((x) => x.kind === 'm3')!.id)
    for (let g = 0; g < 5 && m.phase === 'play'; g++) m = M.step(m)
    const r = m.result!
    expect(r.win).toMatchObject({ seat: 1, from: 0 })
    expect(r.deltas[0]).toBe(0)
    expect(r.deltas[1]).toBeGreaterThan(0)
    expect(r.payments[0].waived).toBe(true)
    expect(r.extras?.some((x) => x.label.startsWith('免死金牌'))).toBe(true)
  })
  it('加倍卡：這一局你胡的話大家付兩倍', () => {
    const play = (use: boolean) => {
      let m = setup(3, true)
      if (use) m = M.useSkill(m, 'double')
      const r = structuredClone(m)
      // 座位 1 打出 m3，你聽 m3
      T.discardTile(r.hand, 1, r.hand.seats[1].hand.find((x) => x.kind === 'm3')!.id)
      expect(r.hand.options[0]?.hu).toBe(true)
      return M.claim(r, { type: 'hu' }).result!
    }
    const plain = play(false)
    const doubled = play(true)
    expect(plain.win).toMatchObject({ seat: 0, from: 1 })
    expect(doubled.deltas[0]).toBe(plain.deltas[0] * 2)
    expect(doubled.deltas[1]).toBe(plain.deltas[1] * 2)
    expect(doubled.extras?.some((x) => x.label.startsWith('加倍卡'))).toBe(true)
  })
  it('晉級：拿第一解鎖下一站，第三站拿第一是全國冠軍', () => {
    const end = (event: number, first: boolean) => {
      const m = M.newMatch('t-end', idx(event))
      m.phase = 'end'
      m.points = first ? [9e5, 1, 2, 3] : [1, 9e5, 2, 3]
      return m
    }
    let p = P.defaultProgress
    let r = P.recordTourney(p, end(1, false))
    expect(r.res.won).toBe(false)
    expect(r.p.tourneyCleared).toBe(0)
    r = P.recordTourney(p, end(1, true))
    expect(r.p.tourneyCleared).toBe(1)
    expect(r.res.coins).toBe(P.TOURNEY_PRIZE[0])
    p = P.recordTourney(r.p, end(2, true)).p
    const c = P.recordTourney(p, end(3, true))
    expect(c.res.champion).toBe(true)
    expect(c.p.tourneyWins).toBe(1)
    expect(c.unlocked.map((a) => a.id)).toContain('tourneyChamp')
  })
})
