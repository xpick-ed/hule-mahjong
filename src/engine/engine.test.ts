import { describe, expect, it } from 'vitest'
import * as M from './match'
import { scoreWin, type Meld, type WinContext } from './scoring'
import * as T from './table'
import type { Tile } from './tiles'
import { shanten, toCounts } from './analysis'

let id = 5000
const tiles = (s: string): Tile[] => (s ? s.split(' ').map((kind) => ({ id: id++, kind })) : [])
const meld = (type: Meld['type'], s: string, concealed = false): Meld => ({ type, tiles: tiles(s), ...(concealed ? { concealed } : {}) })

function ctx(hand: string, over: Partial<WinContext> = {}): WinContext {
  const h = tiles(hand)
  return {
    hand: h,
    melds: [],
    flowers: [],
    winTile: h[h.length - 1].kind,
    tsumo: false,
    seatWind: 1,
    roundWind: 0,
    lastTile: false,
    afterKong: false,
    heaven: false,
    earth: false,
    ...over,
  }
}
const names = (c: WinContext) => scoreWin(c).items.map((x) => x.name)

describe('台數', () => {
  it('門清自摸 3 台（不另算門清、自摸）', () => {
    const n = names(ctx('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s3 s4 s6 s7 s8 z5 z5', { tsumo: true }))
    expect(n).toContain('門清自摸')
    expect(n).not.toContain('門清')
    expect(n).not.toContain('自摸')
  })
  it('平胡：全順子、雀頭不是字、沒花、放槍胡、不是獨聽', () => {
    // 聽 s5 s8 兩面
    const c = ctx('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s3 s4 p5 p5 s6 s7 s8')
    expect(names(c)).toContain('平胡')
    expect(names({ ...c, flowers: tiles('f1') })).not.toContain('平胡')
  })
  it('碰碰胡、三暗刻；放槍胡的那組算明刻', () => {
    const hand = 'm1 m1 m1 p2 p2 p2 s9 s9 s9 z5 z5 z5 m7 m7 m7 z2 z2'
    const tsumo = scoreWin(ctx(hand, { tsumo: true, winTile: 'm7' }))
    expect(tsumo.items.map((x) => x.name)).toEqual(expect.arrayContaining(['碰碰胡', '五暗刻', '紅中']))
    const ron = scoreWin(ctx(hand, { winTile: 'm7' }))
    expect(ron.items.map((x) => x.name)).toContain('四暗刻')
  })
  it('清一色、混一色、字一色', () => {
    expect(names(ctx('m1 m2 m3 m4 m5 m6 m7 m8 m9 m1 m2 m3 m4 m5 m6 m9 m9'))).toContain('清一色')
    expect(names(ctx('m1 m2 m3 m4 m5 m6 m7 m8 m9 z1 z1 z1 m4 m5 m6 z5 z5'))).toContain('混一色')
    expect(names(ctx('z1 z1 z1 z2 z2 z2 z3 z3 z3 z5 z5 z5 z6 z6 z6 z7 z7'))).toContain('字一色')
  })
  it('大三元取代個別三元刻；小四喜取代圈風門風', () => {
    const d = names(ctx('z5 z5 z5 z6 z6 z6 z7 z7 z7 m1 m2 m3 p4 p5 p6 s9 s9'))
    expect(d).toContain('大三元')
    expect(d).not.toContain('紅中')
    const x = names(ctx('z1 z1 z1 z2 z2 z2 z3 z3 z3 m1 m2 m3 p4 p5 p6 z4 z4'))
    expect(x).toContain('小四喜')
    expect(x).not.toContain('圈風')
  })
  it('圈風、門風（南家拿南刻算門風）', () => {
    const n = names(ctx('z1 z1 z1 z2 z2 z2 m1 m2 m3 p4 p5 p6 s1 s2 s3 s9 s9'))
    expect(n).toContain('圈風')
    expect(n).toContain('門風')
  })
  it('正花、花槓', () => {
    const c = ctx('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s3 s4 s6 s7 s8 z5 z5', { flowers: tiles('f2 f6 f1 f3 f4') })
    const it = scoreWin(c).items
    expect(it.find((x) => x.name.startsWith('正花'))!.tai).toBe(2)
    expect(it.map((x) => x.name)).toContain('春夏秋冬')
  })
  it('嚦咕嚦咕 8 台', () => {
    expect(names(ctx('m1 m1 m3 m3 p2 p2 p5 p5 s7 s7 z1 z1 z5 z5 s9 s9 s9'))).toContain('嚦咕嚦咕')
  })
  it('有亮牌就沒有門清；全求人', () => {
    const c = ctx('z6 z6', {
      melds: [meld('chow', 'm1 m2 m3'), meld('pung', 'p5 p5 p5'), meld('chow', 's3 s4 s5'), meld('pung', 'm9 m9 m9'), meld('chow', 'p1 p2 p3')],
      winTile: 'z6',
    })
    const n = names(c)
    expect(n).toContain('全求人')
    expect(n).not.toContain('門清')
  })
})

