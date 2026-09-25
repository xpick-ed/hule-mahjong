import { describe, expect, it } from 'vitest'
import { decompose, isLigu, isWin, shanten, toCounts, waits, kindOf } from './analysis'

const c = (s: string) => toCounts(s.split(' ').map((kind) => ({ kind })))

describe('向聽數', () => {
  it('胡了是 −1', () => {
    // 5 組＋1 對，17 張
    expect(shanten(c('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s2 s2 z1 z1 z1 z5 z5'), 5)).toBe(-1)
  })
  it('聽牌是 0', () => {
    expect(shanten(c('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s2 s2 z1 z1 z1 z5'), 5)).toBe(0)
  })
  it('一向聽', () => {
    expect(shanten(c('m1 m2 m3 m4 m5 m6 p7 p8 p9 s2 s2 s2 z1 z1 z3 z5'), 5)).toBe(1)
  })
  it('亮了面子之後需要的組數變少', () => {
    // 亮了 3 組，手上 7 張：2 組＋1 張單吊
    expect(shanten(c('m1 m2 m3 p5 p5 p5 z7'), 2)).toBe(0)
    expect(shanten(c('m1 m2 m3 p5 p5 p5 z7 z7'), 2)).toBe(-1)
  })
  it('清一色的長牌也算得快又對', () => {
    const t0 = performance.now()
    expect(shanten(c('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m2 m4 m6'), 5)).toBe(0)
    expect(performance.now() - t0).toBeLessThan(200)
  })
  it('亂牌的向聽數很大', () => {
    expect(shanten(c('m1 m4 m7 p1 p4 p7 s1 s4 s7 z1 z2 z3 z4 z5 z6 z7'), 5)).toBeGreaterThanOrEqual(8)
  })
})

describe('胡牌與聽牌', () => {
  it('聽哪幾張', () => {
    // 手上 16 張：4 組＋ m4 m5 兩面聽 m3 m6
    const w = waits(c('m1 m1 m1 p2 p3 p4 s5 s6 s7 z1 z1 z1 z5 z5 m4 m5'), 5).map(kindOf)
    expect(w).toEqual(['m3', 'm6'])
  })
  it('嚦咕嚦咕：7 對＋1 刻', () => {
    const h = c('m1 m1 m3 m3 p2 p2 p5 p5 s7 s7 z1 z1 z5 z5 s9 s9 s9')
    expect(isLigu(h)).toBe(true)
    expect(isWin(h, 5)).toBe(true)
    expect(isWin(h, 4)).toBe(false)
  })
  it('拆牌列出所有拆法', () => {
    // 111 222 333 可以拆成三刻，也可以拆成三組順子
    const d = decompose(c('m1 m1 m1 m2 m2 m2 m3 m3 m3 p5 p5'), 3)
    expect(d.length).toBe(2)
    expect(d.every((x) => x.pair === 13)).toBe(true)
  })
})
