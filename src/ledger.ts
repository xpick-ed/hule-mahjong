// 家庭牌局記帳：家裡真的在打麻將時，一手一手記誰胡、誰放槍、幾台，自動算每個人輸贏，
// 打完算出「誰該給誰多少」（最少轉幾筆就結清）。莊家台照遊戲的規則：莊家 1 台＋連 n 拉 n。

import { dealerItems } from './engine/scoring'

export interface LedgerHand {
  /** 胡的人；null = 流局 */
  winner: number | null
  /** 放槍的人；null = 自摸 */
  from: number | null
  /** 台數（不含莊家台） */
  tai: number
  /** 這一手的莊家、連幾次 */
  dealer: number
  streak: number
  deltas: number[]
}

export interface Ledger {
  id: string
  /** 開始的日期 YYYY-MM-DD */
  date: string
  /** 照座位順序：第 2 個是第 1 個的下家 */
  names: string[]
  base: number
  perTai: number
  /** 現在的莊家、連幾次 */
  dealer: number
  streak: number
  hands: LedgerHand[]
}

export interface Transfer {
  from: number
  to: number
  amount: number
}

const dealerTai = (streak: number) => dealerItems(streak).reduce((s, x) => s + x.tai, 0)

export function newLedger(names: string[], base: number, perTai: number, dealer: number, date: string): Ledger {
  return { id: `${date}-${Math.random().toString(36).slice(2, 8)}`, date, names: [...names], base, perTai, dealer, streak: 0, hands: [] }
}

/** 這一手每個人輸贏多少：底＋台數×每台，跟莊家有關的那筆加莊家台 */
export function handDeltas(l: Pick<Ledger, 'base' | 'perTai' | 'dealer' | 'streak'>, winner: number | null, from: number | null, tai: number): number[] {
  const d = [0, 0, 0, 0]
  if (winner === null) return d
  const dt = dealerTai(l.streak)
  const payers = from === null ? [0, 1, 2, 3].filter((s) => s !== winner) : [from]
  for (const p of payers) {
    const involved = winner === l.dealer || p === l.dealer
    const amount = l.base + (tai + (involved ? dt : 0)) * l.perTai
    d[p] -= amount
    d[winner] += amount
  }
  return d
}

/** 記一手（winner = null 是流局）；莊家胡或流局就連莊，不然換下一家當莊 */
export function addHand(l: Ledger, r: { winner: number | null; from: number | null; tai: number }): Ledger {
  const hand: LedgerHand = { ...r, dealer: l.dealer, streak: l.streak, deltas: handDeltas(l, r.winner, r.from, r.tai) }
  const keep = r.winner === null || r.winner === l.dealer
  return { ...l, hands: [...l.hands, hand], dealer: keep ? l.dealer : (l.dealer + 1) % 4, streak: keep ? l.streak + 1 : 0 }
}

/** 刪掉最後一手（記錯了），莊家也回到那一手之前 */
export function undoHand(l: Ledger): Ledger {
  const last = l.hands[l.hands.length - 1]
  if (!last) return l
  return { ...l, hands: l.hands.slice(0, -1), dealer: last.dealer, streak: last.streak }
}

export function totals(l: Ledger): number[] {
  return l.hands.reduce((t, h) => t.map((x, i) => x + h.deltas[i]), [0, 0, 0, 0])
}

/** 結帳：輸的人付給贏的人，每次都讓輸最多的付給贏最多的，筆數最少 */
export function settleUp(t: readonly number[]): Transfer[] {
  const owe = t.map((v, i) => ({ i, v: -v })).filter((x) => x.v > 0)
  const get = t.map((v, i) => ({ i, v })).filter((x) => x.v > 0)
  const out: Transfer[] = []
  while (owe.length && get.length) {
    owe.sort((a, b) => b.v - a.v)
    get.sort((a, b) => b.v - a.v)
    const a = owe[0]
    const b = get[0]
    const amount = Math.min(a.v, b.v)
    out.push({ from: a.i, to: b.i, amount })
    a.v -= amount
    b.v -= amount
    if (!a.v) owe.shift()
    if (!b.v) get.shift()
  }
  return out
}

/** 趣味稱號：自摸王、放槍王、最大一手、連莊王（至少要有一次才給） */
export function titles(l: Ledger): { title: string; who: number; note: string }[] {
  const count = (f: (h: LedgerHand) => number | null) => {
    const c = [0, 0, 0, 0]
    for (const h of l.hands) {
      const s = f(h)
      if (s !== null) c[s]++
    }
    return c
  }
  const top = (c: number[]) => {
    const max = Math.max(...c)
    const who = c.indexOf(max)
    return max > 0 && c.filter((x) => x === max).length === 1 ? who : null
  }
  const out: { title: string; who: number; note: string }[] = []
  const tsumo = count((h) => (h.winner !== null && h.from === null ? h.winner : null))
  const t = top(tsumo)
  if (t !== null) out.push({ title: '自摸王', who: t, note: `自摸 ${tsumo[t]} 次` })
  const dealIn = count((h) => h.from)
  const d = top(dealIn)
  if (d !== null) out.push({ title: '放槍王', who: d, note: `放槍 ${dealIn[d]} 次` })
  const best = l.hands.filter((h) => h.winner !== null).sort((a, b) => b.tai - a.tai)[0]
  if (best && best.tai > 0) out.push({ title: '最大一手', who: best.winner!, note: `${best.tai} 台${best.from === null ? '自摸' : ''}` })
  const streak = l.hands.reduce((m, h) => (h.streak > m.n ? { n: h.streak, who: h.dealer } : m), { n: 0, who: -1 })
  if (streak.n >= 2) out.push({ title: '連莊王', who: streak.who, note: `連 ${streak.n} 莊` })
  return out
}

const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}`

/** 分享到 LINE 的文字 */
export function ledgerText(l: Ledger, site: string): string {
  const t = totals(l)
  const order = [0, 1, 2, 3].sort((a, b) => t[b] - t[a])
  const lines = [`胡了！家庭牌局 ${l.date.slice(5).replace('-', '/')}（底 ${l.base}／台 ${l.perTai}，${l.hands.length} 手）`]
  order.forEach((s, k) => lines.push(`${k + 1}. ${l.names[s]} ${money(t[s])}`))
  const tr = settleUp(t)
  if (tr.length) lines.push('', '結帳：', ...tr.map((x) => `${l.names[x.from]} → ${l.names[x.to]} ${x.amount.toLocaleString('en-US')}`))
  const ts = titles(l)
  if (ts.length) lines.push('', ts.map((x) => `${x.title}：${l.names[x.who]}（${x.note}）`).join('\n'))
  lines.push('', site)
  return lines.join('\n')
}
