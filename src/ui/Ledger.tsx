// 家庭牌局記帳（算台幫手的第二頁）：開一場、每一手記誰胡／誰放槍／幾台，自動算輸贏和莊家；
// 打完結帳：誰給誰多少、趣味稱號、分享文字或戰報圖。記帳存在這台手機（重新整理也還在）。

import { useEffect, useState } from 'react'
import { addHand, handDeltas, ledgerText, newLedger, settleUp, titles, totals, undoHand, type Ledger } from '../ledger'
import { makeLedgerCard } from '../ledgerCard'
import { share } from '../daily'
import { today } from '../progress'
import { myName, useUI } from '../store'
import { cls, fmt, Seg } from './bits'

const KEY = 'hule.ledger.v1'

/** 常見的底／台 */
const STAKES: [number, number][] = [
  [50, 20],
  [100, 20],
  [100, 50],
  [300, 100],
]

const SEATS = ['你', '下家', '對家', '上家']

interface PastGame {
  date: string
  names: string[]
  totals: number[]
  hands: number
}

interface Saved {
  current: Ledger | null
  past: PastGame[]
  names: string[]
  stake: number
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    if (s && Array.isArray(s.names)) return { current: s.current ?? null, past: s.past ?? [], names: s.names, stake: s.stake ?? 1 }
  } catch {
    // 存檔壞了就重來
  }
  return { current: null, past: [], names: [myName(), '', '', ''], stake: 1 }
}

export interface Book {
  saved: Saved
  update: (f: (s: Saved) => Saved) => void
}

/** 記帳的存檔（整個算台記帳畫面共用） */
export function useBook(): Book {
  const [saved, setSaved] = useState<Saved>(load)
  const update = (f: (s: Saved) => Saved) =>
    setSaved((s) => {
      const n = f(s)
      try {
        localStorage.setItem(KEY, JSON.stringify(n))
      } catch {
        // 無痕模式存不了
      }
      return n
    })
  return { saved, update }
}

/** 從算台那一頁帶過來的：台數、是不是自摸 */
export interface Prefill {
  tai: number
  tsumo: boolean
  key: number
}

const money = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')

export function LedgerPane({ book, prefill }: { book: Book; prefill: Prefill | null }) {
  const l = book.saved.current
  const [settle, setSettle] = useState(false)
  if (!l) return <Setup book={book} />
  if (settle) return <Settle l={l} book={book} onBack={() => setSettle(false)} />
  return <Board l={l} book={book} prefill={prefill} onSettle={() => setSettle(true)} />
}

