import { describe, expect, it } from 'vitest'
import { evaluate, makeWaitPuzzle, waitsOfKinds } from './coach'

const hand = (s: string) => s.split(' ').map((kind, id) => ({ id, kind }))

describe('教練：打哪張最好', () => {
  it('孤張的字牌最該打，打完聽一、四、七筒', () => {
    // 四組完整＋二三筒＋對子，多一張孤張的西
    const ev = evaluate(hand('m1 m2 m3 p4 p5 p6 s7 s8 s9 m7 m8 m9 p2 p3 s5 s5 z3'))
    expect(ev[0].kind).toBe('z3')
    expect(ev[0].sh).toBe(0)
    // 二三筒＋四五六筒可以拆成三四五、二三四…，所以一、四、七筒都胡
    expect(ev[0].good).toEqual(['p1', 'p4', 'p7'])
    expect(ev[0].uke).toBe(4 + 3 + 4)
  })
  it('先求聽牌，再比進張', () => {
    const ev = evaluate(hand('m1 m2 m3 m4 m5 m6 s1 s2 s3 z1 z1 z1 p3 p4 p9 s9 s9'))
    expect(ev[0].kind).toBe('p9')
    expect(ev[0].sh).toBe(0)
    expect(ev.find((x) => x.kind === 'p3')!.sh).toBe(1)
  })
  it('同樣聽牌，兩面比嵌張好', () => {
    // 打六筒留三四筒（聽二、五筒 8 張）；打三筒留四六筒（只聽五筒 4 張）
    const ev = evaluate(hand('m1 m2 m3 m4 m5 m6 s1 s2 s3 z1 z1 z1 p3 p4 p6 s9 s9'))
    expect(ev[0].kind).toBe('p6')
    expect(ev[0].uke).toBe(8)
    expect(ev.find((x) => x.kind === 'p3')!.uke).toBe(4)
  })
})

describe('聽哪些牌', () => {
  const w = (s: string) => waitsOfKinds(s.split(' '))
  it('常見的多面聽', () => {
    expect(w('m1 m2 m3 m4')).toEqual(['m1', 'm4'])
    expect(w('p1 p1 p1 p2')).toEqual(['p2', 'p3'])
    expect(w('p2 p2 p2 p3')).toEqual(['p1', 'p3', 'p4'])
    expect(w('m5 m5 p7 p7')).toEqual(['m5', 'p7'])
    expect(w('m3 m4 m5 m6 m7 z1 z1')).toEqual(['m2', 'm5', 'm8'])
  })
  it('九蓮寶燈聽一到九', () => {
    expect(w('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9')).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'])
  })
  it('練習題：同一個種子出一樣的題目，而且真的聽牌', () => {
    const a = makeWaitPuzzle(42, 10)
    expect(makeWaitPuzzle(42, 10)).toEqual(a)
    expect(a.kinds).toHaveLength(10)
    expect(a.waits.length).toBeGreaterThanOrEqual(2)
    expect(new Set(a.kinds.map((k) => k[0])).size).toBe(1)
  })
})