/** 做一個可以控制的牌局：指定手牌和牌山順序 */
function rig(hands: string[], wall: string, dealer = 0): T.HandState {
  const h = T.newHand({ rng: 1 }, dealer, 0)
  h.seats.forEach((s, i) => {
    s.hand = tiles(hands[i])
    s.flowers = []
    s.melds = []
    s.discards = []
  })
  h.wall = [...tiles(wall), ...tiles(Array(20).fill('z7').join(' '))]
  h.turn = dealer
  h.phase = 'discard'
  h.drawn = h.seats[dealer].hand[h.seats[dealer].hand.length - 1]
  h.events = []
  h.win = null
  h.tingSaid = [false, false, false, false]
  return h
}

const hand16 = 'm1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 m4 m5'

describe('牌局流程', () => {
  it('發牌：每人 16 張、莊家 17 張，花都補掉了', () => {
    const h = T.newHand({ rng: 42 }, 2, 0)
    const n = (s: number) => h.seats[s].hand.length
    expect([n(0), n(1), n(3)]).toEqual([16, 16, 16])
    expect(n(2)).toBe(17)
    expect(h.seats.every((s) => s.hand.every((t) => t.kind[0] !== 'f'))).toBe(true)
    const all = h.seats.reduce((c, s) => c + s.hand.length + s.flowers.length, 0) + h.wall.length
    expect(all).toBe(144)
  })
  it('打出去沒人要，下家摸牌', () => {
    const h = rig([hand16 + ' z7', 'm9 m9 p9 p9 s1 s1 s3 z2 z3 z4 m7 p7 s8 s2 m2 p1', 'm8 p8 s4 z6 m3 p6 s9 m6 p5 s7 z4 m1 p1 s1 z2 z3', 'm2 m3 p1 p2 s1 s2 z1 z2 z3 z4 z5 z6 m8 p8 s8 m6'], 'p9')
    T.discardTile(h, 0, h.seats[0].hand.find((t) => t.kind === 'z7')!.id)
    expect(h.phase).toBe('discard')
    expect(h.turn).toBe(1)
    expect(h.seats[1].hand).toHaveLength(17)
  })
  it('胡 ＞ 碰 ＞ 吃，截胡照順序', () => {
    // 座位 0 打 m3：座位 1 能吃、座位 2 能碰、座位 3 能胡
    const h = rig(
      [
        'm3 p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 s4 s5 s6 s7',
        'm1 m2 z2 z2 z3 z3 z4 z4 z6 z6 s9 s9 p9 p9 m9 m9',
        'm3 m3 z2 z3 z4 z6 z7 s9 p9 m9 m5 m6 p1 p5 s1 s5',
        'm1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 m4 m5',
      ],
      'z7 z7',
    )
    T.discardTile(h, 0, h.seats[0].hand.find((t) => t.kind === 'm3')!.id)
    expect(h.phase).toBe('claim')
    expect(h.options[1]!.chi.length).toBeGreaterThan(0)
    expect(h.options[2]!.pon).toBe(true)
    expect(h.options[3]!.hu).toBe(true)
    T.decide(h, 1, { type: 'chi', use: ['m1', 'm2'] })
    T.decide(h, 2, { type: 'pon' })
    T.decide(h, 3, { type: 'hu' })
    T.resolveClaims(h)
    expect(h.win!.seat).toBe(3)
    expect(h.win!.from).toBe(0)
  })
  it('碰之後輪到碰的人打牌、不能自摸', () => {
    const h = rig(['m3 ' + hand16, 'z2 z2 z3 z3 z4 z4 z6 z6 s9 s9 p9 p9 m9 m9 s1 s2', 'm3 m3 z2 z3 z4 z6 z7 s9 p9 m9 m5 m6 p1 p5 s1 s5', 'm2 m2 p1 p2 s1 s2 z1 z2 z3 z4 z5 z6 m8 p8 s8 m6'], 'z7 z7')
    T.discardTile(h, 0, h.seats[0].hand.find((t) => t.kind === 'm3')!.id)
    T.decide(h, 2, { type: 'pon' })
    for (const o of [1, 3]) if (h.options[o]) T.decide(h, o, { type: 'pass' })
    T.resolveClaims(h)
    expect(h.turn).toBe(2)
    expect(h.phase).toBe('discard')
    expect(h.seats[2].melds[0].type).toBe('pung')
    expect(T.canTsumo(h, 2)).toBe(false)
  })
  it('只有下家能吃', () => {
    const h = rig(['m3 ' + hand16, 'z2 z2 z3 z3 z4 z4 z6 z6 s9 s9 p9 p9 m9 m9 s1 s2', 'm1 m2 z2 z3 z4 z6 z7 s9 p9 m9 m5 m6 p1 p5 s1 s5', 'm2 m4 p1 p2 s1 s2 z1 z2 z3 z4 z5 z6 m8 p8 s8 m6'], 'z7 z7')
    T.discardTile(h, 0, h.seats[0].hand.find((t) => t.kind === 'm3')!.id)
    expect(h.options[2]).toBeNull()
    expect(h.options[3]).toBeNull()
  })
  it('暗槓從牌尾補一張，槓上自摸算槓上開花', () => {
    const h = rig(['m1 m1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 m4 m5', 'z2', 'z3', 'z4'], 'z7')
    h.wall.push({ id: 99999, kind: 'm6' })
    T.selfKong(h, 0, 'm1')
    expect(h.seats[0].melds[0]).toMatchObject({ type: 'kong', concealed: true })
    expect(h.drawn!.kind).toBe('m6')
    T.tsumo(h, 0)
    expect(h.win!.score.items.map((x) => x.name)).toContain('槓上開花')
  })
  it('牌山剩 16 張就流局', () => {
    const h = rig(['m1 ' + hand16, 'z2', 'z3', 'z4'], '')
    h.wall = tiles(Array(16).fill('z7').join(' '))
    T.discardTile(h, 0, h.seats[0].hand[0].id)
    if (h.phase === 'claim') {
      for (let s = 1; s < 4; s++) if (h.options[s]) T.decide(h, s, { type: 'pass' })
      T.resolveClaims(h)
    }
    expect(h.exhausted).toBe(true)
    expect(h.phase).toBe('over')
  })
})

