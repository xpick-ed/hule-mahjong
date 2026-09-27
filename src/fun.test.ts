// 趣味功能：閃電局、擲骰子、宿敵、我的造型、算台幫手、上帝視角回放、家庭牌局記帳。

import { describe, expect, it } from 'vitest'
import { normalizeCode, SAVE_RE, showCode } from './backup-core'
import { calculate, canAddMeld, canAddTile, type CalcInput } from './calc'
import { cleanLook, DEFAULT_LOOK } from './engine/looks'
import { addHand, ledgerText, newLedger, settleUp, titles, totals, undoHand } from './ledger'
import * as M from './engine/match'
import * as P from './progress'
import { costOf, tryOn, WARDROBE_ITEM } from './wardrobe'

describe('閃電局', () => {
  /** 讓這一局結束：座位 winner 胡（莊家沒胡就換莊） */
  const finishHand = (m: M.MatchState, winner: number): M.MatchState => {
    const r = structuredClone(m)
    r.phase = 'handEnd'
    r.result = { win: { seat: winner, from: null } as never, dealerItems: null, payments: [], deltas: [0, 0, 0, 0], dealer: r.dealer, streak: r.streak }
    return r
  }
  it('只打 4 局：莊家一直連莊也一樣在第 4 局結束', () => {
    let m = M.newMatch('blitz', 0, { blitz: true })
    expect(m.blitz).toBe(true)
    for (let k = 1; k < M.BLITZ.hands; k++) {
      m = finishHand(m, m.dealer)
      expect(M.matchOverAfter(m)).toBe(false)
      m = M.nextHand(m)
      expect(m.phase).toBe('play')
    }
    expect(m.handNo).toBe(M.BLITZ.hands)
    m = finishHand(m, m.dealer)
    expect(M.matchOverAfter(m)).toBe(true)
    expect(M.nextHand(m).phase).toBe('end')
  })
  it('一般的一場不受影響：換滿四次莊才結束', () => {
    let m = M.newMatch('full', 0)
    for (let k = 0; k < 3; k++) m = M.nextHand(finishHand(m, (m.dealer + 1) % 4))
    expect(m.phase).toBe('play')
    m = finishHand(m, (m.dealer + 1) % 4)
    expect(M.matchOverAfter(m)).toBe(true)
  })
  it('金幣、段位減半；拿第一不算星星', () => {
    const end = (blitz: boolean) => {
      const m = M.newMatch('b-end', 0, { blitz })
      m.phase = 'end'
      m.points = [40000, 30000, 20000, 10000]
      m.history = [{ winner: 0, from: 1, tai: 3, hand: 1, items: ['門清'] }]
      return m
    }
    const full = P.matchRewards(end(false))
    const quick = P.matchRewards(end(true))
    expect(quick.coins).toBe(Math.round(full.coins / 2))
    expect(quick.rankDelta).toBe(Math.round(full.rankDelta / 2))
    expect(P.recordStars(P.defaultProgress, end(true)).fresh).toHaveLength(0)
    expect(P.matchMetrics(end(true))).toEqual({ first: 1 })
  })
})

describe('擲骰子', () => {
  it('同一局的骰子固定（重新整理也一樣），三顆都是 1–6', () => {
    const m = M.newMatch('dice', 0)
    const a = M.diceOf(m)
    expect(M.diceOf(m)).toEqual(a)
    expect(a).toHaveLength(3)
    for (const d of a) expect(d >= 1 && d <= 6).toBe(true)
  })
  it('從莊家開始逆時針數：5 點莊家自己、6 點下家、7 點對家、8 點上家', () => {
    expect(M.openSeat(0, 5)).toBe(0)
    expect(M.openSeat(0, 6)).toBe(1)
    expect(M.openSeat(0, 7)).toBe(2)
    expect(M.openSeat(0, 8)).toBe(3)
    expect(M.openSeat(3, 3)).toBe(1)
  })
})

