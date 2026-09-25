import { describe, expect, it } from 'vitest'
import {
  buy,
  collect,
  discard,
  GameError,
  newRun,
  nextRound,
  playMeld,
  reroll,
  resolveScore,
  sellGod,
  useItem,
} from './game'
import { canPlayAny, classify, type Meld, type MeldType } from './melds'
import { detectPatterns, type PatternId } from './patterns'
import { scoreHand } from './scoring'
import type { Tile } from './tiles'
import type { RoundState, RunState } from './types'

let nextId = 1000
const T = (kind: string, enh?: Tile['enh']): Tile => ({ id: nextId++, kind, ...(enh ? { enh } : {}) })
const tiles = (s: string) => s.split(' ').map((k) => T(k))
const meld = (s: string): Meld => {
  const ts = tiles(s)
  return { type: classify(ts) as MeldType, tiles: ts }
}

function patternIds(melds: string[], eye: string, extra: Partial<Parameters<typeof detectPatterns>[0]> = {}): PatternId[] {
  return detectPatterns({
    melds: melds.map(meld),
    eye: meld(eye),
    flowers: 0,
    roundWind: 'z1',
    lastWasKong: false,
    discardsThisHand: 1,
    ...extra,
  }).map((h) => h.id)
}

/** 把一局改成指定的手牌和牌山（牌山從尾巴摸） */
function rig(run: RunState, hand: string, pile = ''): RunState {
  const r = structuredClone(run)
  const round = r.round as RoundState
  round.hand = tiles(hand)
  round.handSize = round.hand.length
  round.pile = pile ? tiles(pile).reverse() : []
  round.status = 'play'
  round.score = null
  return r
}

const ids = (r: RunState, kinds: string) => {
  const used = new Set<number>()
  return kinds.split(' ').map((k) => {
    const t = r.round!.hand.find((x) => x.kind === k && !used.has(x.id))!
    used.add(t.id)
    return t.id
  })
}

describe('面子', () => {
  it('分得出對子、順子、刻子、槓', () => {
    expect(classify(tiles('m1 m1'))).toBe('pair')
    expect(classify(tiles('m3 m1 m2'))).toBe('chow')
    expect(classify(tiles('p7 p7 p7'))).toBe('pung')
    expect(classify(tiles('z5 z5 z5 z5'))).toBe('kong')
  })
  it('組不成的回傳 null', () => {
    expect(classify(tiles('m1 p2 s3'))).toBeNull()
    expect(classify(tiles('z1 z2 z3'))).toBeNull()
    expect(classify(tiles('m8 m9 m1'))).toBeNull()
    expect(classify(tiles('m1'))).toBeNull()
    expect(classify(tiles('f1 f1'))).toBeNull()
  })
  it('看得出手上還有沒有牌可出', () => {
    const empty = { melds: [], eye: null }
    expect(canPlayAny(tiles('m1 m4 p2 s9 z1'), empty)).toBe(false)
    expect(canPlayAny(tiles('m1 m1 p2'), empty)).toBe(true)
    const eyeDone = { melds: [], eye: meld('s5 s5') }
    expect(canPlayAny(tiles('m1 m1 p2'), eyeDone)).toBe(false)
    expect(canPlayAny(tiles('m1 m2 m3'), eyeDone)).toBe(true)
  })
})