describe('一場東風圈', () => {
  it('同一個種子開出一樣的牌', () => {
    expect(M.newMatch('x', 0).hand.seats[0].hand).toEqual(M.newMatch('x', 0).hand.seats[0].hand)
  })
  it('自摸三家付；莊家有關的那筆多算莊家台', () => {
    const m = M.newMatch('pay', 0)
    m.dealer = 1
    m.streak = 1
    m.hand = rig([hand16 + ' m6', 'z2', 'z3', 'z4'], 'z7', 0)
    m.hand.dealer = 1
    const r = M.tsumo(m)
    const res = r.result!
    const tai = res.win!.score.total
    const pay = (seat: number) => res.payments.find((p) => p.seat === seat)!
    expect(pay(2).amount).toBe(m.base + tai * m.perTai)
    // 莊家（座位 1）多付 莊家 1 台＋連 1 拉 1（2 台）
    expect(pay(1).amount).toBe(m.base + (tai + 3) * m.perTai)
    expect(res.deltas.reduce((s, x) => s + x, 0)).toBe(0)
  })
  it('莊家沒胡就換莊；換滿四次結束', () => {
    const otherWins = (m: M.MatchState): M.HandResult => ({
      win: { seat: (m.dealer + 1) % 4, from: null, tile: { id: 1, kind: 'm1' }, score: { items: [], total: 0 }, hand: [] },
      dealerItems: null,
      payments: [],
      deltas: [0, 0, 0, 0],
      dealer: m.dealer,
      streak: 0,
    })
    let m = M.newMatch('rotate', 0)
    m.phase = 'handEnd'
    m.result = otherWins(m)
    const d0 = m.dealer
    m = M.nextHand(m)
    expect(m.dealer).toBe((d0 + 1) % 4)
    expect(m.passes).toBe(1)
    m.passes = 3
    m.phase = 'handEnd'
    m.result = otherWins(m)
    m = M.nextHand(m)
    expect(m.phase).toBe('end')
  })
  it('流局連莊', () => {
    let m = M.newMatch('streak', 0)
    m.phase = 'handEnd'
    m.result = { win: null, dealerItems: null, payments: [], deltas: [0, 0, 0, 0], dealer: m.dealer, streak: 0 }
    const d0 = m.dealer
    m = M.nextHand(m)
    expect(m.dealer).toBe(d0)
    expect(m.streak).toBe(1)
  })
  it('絕招：換牌會換掉手上那張、次數會減少', () => {
    let m = M.newMatch('skill', 0)
    m.hand.turn = 0
    m.hand.phase = 'discard'
    const t = m.hand.seats[0].hand[0]
    m = M.useSkill(m, 'swap', t.id)
    expect(m.hand.seats[0].hand.some((x) => x.id === t.id)).toBe(false)
    expect(m.skills.swap).toBe(1)
  })
  it('過年回老家：自摸三家付兩倍', () => {
    const m = M.newMatch('newyear', 2)
    m.dealer = 1
    m.hand = rig([hand16 + ' m6', 'z2', 'z3', 'z4'], 'z7', 0)
    m.hand.dealer = 1
    const r = M.tsumo(m).result!
    const tai = r.win!.score.total
    expect(r.payments.find((p) => p.seat === 2)!.amount).toBe((m.base + tai * m.perTai) * 2)
    expect(r.extras?.[0].label).toContain('過年紅包')
  })
  it('公司尾牙：你胡的牌有紅中就抽獎', () => {
    const m = M.newMatch('raffle', 1)
    m.hand = rig(['m1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 z5 m4 m4', 'z2', 'z3', 'z4'], 'z7', 0)
    const r = M.tsumo(m).result!
    expect(r.extras?.[0].label).toBe('尾牙摸彩')
    expect(r.extras?.[0].coins).toBeGreaterThan(0)
  })
})