describe('宿敵', () => {
  const hand = (winner: number, from: number | null) => {
    const m = M.newMatch('rival', 1)
    m.result = { win: { seat: winner, from } as never, dealerItems: null, payments: [], deltas: [0, 0, 0, 0], dealer: 0, streak: 0 }
    return m
  }
  it('放槍給同一個人兩次變宿敵，第三次是「又放槍」', () => {
    const m = hand(2, 0)
    const id = m.chars[2]
    let r = P.recordRivals(P.defaultProgress, m)
    expect(r.events).toHaveLength(0)
    expect(r.p.grudge[id]).toBe(1)
    r = P.recordRivals(r.p, m)
    expect(r.events).toEqual([{ kind: 'new', seat: 2, id, n: 2, coins: 0 }])
    expect(P.isRival(r.p, id)).toBe(true)
    r = P.recordRivals(r.p, m)
    expect(r.events[0]).toMatchObject({ kind: 'again', n: 3 })
  })
  it('宿敵放槍給你（或你自摸）：報仇成功，給金幣、解鎖成就，一筆勾銷', () => {
    const m = hand(2, 0)
    const id = m.chars[2]
    const p = { ...P.defaultProgress, grudge: { [id]: 3 } }
    const r = P.recordRivals(p, hand(0, 2))
    expect(r.events).toEqual([{ kind: 'revenge', seat: 2, id, n: 3, coins: 300 }])
    expect(r.p.coins).toBe(300)
    expect(r.p.grudge[id]).toBeUndefined()
    expect(r.p.revenges).toBe(1)
    expect(r.unlocked.map((a) => a.id)).toEqual(['revenge'])
    // 自摸：三家都付，也算
    expect(P.recordRivals(p, hand(0, null)).events[0].kind).toBe('revenge')
    // 只放過一次的：討回來就好，不算報仇
    const once = P.recordRivals({ ...P.defaultProgress, grudge: { [id]: 1 } }, hand(0, 2))
    expect(once.events).toHaveLength(0)
    expect(once.p.grudge[id]).toBeUndefined()
  })
  it('引導局、連線不算', () => {
    const m = hand(2, 0)
    m.tutorial = true
    expect(P.recordRivals(P.defaultProgress, m).p).toBe(P.defaultProgress)
  })
})

describe('我的造型', () => {
  it('朋友傳來的造型：不認得的東西拿掉、顏色不對用預設、同一個位置只留一樣', () => {
    const look = cleanLook({ hair: 'bun', skin: 'red', shirt: '#8b5cf6', extras: ['helmet', 'crown', 'laser', 'glasses', 'sunglasses'], bg: '<script>' })
    expect(look).toEqual({ ...DEFAULT_LOOK, hair: 'bun', shirt: '#8b5cf6', extras: ['helmet', 'glasses'] })
    expect(cleanLook({ hair: 'mohawk' })).toBeNull()
    expect(cleanLook('x')).toBeNull()
  })
  it('試穿：帽子換帽子；再點一次拿掉', () => {
    let look = tryOn(DEFAULT_LOOK, WARDROBE_ITEM['extra:cap'])
    look = tryOn(look, WARDROBE_ITEM['extra:douli'])
    expect(look.extras).toEqual(['douli'])
    look = tryOn(look, WARDROBE_ITEM['extra:glasses'])
    look = tryOn(look, WARDROBE_ITEM['extra:douli'])
    expect(look.extras).toEqual(['glasses'])
  })
  it('要花多少錢：買過的、免費的不算；皇冠要拿全國冠軍', () => {
    const look = { ...DEFAULT_LOOK, hair: 'perm' as const, extras: ['helmet' as const, 'glasses' as const] }
    expect(costOf(P.defaultProgress, look).coins).toBe(150 + 200)
    expect(costOf({ ...P.defaultProgress, wardrobe: ['hair:perm'] }, look).coins).toBe(200)
    const crown = { ...DEFAULT_LOOK, extras: ['crown' as const] }
    expect(costOf(P.defaultProgress, crown).locked).toHaveLength(1)
    expect(costOf({ ...P.defaultProgress, ach: { tourneyChamp: '2026-09-26' } }, crown).locked).toHaveLength(0)
  })
})