describe('牌型', () => {
  it('平胡＋斷么九＋一般高', () => {
    const p = patternIds(['m2 m3 m4', 'm2 m3 m4', 'p5 p6 p7', 's3 s4 s5'], 'p8 p8')
    expect(p).toEqual(['hu', 'pinghu', 'duanyao', 'yibangao'])
  })
  it('清一色＋一條龍', () => {
    const p = patternIds(['s1 s2 s3', 's4 s5 s6', 's7 s8 s9', 's7 s8 s9'], 's5 s5')
    expect(p).toContain('qingyise')
    expect(p).toContain('yitiaolong')
    expect(p).toContain('pinghu')
  })
  it('三色同順', () => {
    expect(patternIds(['m3 m4 m5', 'p3 p4 p5', 's3 s4 s5', 'm7 m8 m9'], 'z2 z2')).toContain('sanse')
  })
  it('對對胡＋混一色＋圈風＋三元', () => {
    const p = patternIds(['m1 m1 m1', 'z1 z1 z1', 'z5 z5 z5', 'm9 m9 m9 m9'], 'm2 m2')
    expect(p).toEqual(expect.arrayContaining(['duidui', 'hunyise', 'quanfeng', 'sanyuan']))
    expect(p).not.toContain('qingyise')
  })
  it('大三元不會同時算小三元；字一色不算混一色', () => {
    const p = patternIds(['z5 z5 z5', 'z6 z6 z6', 'z7 z7 z7', 'z2 z2 z2'], 'z1 z1')
    expect(p).toContain('dasanyuan')
    expect(p).not.toContain('xiaosanyuan')
    expect(p).toContain('ziyise')
    expect(p).not.toContain('hunyise')
  })
  it('全帶么、槓上開花、一氣呵成、花牌', () => {
    const p = patternIds(['m1 m2 m3', 'p7 p8 p9', 's9 s9 s9', 'z3 z3 z3 z3'], 'm9 m9', {
      lastWasKong: true,
      discardsThisHand: 0,
      flowers: 2,
    })
    expect(p).toEqual(expect.arrayContaining(['quandai', 'gangshang', 'yiqi', 'flower']))
  })
})

describe('計分', () => {
  it('分 × 台', () => {
    const run = newRun('score')
    const round = run.round!
    round.table = { melds: ['m2 m3 m4', 'm5 m6 m7', 'p2 p3 p4', 's6 s7 s8'].map(meld), eye: meld('p5 p5') }
    round.discardsThisHand = 1
    const s = scoreHand(run, round, 'hu')
    // 分：順子 4×10 + 雀頭 5 + 牌面 (9+18+9+21+10) = 112
    expect(s.chips).toBe(112)
    // 台：底 1 + 胡 1 + 平胡 2 + 斷么 1 = 5
    expect(s.mult).toBe(5)
    expect(s.score).toBe(560)
  })
  it('流局只算分，台數 1', () => {
    const run = newRun('draw')
    const round = run.round!
    round.table = { melds: [meld('m7 m8 m9')], eye: null }
    const s = scoreHand(run, round, 'draw')
    expect(s.chips).toBe(10 + 24)
    expect(s.mult).toBe(1)
    expect(s.patterns).toEqual([])
  })
  it('神明：福星加分、玉皇 ×2、太上老君會成長', () => {
    const run = newRun('gods')
    run.gods = [
      { uid: 1, id: 'fu' },
      { uid: 2, id: 'laojun' },
      { uid: 3, id: 'yuhuang' },
    ]
    const round = run.round!
    round.table = { melds: ['m1 m2 m3', 'm4 m5 m6', 'm7 m8 m9', 'm2 m3 m4'].map(meld), eye: meld('m9 m9') }
    round.discardsThisHand = 1
    const s = scoreHand(run, round, 'hu')
    // 分：40 + 5 + 牌面 (6+15+24+9+18) = 117，福星 14 張 × 4 = 56 → 173
    expect(s.chips).toBe(173)
    // 台：1 + 胡 1 + 平胡 2 + 一條龍 3 + 清一色 8 = 15，老君 +3 = 18，玉皇 ×2 = 36
    expect(s.mult).toBe(36)
    expect(run.gods[1].n).toBe(1)
  })
  it('魔王：黑無常讓萬子不計分，但牌型照算', () => {
    const run = newRun('boss')
    const round = run.round!
    round.boss = 'heiwuchang'
    round.table = { melds: ['m1 m2 m3', 'm4 m5 m6', 'm7 m8 m9', 'm2 m3 m4'].map(meld), eye: meld('m9 m9') }
    const s = scoreHand(run, round, 'hu')
    expect(s.chips).toBe(45)
    expect(s.patterns.map((p) => p.id)).toContain('qingyise')
  })
  it('牌譜升級會加面子底分和牌型台數', () => {
    const run = newRun('levels')
    run.levels = { chow: 2, pinghu: 3 }
    const round = run.round!
    round.table = { melds: ['m2 m3 m4', 'm5 m6 m7', 'p2 p3 p4', 's6 s7 s8'].map(meld), eye: meld('p5 p5') }
    round.discardsThisHand = 1
    const s = scoreHand(run, round, 'hu')
    expect(s.chips).toBe(112 + 40)
    expect(s.mult).toBe(5 + 2)
  })
})