describe('牌桌規則', () => {
  const junk1 = 'z2 z2 z3 z3 z4 z4 z6 z6 s9 s9 p9 p9 m9 m9 s1 s2'
  const junk2 = 'p1 z2 z3 z4 z6 z7 s9 p9 m9 m1 m2 p5 p6 s1 s3 s4'
  const me17 = 'm3 p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 s4 s5 s6 s7'
  const id = (h: T.HandState, seat: number, kind: string) => h.seats[seat].hand.find((t) => t.kind === kind)!.id
  const passAll = (h: T.HandState) => {
    for (let s = 0; s < 4; s++) if (h.options[s] && !h.decisions[s]) T.decide(h, s, { type: 'pass' })
    T.resolveClaims(h)
  }

  it('過水：放過能胡的牌，摸牌之前不能胡別人打的', () => {
    const h = rig([me17, junk1, junk2, hand16], 'm6 s8 p2')
    T.discardTile(h, 0, id(h, 0, 'm3'))
    expect(h.options[3]!.hu).toBe(true)
    passAll(h)
    expect(h.passedWin![3]).toBe(true)
    // 下家摸到 m6 打出來：座位 3 聽 m6 但過水中，不能胡
    T.discardTile(h, 1, id(h, 1, 'm6'))
    expect(h.options[3]).toBeNull()
    if (h.phase === 'claim') passAll(h)
    T.drawTile(h, 3)
    expect(h.passedWin![3]).toBe(false)
  })
  it('過水規則關掉就可以胡', () => {
    const h = rig([me17, junk1, junk2, hand16], 'm6 s8 p2')
    h.rules = { ...T.DEFAULT_RULES, passWin: false }
    T.discardTile(h, 0, id(h, 0, 'm3'))
    passAll(h)
    T.discardTile(h, 1, id(h, 1, 'm6'))
    expect(h.options[3]!.hu).toBe(true)
  })
  it('截胡：兩家胡同一張，只有最近的下家胡', () => {
    const also = 'm1 m2 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 z5 p9 p9'
    const h = rig([me17, junk1, also, hand16], 'z7')
    T.discardTile(h, 0, id(h, 0, 'm3'))
    T.decide(h, 2, { type: 'hu' })
    T.decide(h, 3, { type: 'hu' })
    passAll(h)
    expect(h.win!.seat).toBe(2)
    expect(h.also).toBeUndefined()
  })
  it('一炮多響：兩家都胡，放槍的人兩家都付', () => {
    const also = 'm1 m2 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 z5 p9 p9'
    let m = M.newMatch('multi', 0, { rules: { ...T.DEFAULT_RULES, multiRon: true } })
    m.dealer = 0
    m.hand = rig([junk2, 'm3 ' + me17.slice(3), also, hand16], 'z7', 1)
    m.hand.rules = m.rules
    m.hand.dealer = 0
    T.discardTile(m.hand, 1, id(m.hand, 1, 'm3'))
    m = M.step(m)
    const r = m.result!
    expect(M.winsOf(r).map((w) => w.seat)).toEqual([2, 3])
    expect(r.payments.every((p) => p.seat === 1)).toBe(true)
    expect(r.deltas[2]).toBeGreaterThan(0)
    expect(r.deltas[3]).toBeGreaterThan(0)
    expect(r.deltas.reduce((s, x) => s + x, 0)).toBe(0)
  })
  it('搶槓：加槓那張被別家胡走，槓子變回碰', () => {
    const h = rig(['m6 p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 z7', hand16, junk2, junk1], 'z7')
    h.seats[0].melds = [meld('pung', 'm6 m6 m6')]
    T.selfKong(h, 0, 'm6')
    expect(h.phase).toBe('claim')
    expect(h.options[1]).toMatchObject({ hu: true, pon: false, kong: false })
    T.decide(h, 1, { type: 'hu' })
    passAll(h)
    expect(h.win).toMatchObject({ seat: 1, from: 0 })
    expect(h.win!.score.items.map((x) => x.name)).toContain('搶槓')
    expect(h.seats[0].melds[0].type).toBe('pung')
    expect(h.seats[0].melds[0].tiles).toHaveLength(3)
  })
  it('搶槓沒人要：槓成功、從牌尾補牌', () => {
    const h = rig(['m6 p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 z7', hand16, junk2, junk1], 'z7')
    h.seats[0].melds = [meld('pung', 'm6 m6 m6')]
    T.selfKong(h, 0, 'm6')
    T.decide(h, 1, { type: 'pass' })
    passAll(h)
    expect(h.phase).toBe('discard')
    expect(h.turn).toBe(0)
    expect(h.seats[0].melds[0].tiles).toHaveLength(4)
    expect(h.afterKong).toBe(true)
    expect(h.passedWin![1]).toBe(true)
  })
  it('七搶一：別人摸到第八張花，有七張花的人直接胡、摸到的人付', () => {
    const h = rig([hand16 + ' z7', junk1, junk2, 'p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 s4 s5 s6 s7'], 'f8 m2')
    h.seats[1].flowers = tiles('f1 f2 f3 f4 f5 f6 f7')
    T.discardTile(h, 0, id(h, 0, 'z7'))
    if (h.phase === 'claim') passAll(h)
    // 座位 1 摸到 f8 補花 → 被自己用掉？不，座位 1 自己就是七張花：摸到第八張是八仙過海
    expect(h.win).toMatchObject({ seat: 1, from: null })
    expect(h.win!.score.items[0].name).toBe('八仙過海')
  })
  it('七搶一：別家摸到第八張花被搶', () => {
    const h = rig([hand16 + ' z7', junk1, junk2, 'p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 s4 s5 s6 s7'], 'f8 m2')
    h.seats[3].flowers = tiles('f1 f2 f3 f4 f5 f6 f7')
    T.discardTile(h, 0, id(h, 0, 'z7'))
    if (h.phase === 'claim') passAll(h)
    expect(h.win).toMatchObject({ seat: 3, from: 1 })
    expect(h.win!.score.items[0]).toEqual({ name: '七搶一', tai: 8 })
    expect(h.seats[3].flowers).toHaveLength(8)
    expect(h.seats[1].flowers).toHaveLength(0)
  })
  it('連莊上限：連到上限就換莊', () => {
    let m = M.newMatch('cap', 0, { rules: { ...T.DEFAULT_RULES, streakCap: 2 } })
    const d0 = m.dealer
    m.streak = 2
    m.phase = 'handEnd'
    m.result = { win: null, dealerItems: null, payments: [], deltas: [0, 0, 0, 0], dealer: d0, streak: 2 }
    m = M.nextHand(m)
    expect(m.dealer).toBe((d0 + 1) % 4)
    expect(m.streak).toBe(0)
  })
  it('難度：輕鬆的對手常失誤、不太防守', () => {
    const m = M.newMatch('easy', 0, { difficulty: 'easy' })
    const hard = M.newMatch('easy', 0, { difficulty: 'hard' })
    expect(M.styleOf(m, 1).mistakes).toBeGreaterThan(M.styleOf(hard, 1).mistakes)
    expect(M.styleOf(m, 1).defense).toBeLessThan(M.styleOf(hard, 1).defense)
  })
  it('引導局：你的起手牌差兩步以內', () => {
    for (const seed of ['a', 'b', 'c']) {
      const m = M.newMatch(seed, 0, { tutorial: true })
      expect(shanten(toCounts(m.hand.seats[0].hand), 5)).toBeLessThanOrEqual(2)
    }
  })
})

