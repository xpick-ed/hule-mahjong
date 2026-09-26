// 算台幫手：家裡真的在打麻將時，點選自己的牌，算出幾台、該收多少錢；還沒胡的話看聽哪幾張。
// 用的是遊戲裡同一套算台規則（engine/scoring.ts）。

import { isWin, shanten, toCounts, waits, kindOf } from './engine/analysis'
import { dealerItems, scoreWin, type Meld, type TaiItem, type WinContext } from './engine/scoring'
import { idx, isFlower, isSuited, rank, type Kind, type Tile } from './engine/tiles'

/** 吃碰槓：吃記最小的那張 */
export interface MeldPick {
  type: 'chow' | 'pung' | 'kong' | 'ankan'
  kind: Kind
}

export interface CalcInput {
  /** 手上的牌（照加進來的順序；牌數夠了，最後一張就是胡的那張） */
  hand: Kind[]
  melds: MeldPick[]
  flowers: Kind[]
  tsumo: boolean
  /** 你的位置（門風）、這一圈（圈風）：0 東 1 南 2 西 3 北 */
  seatWind: number
  roundWind: number
  /** 誰是莊家：你、放槍的人、還是其他人 */
  dealer: 'me' | 'payer' | 'other'
  /** 莊家連了幾次 */
  streak: number
  lastTile: boolean
  afterKong: boolean
  robKong: boolean
  heaven: boolean
  earth: boolean
  base: number
  perTai: number
}

export interface Pay {
  /** 放槍的人付多少（胡別人的） */
  payer?: number
  /** 自摸：莊家付多少（你不是莊家時莊家付比較多）、其他人各付多少 */
  dealer?: number
  each?: number
  total: number
}

export interface WaitInfo {
  kind: Kind
  /** 外面還剩幾張（只扣掉你自己看得到的） */
  left: number
  ron: number
  tsumo: number
}

export type CalcResult =
  | { t: 'empty' }
  | { t: 'short'; need: number }
  | { t: 'notReady'; shanten: number }
  | { t: 'waiting'; waits: WaitInfo[] }
  | { t: 'notWin'; shanten: number }
  | { t: 'win'; items: TaiItem[]; dealer: TaiItem[]; tai: number; pay: Pay }

/** 這一組佔幾張（槓 4 張） */
export const meldSize = (m: MeldPick) => (m.type === 'chow' || m.type === 'pung' ? 3 : 4)

export function meldKinds(m: MeldPick): Kind[] {
  if (m.type === 'chow') return [0, 1, 2].map((d) => `${m.kind[0]}${rank(m.kind) + d}`)
  return Array.from({ length: meldSize(m) }, () => m.kind)
}

/** 手牌要幾張才算完整（含胡的那張）：沒吃碰是 17 張，每一組少 3 張 */
export const handNeed = (melds: readonly MeldPick[]) => 17 - 3 * melds.length

/** 每一種牌已經用了幾張（手牌＋吃碰槓） */
export function used(input: Pick<CalcInput, 'hand' | 'melds'>): Record<Kind, number> {
  const c: Record<Kind, number> = {}
  for (const k of [...input.hand, ...input.melds.flatMap(meldKinds)]) c[k] = (c[k] ?? 0) + 1
  return c
}

/** 這一組能不能加（牌不能超過 4 張、吃只能吃 1–7 開頭的數牌） */
export function canAddMeld(input: CalcInput, m: MeldPick): boolean {
  if (input.melds.length >= 5 || isFlower(m.kind)) return false
  if (m.type === 'chow' && (!isSuited(m.kind) || rank(m.kind) > 7)) return false
  if (m.type !== 'chow' && !isSuited(m.kind) && m.kind[0] !== 'z') return false
  const c = used(input)
  for (const k of meldKinds(m)) c[k] = (c[k] ?? 0) + 1
  return Object.values(c).every((n) => n <= 4) && input.hand.length <= handNeed([...input.melds, m])
}

export function canAddTile(input: CalcInput, k: Kind): boolean {
  if (isFlower(k)) return !input.flowers.includes(k)
  return (used(input)[k] ?? 0) < 4 && input.hand.length < handNeed(input.melds)
}

const tiles = (kinds: readonly Kind[], from = 0): Tile[] => kinds.map((kind, i) => ({ id: from + i, kind }))

function toMelds(ms: readonly MeldPick[]): Meld[] {
  let id = 1000
  return ms.map((m) => {
    const ts = tiles(meldKinds(m), id)
    id += 10
    return { type: m.type === 'ankan' ? 'kong' : m.type, tiles: ts, ...(m.type === 'ankan' ? { concealed: true } : {}) }
  })
}

function score(input: CalcInput, hand: readonly Kind[], win: Kind, tsumo: boolean) {
  const ctx: WinContext = {
    hand: tiles(hand),
    melds: toMelds(input.melds),
    flowers: tiles(input.flowers, 900),
    winTile: win,
    tsumo,
    seatWind: input.seatWind,
    roundWind: input.roundWind,
    lastTile: input.lastTile,
    afterKong: input.afterKong && tsumo,
    robKong: input.robKong && !tsumo,
    heaven: input.heaven,
    earth: input.earth,
    eightFlowers: input.flowers.length === 8,
  }
  return scoreWin(ctx)
}

/** 誰付多少：底＋台數×每台；跟莊家有關的那筆加莊家台 */
export function payOf(input: CalcInput, tai: number): { dealer: TaiItem[]; pay: Pay } {
  const di = dealerItems(input.streak)
  const dt = di.reduce((s, x) => s + x.tai, 0)
  const amount = (t: number) => input.base + t * input.perTai
  if (!input.tsumo) {
    const involved = input.dealer !== 'other'
    const payer = amount(tai + (involved ? dt : 0))
    return { dealer: involved ? di : [], pay: { payer, total: payer } }
  }
  if (input.dealer === 'me') {
    const each = amount(tai + dt)
    return { dealer: di, pay: { each, total: each * 3 } }
  }
  // 你自摸、別人當莊：莊家那一家多付莊家台
  const dealer = amount(tai + dt)
  const each = amount(tai)
  return { dealer: di, pay: { dealer, each, total: dealer + each * 2 } }
}

export function calculate(input: CalcInput): CalcResult {
  const need = handNeed(input.melds)
  const n = 5 - input.melds.length
  if (!input.hand.length && !input.melds.length) return { t: 'empty' }
  if (input.hand.length < need - 1) return { t: 'short', need: need - 1 - input.hand.length }
  const c = toCounts(tiles(input.hand))
  if (input.hand.length === need - 1) {
    const ws = waits(c, n)
    if (!ws.length) return { t: 'notReady', shanten: shanten(c, n) }
    const u = used(input)
    return {
      t: 'waiting',
      waits: ws.map((i) => {
        const k = kindOf(i)
        const h = [...input.hand, k]
        return { kind: k, left: Math.max(0, 4 - (u[k] ?? 0)), ron: score(input, h, k, false).total, tsumo: score(input, h, k, true).total }
      }),
    }
  }
  if (!isWin(c, n)) return { t: 'notWin', shanten: Math.max(1, shanten(c, n)) }
  const win = input.hand[input.hand.length - 1]
  const s = score(input, input.hand, win, input.tsumo)
  const { dealer, pay } = payOf(input, s.total)
  return { t: 'win', items: s.items, dealer, tai: s.total, pay }
}

/** 顯示用：手牌排好（胡的那張另外放） */
export function sortKinds(ks: readonly Kind[]): Kind[] {
  return [...ks].sort((a, b) => idx(a) - idx(b))
}