describe('一局牌的流程', () => {
  it('同一個種子開出一樣的牌', () => {
    expect(newRun('abc').round!.hand).toEqual(newRun('abc').round!.hand)
    expect(newRun('abc').round!.hand).not.toEqual(newRun('abd').round!.hand)
  })
  it('開局 12 張、換牌 4 次、目標 300', () => {
    const r = newRun('start')
    expect(r.round!.hand).toHaveLength(12)
    expect(r.round!.discardsLeft).toBe(4)
    expect(r.round!.target).toBe(300)
    expect(r.deck).toHaveLength(108)
  })
  it('出牌、補牌、胡牌、過關、領錢、進廟口', () => {
    let r = rig(newRun('flow'), 'm2 m3 m4 m5 m6 m7 p2 p3 p4 s6', 's7 s8 p5 p5 m9 m9 m9 m9 m9 m9')
    r = playMeld(r, ids(r, 'm2 m3 m4'))
    expect(r.round!.table.melds).toHaveLength(1)
    expect(r.round!.hand).toHaveLength(10)
    r = playMeld(r, ids(r, 'm5 m6 m7'))
    r = playMeld(r, ids(r, 'p2 p3 p4'))
    r = playMeld(r, ids(r, 's6 s7 s8'))
    expect(r.round!.status).toBe('play')
    r = playMeld(r, ids(r, 'p5 p5'))
    expect(r.round!.status).toBe('hu')
    // 沒換過牌：一氣呵成 +2
    expect(r.round!.score!.patterns.map((p) => p.id)).toContain('yiqi')
    r = resolveScore(r)
    expect(r.phase).toBe('cashout')
    expect(r.stats.hus).toBe(1)
    const coins = r.coins + r.cashout!.total
    r = collect(r)
    expect(r.phase).toBe('shop')
    expect(r.coins).toBe(coins)
    expect(r.shop!.slots).toHaveLength(3)
    r = nextRound(r)
    expect(r.phase).toBe('round')
    expect(r.round!.no).toBe(1)
    expect(r.round!.target).toBe(450)
  })
  it('胡了但沒達標：清桌、手牌保留、繼續打', () => {
    let r = rig(newRun('again'), 'm1 m2 m3 m1 m2 m3 p1 p2 p3 s1', 's2 s3 s9 s9 m5 m5 m5 m5 m5 m5 m5 m5')
    r.round!.target = 99999
    for (const k of ['m1 m2 m3', 'm1 m2 m3', 'p1 p2 p3', 's1 s2 s3', 's9 s9']) r = playMeld(r, ids(r, k))
    expect(r.round!.status).toBe('hu')
    const handBefore = r.round!.hand.map((t) => t.id)
    r = resolveScore(r)
    expect(r.phase).toBe('round')
    expect(r.round!.table.melds).toHaveLength(0)
    expect(r.round!.hands).toBe(1)
    expect(r.round!.hand.map((t) => t.id).slice(0, handBefore.length)).toEqual(handBefore)
  })
  it('換牌會用掉次數；觀音讓第一次免費', () => {
    let r = rig(newRun('disc'), 'm1 m4 m7 p1 p4 p7 s1 s4 s7 z1', 'm2 m2 m2 m2 m2 m2 m2 m2')
    r.gods = [{ uid: 1, id: 'guanyin' }]
    const start = r.round!.discardsLeft
    r = discard(r, ids(r, 'm1 m4'))
    expect(r.round!.discardsLeft).toBe(start)
    r = discard(r, ids(r, 'z1'))
    expect(r.round!.discardsLeft).toBe(start - 1)
    expect(r.round!.discardsUsed).toBe(2)
  })
  it('卡住就流局，沒達標遊戲結束', () => {
    let r = rig(newRun('stuck'), 'm1 m2 m3 m5 p1 p4 p7 s1 s4 s7', 'z1 z2 z3')
    r.round!.discardsLeft = 0
    r = playMeld(r, ids(r, 'm1 m2 m3'))
    expect(r.round!.status).toBe('draw')
    expect(r.round!.score!.score).toBe(10 + 6)
    r = resolveScore(r)
    expect(r.phase).toBe('gameover')
  })
  it('不合法的動作會丟 GameError', () => {
    const r = rig(newRun('bad'), 'm1 m1 m1 m1 m2 m3 p1 p4 p7 s1', 'z1 z2 z3')
    expect(() => playMeld(r, ids(r, 'm1 p1'))).toThrow(GameError)
    expect(() => discard(r, [])).toThrow(GameError)
    expect(() => discard(r, ids(r, 'm1 m1 m1 m1 m2 m3'))).toThrow(GameError)
  })
  it('花牌自動亮出並補牌', () => {
    let r = rig(newRun('flower'), 'm1 m2 m3 p1 p4 p7 s1 s4 s7 z1', 'f1 m9 m9 m9')
    r = playMeld(r, ids(r, 'm1 m2 m3'))
    expect(r.round!.flowers.map((t) => t.kind)).toEqual(['f1'])
    expect(r.round!.hand).toHaveLength(10)
    expect(r.round!.hand.some((t) => t.kind === 'f1')).toBe(false)
  })
})