describe('新關卡', () => {
  it('颱風夜民宿：打兩圈，換莊 4 次後進南風圈，換滿 8 次才結束', () => {
    let m = M.newMatch('storm', 4)
    const otherWins = (mm: M.MatchState): M.HandResult => ({
      win: { seat: (mm.dealer + 1) % 4, from: null, tile: { id: 1, kind: 'm1' }, score: { items: [], total: 0 }, hand: [] },
      dealerItems: null,
      payments: [],
      deltas: [0, 0, 0, 0],
      dealer: mm.dealer,
      streak: 0,
    })
    for (let i = 0; i < 4; i++) {
      m = { ...m, phase: 'handEnd', result: otherWins(m) }
      m = M.nextHand(m)
    }
    expect(m.phase).toBe('play')
    expect(m.hand.roundWind).toBe(1)
    expect(M.lastRound(m)).toBe(false)
    for (let i = 0; i < 3; i++) {
      m = { ...m, phase: 'handEnd', result: otherWins(m) }
      m = M.nextHand(m)
    }
    expect(M.lastRound(m)).toBe(true)
    m = { ...m, phase: 'handEnd', result: otherWins(m) }
    expect(M.nextHand(m).phase).toBe('end')
  })
  it('全國大賽：自摸多算 1 台（決賽加碼）', () => {
    const m = M.newMatch('final', 5)
    m.dealer = 1
    m.hand = rig([hand16 + ' m6', 'z2', 'z3', 'z4'], 'z7', 0)
    m.hand.dealer = 1
    const r = M.tsumo(m).result!
    expect(r.win!.score.items.map((x) => x.name)).toContain('決賽加碼')
    const tai = r.win!.score.total
    expect(r.payments.find((p) => p.seat === 2)!.amount).toBe(m.base + tai * m.perTai)
  })
})