describe('算台幫手', () => {
  const base: CalcInput = {
    hand: [],
    melds: [],
    flowers: [],
    tsumo: false,
    seatWind: 0,
    roundWind: 0,
    dealer: 'other',
    streak: 0,
    lastTile: false,
    afterKong: false,
    robKong: false,
    heaven: false,
    earth: false,
    base: 100,
    perTai: 20,
  }
  const H = 'm1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s3 s4 z1 z1 z1 z5'.split(' ')
  it('差一張：列出聽哪幾張、胡了幾台', () => {
    const r = calculate({ ...base, hand: H })
    expect(r.t).toBe('waiting')
    if (r.t !== 'waiting') return
    expect(r.waits.map((w) => w.kind)).toEqual(['z5'])
    // 門清、圈風、門風、獨聽；自摸換成門清自摸
    expect(r.waits[0]).toMatchObject({ ron: 4, tsumo: 6, left: 3 })
  })
  it('胡別人的：台數、放槍的付多少；放槍的是莊家要加莊家台', () => {
    const r = calculate({ ...base, hand: [...H, 'z5'], flowers: ['f1'] })
    expect(r.t).toBe('win')
    if (r.t !== 'win') return
    expect(r.tai).toBe(5)
    expect(r.pay).toEqual({ payer: 200, total: 200 })
    const d = calculate({ ...base, hand: [...H, 'z5'], flowers: ['f1'], dealer: 'payer', streak: 1 })
    if (d.t !== 'win') throw new Error()
    // 莊家 1 台＋連 1 拉 1 共 3 台
    expect(d.pay.payer).toBe(100 + (5 + 3) * 20)
  })
  it('自摸：別人當莊的話莊家多付莊家台', () => {
    const r = calculate({ ...base, hand: [...H, 'z5'], tsumo: true, streak: 2 })
    if (r.t !== 'win') throw new Error()
    expect(r.tai).toBe(6)
    expect(r.pay).toEqual({ dealer: 100 + (6 + 5) * 20, each: 100 + 6 * 20, total: 320 + 220 * 2 })
    const me = calculate({ ...base, hand: [...H, 'z5'], tsumo: true, dealer: 'me' })
    if (me.t !== 'win') throw new Error()
    expect(me.pay).toEqual({ each: 100 + 7 * 20, total: 240 * 3 })
  })
  it('吃碰槓：一組少 3 張手牌；混一色、紅中照算', () => {
    const x: CalcInput = { ...base, melds: [{ type: 'pung', kind: 'z5' }, { type: 'chow', kind: 'm1' }], hand: 'm4 m5 m6 m7 m8 m9 m2 m3 m4 z1 z1'.split(' ') }
    const r = calculate(x)
    if (r.t !== 'win') throw new Error(r.t)
    expect(r.items.map((i) => i.name).sort()).toEqual(['混一色', '獨聽', '紅中'].sort())
    expect(canAddTile(x, 'm1')).toBe(false)
  })
  it('不能亂加：吃只能 1–7 開頭的數牌、一種牌最多 4 張', () => {
    expect(canAddMeld(base, { type: 'chow', kind: 'm8' })).toBe(false)
    expect(canAddMeld(base, { type: 'chow', kind: 'z1' })).toBe(false)
    expect(canAddMeld({ ...base, hand: ['z1', 'z1'] }, { type: 'kong', kind: 'z1' })).toBe(false)
    expect(canAddTile({ ...base, hand: ['m1', 'm1', 'm1', 'm1'] }, 'm1')).toBe(false)
  })
  it('牌數夠了但不是胡的牌型', () => {
    const r = calculate({ ...base, hand: [...H.slice(0, 15), 'p1', 's9'] })
    expect(r.t).toBe('notWin')
  })
})