describe('廟口與道具', () => {
  const inShop = () => {
    let r = rig(newRun('shop'), 'm2 m3 m4 m5 m6 m7 p2 p3 p4 s6', 's7 s8 p5 p5 m9 m9 m9 m9 m9 m9')
    for (const k of ['m2 m3 m4', 'm5 m6 m7', 'p2 p3 p4', 's6 s7 s8', 'p5 p5']) r = playMeld(r, ids(r, k))
    return collect(resolveScore(r))
  }
  it('買、賣、重抽', () => {
    let r = inShop()
    r.coins = 100
    r.shop!.slots[0] = { kind: 'god', id: 'yuelao', price: 4 }
    r = buy(r, 0)
    expect(r.gods.map((g) => g.id)).toEqual(['yuelao'])
    expect(r.coins).toBe(96)
    expect(() => buy(r, 0)).toThrow('賣完了')
    r = sellGod(r, r.gods[0].uid)
    expect(r.coins).toBe(98)
    r = reroll(r)
    expect(r.coins).toBe(95)
    expect(r.shop!.rerollCost).toBe(4)
  })
  it('分身符把先選的牌變成後選的牌，牌山也跟著改', () => {
    let r = rig(newRun('clone'), 'm1 m4 m7 p1 p4 p7 s1 s4 s7 z1', 'm2 m2 m2')
    r.items = [{ uid: 1, id: 'clone' }]
    const [a, b] = ids(r, 'm1 z1')
    r.deck.push(...r.round!.hand)
    r = useItem(r, 1, [a, b])
    expect(r.round!.hand.find((t) => t.id === a)!.kind).toBe('z1')
    expect(r.deck.find((t) => t.id === a)!.kind).toBe('z1')
    expect(r.items).toHaveLength(0)
  })
  it('萬化符只能選數牌', () => {
    const r = rig(newRun('tom'), 'm1 m4 m7 p1 p4 p7 s1 s4 s7 z1', 'm2')
    r.items = [{ uid: 1, id: 'to-m' }]
    expect(() => useItem(r, 1, ids(r, 'z1'))).toThrow('只能選數牌')
    const done = useItem(r, 1, ids(r, 'p4 s7'))
    expect(done.round!.hand.filter((t) => t.kind === 'm4' || t.kind === 'm7')).toHaveLength(4)
  })
  it('牌譜隨時可用', () => {
    let r = inShop()
    r.items = [{ uid: 1, id: 'lv-chow' }]
    r = useItem(r, 1, [])
    expect(r.levels.chow).toBe(2)
  })
})