/** 開新的一場：四個人的名字（照座位）、底／台、誰先當莊 */
function Setup({ book }: { book: Book }) {
  const { saved, update } = book
  const [names, setNames] = useState(saved.names)
  const [stake, setStake] = useState(saved.stake)
  const [dealer, setDealer] = useState(0)
  const shown = names.map((n, i) => n.trim() || (i === 0 ? myName() : `${SEATS[i]}`))
  const start = () =>
    update((s) => ({ ...s, names, stake, current: newLedger(shown, STAKES[stake][0], STAKES[stake][1], dealer, today()) }))
  return (
    <div className="lg-setup">
      <div className="lg-setup-main">
        <p className="pm-small">名字照座位填（從你開始，逆時針：下家、對家、上家），莊家會自己輪。記帳存在這支手機，關掉也還在。</p>
        <div className="lg-names">
          {SEATS.map((seat, i) => (
            <label key={seat}>
              <span>{seat}</span>
              <input
                className="text-input"
                value={names[i]}
                maxLength={6}
                placeholder={i === 0 ? myName() : seat}
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                aria-label={`${seat}的名字`}
              />
            </label>
          ))}
        </div>
        <Seg label="底／台" value={stake} options={STAKES.map(([b, t]) => `${b}/${t}`)} onChange={setStake} />
        <Seg label="誰先當莊" value={dealer} options={shown} onChange={setDealer} />
        <button type="button" className="btn primary lg-start" onClick={start}>
          開始記帳
        </button>
      </div>
      {saved.past.length > 0 && (
        <div className="lg-past">
          <h4>之前的牌局</h4>
          <ul>
            {saved.past.map((g, k) => {
              const best = g.totals.indexOf(Math.max(...g.totals))
              return (
                <li key={k}>
                  <small>
                    {g.date.slice(5).replace('-', '/')}・{g.hands} 手
                  </small>
                  <span>
                    {g.names.map((n, i) => (
                      <em key={i} className={cls(i === best && 'best', g.totals[i] < 0 && 'down')}>
                        {n} {money(g.totals[i])}
                      </em>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 打牌中：上面四個人的輸贏，左邊記這一手，右邊是記過的每一手 */
function Board({ l, book, prefill, onSettle }: { l: Ledger; book: Book; prefill: Prefill | null; onSettle: () => void }) {
  const showToast = useUI((s) => s.showToast)
  const [winner, setWinner] = useState<number | null>(null)
  const [from, setFrom] = useState<number | 'tsumo' | null>(null)
  const [tai, setTai] = useState(1)
  const [editDealer, setEditDealer] = useState(false)
  // 算台那一頁按「記到帳上」：台數、自摸帶過來
  useEffect(() => {
    if (!prefill) return
    setTai(prefill.tai)
    setFrom(prefill.tsumo ? 'tsumo' : null)
  }, [prefill])
  const t = totals(l)
  const set = (f: (x: Ledger) => Ledger) => book.update((s) => ({ ...s, current: s.current && f(s.current) }))
  const ready = winner !== null && from !== null && from !== winner
  const preview = ready ? handDeltas(l, winner, from === 'tsumo' ? null : from, tai) : null
  const record = (r: { winner: number | null; from: number | null; tai: number }) => {
    set((x) => addHand(x, r))
    setWinner(null)
    setFrom(null)
    setTai(1)
  }
  const n = l.names
  return (
    <div className="lg-board">
      <div className="lg-players">
        {n.map((name, i) => (
          <button
            key={i}
            type="button"
            className={cls('lg-player', l.dealer === i && 'is-dealer', editDealer && 'pick')}
            disabled={!editDealer}
            onClick={() => {
              set((x) => ({ ...x, dealer: i, streak: 0 }))
              setEditDealer(false)
              showToast(`${name}當莊`)
            }}
          >
            <b>
              {name}
              {l.dealer === i && <em className="tag">{l.streak ? `莊・連 ${l.streak}` : '莊'}</em>}
            </b>
            <span className={cls('lg-total', t[i] > 0 && 'up', t[i] < 0 && 'down')}>{money(t[i])}</span>
          </button>
        ))}
      </div>
      <div className="lg-main">
        <div className="lg-form">
          <Seg
            label="誰胡"
            value={winner ?? -1}
            options={n}
            onChange={(v) => {
              setWinner(v)
              if (from === v) setFrom(null)
            }}
          />
          <div className="calc-opt">
            <span>誰放槍</span>
            <div className="seg" role="group" aria-label="誰放槍">
              <button type="button" aria-pressed={from === 'tsumo'} onClick={() => setFrom('tsumo')}>
                自摸
              </button>
              {n.map((name, i) =>
                i === winner ? null : (
                  <button key={i} type="button" aria-pressed={from === i} onClick={() => setFrom(i)}>
                    {name}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="calc-opt">
            <span>幾台</span>
            <span className="stepper">
              <button type="button" onClick={() => setTai(Math.max(0, tai - 1))} aria-label="少一台">
                −
              </button>
              <b className="lg-tai">{tai} 台</b>
              <button type="button" onClick={() => setTai(Math.min(99, tai + 1))} aria-label="多一台">
                +
              </button>
            </span>
            <small className="lg-hint">不含莊家台（自動算）</small>
          </div>
          <p className="lg-preview">
            {preview
              ? n
                  .map((name, i) => (preview[i] ? `${name} ${money(preview[i])}` : ''))
                  .filter(Boolean)
                  .join('、')
              : '選誰胡、誰放槍（或自摸）、幾台'}
          </p>
          <div className="lg-actions">
            <button type="button" className="btn" onClick={() => record({ winner: null, from: null, tai: 0 })}>
              流局
            </button>
            <button type="button" className="btn primary" disabled={!ready} onClick={() => record({ winner: winner!, from: from === 'tsumo' ? null : (from as number), tai })}>
              記這一手
            </button>
          </div>
        </div>
        <div className="lg-history">
          <div className="lg-history-head">
            <b>第 {l.hands.length + 1} 手</b>
            <button type="button" className="btn small" onClick={() => setEditDealer(!editDealer)}>
              {editDealer ? '點上面的名字' : '改莊家'}
            </button>
            <button type="button" className="btn small" disabled={!l.hands.length} onClick={() => set(undoHand)}>
              刪掉上一手
            </button>
          </div>
          <ol className="lg-hands" reversed>
            {[...l.hands].reverse().map((h, k) => (
              <li key={l.hands.length - k}>
                <span className="lg-no">{l.hands.length - k}</span>
                <span className="lg-what">
                  {h.winner === null ? '流局' : h.from === null ? `${n[h.winner]}自摸 ${h.tai} 台` : `${n[h.winner]}胡${n[h.from]} ${h.tai} 台`}
                  <small>{n[h.dealer]}莊{h.streak ? `連 ${h.streak}` : ''}</small>
                </span>
                {h.winner !== null && <b className="up">{money(h.deltas[h.winner])}</b>}
              </li>
            ))}
            {!l.hands.length && <li className="lg-empty">還沒記。打完一手就在左邊記下來。</li>}
          </ol>
          <button type="button" className="btn primary lg-settle" disabled={!l.hands.length} onClick={onSettle}>
            結束，算帳
          </button>
        </div>
      </div>
    </div>
  )
}

/** 結帳：名次、誰給誰多少、稱號、分享 */
function Settle({ l, book, onBack }: { l: Ledger; book: Book; onBack: () => void }) {
  const showToast = useUI((s) => s.showToast)
  const t = totals(l)
  const order = [0, 1, 2, 3].sort((a, b) => t[b] - t[a])
  const tr = settleUp(t)
  const ts = titles(l)
  const site = `${location.origin}${location.pathname}`
  const shareText = async () => {
    const r = await share(ledgerText(l, site))
    if (r === 'copied') showToast('戰報複製好了，貼到群組吧')
    else if (r === 'failed') showToast('這個瀏覽器不能分享')
  }
  const card = () =>
    useUI.setState({
      shareCard: {
        title: '家庭牌局戰報',
        lead: '傳到家族群組。手機按「分享」可以直接傳到 LINE。',
        make: () => makeLedgerCard(l),
        filename: `胡了-家庭牌局-${l.date}.png`,
        text: `胡了！家庭牌局 ${l.date}`,
        alt: '家庭牌局戰報',
      },
    })
  const again = () =>
    book.update((s) => ({
      ...s,
      past: [{ date: l.date, names: l.names, totals: t, hands: l.hands.length }, ...s.past].slice(0, 8),
      current: null,
    }))
  return (
    <div className="lg-settle-view">
      <div className="lg-rank">
        <h4>
          {l.date.slice(5).replace('-', '/')}・{l.hands.length} 手・底 {l.base}／台 {l.perTai}
        </h4>
        <ol>
          {order.map((s, k) => (
            <li key={s}>
              <span className="lg-no">{k + 1}</span>
              <b>{l.names[s]}</b>
              <span className={cls('lg-total', t[s] > 0 && 'up', t[s] < 0 && 'down')}>{money(t[s])}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="lg-pay">
        <h4>{tr.length ? '結帳' : '大家打平，不用轉帳'}</h4>
        <ul>
          {tr.map((x, k) => (
            <li key={k}>
              {l.names[x.from]} <i aria-hidden="true">→</i> {l.names[x.to]}
              <b>{fmt(x.amount)}</b>
            </li>
          ))}
        </ul>
        {ts.length > 0 && (
          <ul className="lg-titles">
            {ts.map((x) => (
              <li key={x.title}>
                <em>{x.title}</em>
                {l.names[x.who]}
                <small>{x.note}</small>
              </li>
            ))}
          </ul>
        )}
        <div className="lg-actions">
          <button type="button" className="btn" onClick={onBack}>
            繼續記
          </button>
          <button type="button" className="btn" onClick={shareText}>
            分享文字
          </button>
          <button type="button" className="btn primary" onClick={card}>
            戰報圖
          </button>
          <button type="button" className="btn" onClick={again}>
            開新的一場
          </button>
        </div>
      </div>
    </div>
  )
}