describe('上帝視角回放', () => {
  it('從開局的樣子照你的動作重打，結果跟實際一模一樣（用了換牌也一樣）', () => {
    for (const seed of ['rp-1', 'rp-2', 'rp-3']) {
      let m = M.newMatch(seed, 2)
      const start = structuredClone(m)
      const log: M.Act[] = []
      let swapped = false
      for (let g = 0; g < 3000 && m.phase === 'play'; g++) {
        if (M.waitingForYou(m)) {
          if (!swapped && m.hand.phase === 'discard') {
            swapped = true
            const id = m.hand.seats[0].hand[0].id
            log.push([m.ticks ?? 0, 's', 'swap', id])
            m = M.useSkill(m, 'swap', id)
            continue
          }
          const mv = M.autoMove(m, 0, { rng: 7 })!
          log.push([m.ticks ?? 0, ...mv] as M.Act)
          m = M.act(m, 0, mv)
        } else m = M.step(m)
      }
      expect(m.phase).toBe('handEnd')
      const { frames, ok } = M.replayHand(start, log)
      expect(ok).toBe(true)
      expect(frames.length).toBeGreaterThan(10)
      expect(frames[frames.length - 1].result!.deltas).toEqual(m.result!.deltas)
      expect(frames[frames.length - 1].hand.seats.map((s) => s.discards.length)).toEqual(m.hand.seats.map((s) => s.discards.length))
    }
  })
  it('紀錄對不上（動作做不了）：停下來，回報不完整', () => {
    const start = M.newMatch('rp-bad', 0)
    const { ok } = M.replayHand(start, [[0, 'd', -123]])
    expect(ok).toBe(false)
  })
})

describe('家庭牌局記帳', () => {
  const L0 = newLedger(['小明', '舅媽', '姨丈', '阿嬤'], 100, 20, 0, '2026-09-26')
  it('莊家自摸：三家都付莊家台；莊家胡就連莊', () => {
    const l = addHand(L0, { winner: 0, from: null, tai: 3 })
    expect(l.hands[0].deltas).toEqual([540, -180, -180, -180])
    expect([l.dealer, l.streak]).toEqual([0, 1])
  })
  it('閒家胡閒家：沒有莊家台，換下一家當莊；流局連莊', () => {
    let l = addHand(L0, { winner: 1, from: 3, tai: 5 })
    expect(l.hands[0].deltas).toEqual([0, 200, 0, -200])
    expect([l.dealer, l.streak]).toEqual([1, 0])
    l = addHand(l, { winner: null, from: null, tai: 0 })
    expect([l.dealer, l.streak]).toEqual([1, 1])
    // 放槍給連 1 的莊家：莊家 1 台＋連 1 拉 1
    l = addHand(l, { winner: 1, from: 2, tai: 2 })
    expect(l.hands[2].deltas).toEqual([0, 100 + (2 + 3) * 20, -(100 + (2 + 3) * 20), 0])
    expect(totals(l).reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('刪掉上一手：莊家也回到之前', () => {
    const l = addHand(addHand(L0, { winner: 2, from: 0, tai: 1 }), { winner: 3, from: null, tai: 2 })
    const u = undoHand(l)
    expect(u.hands).toHaveLength(1)
    expect([u.dealer, u.streak]).toEqual([1, 0])
  })
  it('結帳：輸的付給贏的，金額對得起來、筆數最少', () => {
    const t = [400, 20, -180, -240]
    const tr = settleUp(t)
    expect(tr.length).toBeLessThanOrEqual(3)
    const net = [0, 0, 0, 0]
    for (const x of tr) {
      net[x.from] -= x.amount
      net[x.to] += x.amount
    }
    expect(net).toEqual(t)
  })
  it('稱號：自摸王、放槍王、最大一手', () => {
    let l = addHand(L0, { winner: 0, from: null, tai: 3 })
    l = addHand(l, { winner: 2, from: 1, tai: 8 })
    l = addHand(l, { winner: 3, from: 1, tai: 1 })
    const ts = titles(l).map((x) => `${x.title}:${l.names[x.who]}`)
    expect(ts).toEqual(['自摸王:小明', '放槍王:舅媽', '最大一手:姨丈'])
    expect(ledgerText(l, 'https://x')).toContain('結帳')
  })
})

describe('存檔轉移碼', () => {
  it('轉移碼：大小寫、橫線、空白都可以；顯示成 ABCD-EFGH', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345')
    expect(SAVE_RE.test(normalizeCode('abcd-2345'))).toBe(true)
    // 0、O、1、I 容易看錯，不會出現在轉移碼裡
    expect(SAVE_RE.test('ABCD0O1I')).toBe(false)
    expect(showCode('ABCD2345')).toBe('ABCD-2345')
  })
})
