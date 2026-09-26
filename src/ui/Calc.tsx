// 算台幫手：真的在打麻將時用。點下面的牌輸入你的手牌（吃碰槓切換上面的按鈕），右邊馬上算出台數和該收多少錢。
// 牌還差一張的話，列出聽哪幾張、胡了各幾台。

import { useEffect, useState } from 'react'
import { calculate, canAddMeld, canAddTile, handNeed, meldKinds, sortKinds, type CalcInput, type MeldPick } from '../calc'
import { KINDS, WIND_CHAR, type Kind } from '../engine/tiles'
import { useUI } from '../store'
import { cls, fmt, Seg, Tile, useStageSize } from './bits'
import { LedgerPane, useBook, type Prefill } from './Ledger'

type AddMode = 'hand' | MeldPick['type']

const MODES: [AddMode, string][] = [
  ['hand', '手牌'],
  ['chow', '吃'],
  ['pung', '碰'],
  ['kong', '明槓'],
  ['ankan', '暗槓'],
]

const ROWS: Kind[][] = [KINDS.slice(0, 9), KINDS.slice(9, 18), KINDS.slice(18, 27), KINDS.slice(27)]
const FLOWERS: Kind[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']

/** 常見的底／台 */
const STAKES: [number, number][] = [
  [50, 20],
  [100, 20],
  [100, 50],
  [300, 100],
]

const START: CalcInput = {
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

export function Calc() {
  const open = useUI((s) => s.calc)
  if (!open) return null
  return <Helper />
}

type HelperTab = 'calc' | 'ledger'

/** 牌桌幫手：算台、記帳兩個分頁（打牌中的記帳正在進行的話，打開先看記帳） */
function Helper() {
  const close = () => useUI.getState().setCalc(false)
  const book = useBook()
  const [tab, setTab] = useState<HelperTab>(book.saved.current ? 'ledger' : 'calc')
  const [x, setX] = useState<CalcInput>(START)
  // 算好台數之後「記到帳上」：帶到記帳那一頁
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  useEffect(() => {
    // 戰報圖開著的時候 Esc 只關戰報圖
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !useUI.getState().shareCard && close()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  const record = (tai: number, tsumo: boolean) => {
    setPrefill({ tai, tsumo, key: Date.now() })
    setTab('ledger')
  }
  return (
    <div className="overlay dim">
      <div className="panel calc" role="dialog" aria-label="算台記帳">
        <header className="calc-head">
          <nav className="seg helper-tabs" aria-label="分頁">
            <button type="button" aria-pressed={tab === 'calc'} onClick={() => setTab('calc')}>
              算台
            </button>
            <button type="button" aria-pressed={tab === 'ledger'} onClick={() => setTab('ledger')}>
              記帳{book.saved.current ? <i className="live-dot" aria-label="記帳中" /> : null}
            </button>
          </nav>
          <span className="calc-sub">
            {tab === 'calc' ? '真的在打牌時用：點下面的牌輸入你的牌，右邊馬上算台數和錢' : '記每一手誰胡、誰放槍、幾台，打完算出誰該給誰多少'}
          </span>
          {tab === 'calc' && (
            <button type="button" className="btn small" onClick={() => setX({ ...START, base: x.base, perTai: x.perTai, seatWind: x.seatWind, roundWind: x.roundWind })}>
              清空
            </button>
          )}
          <button type="button" className="btn small" onClick={close}>
            關閉
          </button>
        </header>
        {tab === 'calc' ? <CalcPane x={x} setX={setX} onRecord={book.saved.current ? record : undefined} /> : <LedgerPane book={book} prefill={prefill} />}
      </div>
    </div>
  )
}

function CalcPane({ x, setX, onRecord }: { x: CalcInput; setX: (f: (v: CalcInput) => CalcInput) => void; onRecord?: (tai: number, tsumo: boolean) => void }) {
  const showToast = useUI((s) => s.showToast)
  const [mode, setMode] = useState<AddMode>('hand')
  const { W } = useStageSize()
  const set = (p: Partial<CalcInput>) => setX((v) => ({ ...v, ...p }))

  const need = handNeed(x.melds)
  const full = x.hand.length === need
  const add = (k: Kind) => {
    if (k[0] === 'f') return set({ flowers: x.flowers.includes(k) ? x.flowers.filter((f) => f !== k) : [...x.flowers, k] })
    if (mode === 'hand') {
      if (canAddTile(x, k)) set({ hand: [...x.hand, k] })
      else showToast(x.hand.length >= need ? '牌已經夠了：點上面的牌可以拿掉' : '這張已經 4 張了')
      return
    }
    const m: MeldPick = { type: mode, kind: k }
    if (canAddMeld(x, m)) set({ melds: [...x.melds, m] })
    else showToast(x.melds.length >= 5 ? '最多五組' : mode === 'chow' ? '吃要點順子最小的那張（1–7）' : x.hand.length > handNeed([...x.melds, m]) ? '手牌太多了，先拿掉幾張' : '這張不夠了')
  }
  const removeHand = (i: number) => set({ hand: x.hand.filter((_, j) => j !== i) })
  const removeMeld = (i: number) => set({ melds: x.melds.filter((_, j) => j !== i) })

  // 手牌：排好，牌夠了的話最後加的那張（胡的牌）另外放
  const shown = full ? sortKinds(x.hand.slice(0, -1)) : sortKinds(x.hand)
  const indexOf = (k: Kind, nth: number) => {
    let seen = -1
    return x.hand.findIndex((h, i) => h === k && ++seen === nth && !(full && i === x.hand.length - 1))
  }
  const count = x.hand.length + x.melds.reduce((s, m) => s + meldKinds(m).length, 0) + x.flowers.length
  const tw = Math.max(18, Math.min(28, Math.floor((W - 90 - x.melds.length * 6) / Math.max(17, count))))
  // 自摸時沒有「放槍的」
  const dealers: CalcInput['dealer'][] = x.tsumo ? ['me', 'other'] : ['me', 'payer', 'other']
  const pickable = (k: Kind) => (mode === 'hand' ? canAddTile(x, k) : canAddMeld(x, { type: mode, kind: k }))

  return (
    <>
      <div className="calc-hand" aria-label="你的牌">
        {x.melds.map((m, i) => (
          <button key={`m${i}`} type="button" className={cls('calc-meld', m.type === 'ankan' && 'ankan')} onClick={() => removeMeld(i)} aria-label="拿掉這一組">
            {meldKinds(m).map((k, j) => (
              <Tile key={j} kind={k} w={tw} dim={m.type === 'ankan' && (j === 0 || j === 3)} />
            ))}
          </button>
        ))}
        <span className="calc-concealed">
          {shown.map((k, i) => {
            const nth = shown.slice(0, i).filter((y) => y === k).length
            return <Tile key={`h${i}`} kind={k} w={tw} onClick={() => removeHand(indexOf(k, nth))} label={`拿掉${k}`} />
          })}
          {full && (
            <span className="calc-win">
              <Tile kind={x.hand[x.hand.length - 1]} w={tw} hot onClick={() => removeHand(x.hand.length - 1)} label="拿掉胡的那張" />
              <small>胡</small>
            </span>
          )}
        </span>
        {x.flowers.length > 0 && (
          <span className="calc-flowers">
            {x.flowers.map((f) => (
              <Tile key={f} kind={f} w={Math.round(tw * 0.8)} onClick={() => set({ flowers: x.flowers.filter((y) => y !== f) })} />
            ))}
          </span>
        )}
        {count === 0 && <span className="calc-empty">點下面的牌加進來。牌夠了，最後加的那張就是胡的牌。</span>}
        {count > 0 && (
          <span className="calc-count">
            {x.hand.length}/{need} 張
          </span>
        )}
      </div>

      <div className="calc-body">
        <div className="calc-pick">
          <div className="seg calc-modes" role="group" aria-label="加到哪裡">
            {MODES.map(([id, name]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                {name}
              </button>
            ))}
          </div>
          {ROWS.map((row, i) => (
            <div key={i} className="calc-row">
              {row.map((k) => (
                <Tile key={k} kind={k} w={28} dim={!pickable(k)} onClick={() => add(k)} />
              ))}
            </div>
          ))}
          <div className="calc-row flowers">
            {FLOWERS.map((f) => (
              <Tile key={f} kind={f} w={22} selected={x.flowers.includes(f)} onClick={() => add(f)} />
            ))}
            <small>花</small>
          </div>
        </div>

        <div className="calc-side">
          <Result x={x} onRecord={onRecord} />
          <div className="calc-opts">
            <Seg label="怎麼胡" value={x.tsumo ? 1 : 0} options={['別人放槍', '自摸']} onChange={(v) => set({ tsumo: v === 1, ...(v === 1 && x.dealer === 'payer' ? { dealer: 'other' } : {}) })} />
            <Seg
              label="誰是莊家"
              value={dealers.indexOf(x.dealer)}
              options={dealers.map((d) => ({ me: '我', payer: '放槍的', other: '別人' })[d])}
              onChange={(v) => set({ dealer: dealers[v] })}
            />
            <div className="calc-opt">
              <span>莊家連幾次</span>
              <span className="stepper">
                <button type="button" onClick={() => set({ streak: Math.max(0, x.streak - 1) })} aria-label="少一次">
                  −
                </button>
                <b>{x.streak ? `連 ${x.streak}` : '沒連'}</b>
                <button type="button" onClick={() => set({ streak: Math.min(9, x.streak + 1) })} aria-label="多一次">
                  +
                </button>
              </span>
            </div>
            <Seg label="你的位置" value={x.seatWind} options={WIND_CHAR.map((w) => `${w}`)} onChange={(v) => set({ seatWind: v })} />
            <Seg label="這一圈" value={x.roundWind} options={WIND_CHAR.map((w) => `${w}風`)} onChange={(v) => set({ roundWind: v })} />
            <div className="calc-opt">
              <span>特別的</span>
              <span className="chips">
                <Chip on={x.lastTile} onClick={() => set({ lastTile: !x.lastTile })}>
                  {x.tsumo ? '海底撈月' : '河底撈魚'}
                </Chip>
                {x.tsumo ? (
                  <Chip on={x.afterKong} onClick={() => set({ afterKong: !x.afterKong })}>
                    槓上開花
                  </Chip>
                ) : (
                  <Chip on={x.robKong} onClick={() => set({ robKong: !x.robKong })}>
                    搶槓
                  </Chip>
                )}
                <Chip on={x.heaven} onClick={() => set({ heaven: !x.heaven, earth: false })}>
                  天胡
                </Chip>
                <Chip on={x.earth} onClick={() => set({ earth: !x.earth, heaven: false })}>
                  地胡
                </Chip>
              </span>
            </div>
            <Seg
              label="底／台"
              value={STAKES.findIndex(([b, t]) => b === x.base && t === x.perTai)}
              options={STAKES.map(([b, t]) => `${b}/${t}`)}
              onChange={(v) => set({ base: STAKES[v][0], perTai: STAKES[v][1] })}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={cls('calc-chip', on && 'on')} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function Result({ x, onRecord }: { x: CalcInput; onRecord?: (tai: number, tsumo: boolean) => void }) {
  const r = calculate(x)
  if (r.t === 'empty') return <div className="calc-result muted">輸入你的牌：沒吃碰是 16 張＋胡的那張。吃碰槓切換上面的「吃、碰、槓」再點牌。</div>
  if (r.t === 'short') return <div className="calc-result muted">還要 {r.need} 張才看得出聽什麼（吃碰槓一組算 3 張）</div>
  if (r.t === 'notReady') return <div className="calc-result muted">還沒聽牌，差 {r.shanten} 步</div>
  if (r.t === 'notWin') return <div className="calc-result muted">這手還不能胡，差 {r.shanten} 張。最後加的那張是胡的牌，點它可以拿掉換一張。</div>
  if (r.t === 'waiting') {
    return (
      <div className="calc-result">
        <b className="calc-title">聽 {r.waits.length} 種</b>
        <ul className="calc-waits">
          {r.waits.map((w) => (
            <li key={w.kind}>
              <Tile kind={w.kind} w={22} dim={w.left === 0} />
              <span>
                放槍 <b>{w.ron}</b> 台・自摸 <b>{w.tsumo}</b> 台
                <small>{w.left ? `外面最多還有 ${w.left} 張` : '你自己拿光了'}</small>
              </span>
            </li>
          ))}
        </ul>
        <small className="calc-note">台數不含莊家台。再加一張就能算錢。</small>
      </div>
    )
  }
  const p = r.pay
  const dt = r.dealer.reduce((s, it) => s + it.tai, 0)
  return (
    <div className="calc-result win">
      <div className="calc-total">
        <b>{r.tai}</b>台{dt ? <small>＋莊家 {dt} 台</small> : null}
      </div>
      <ul className="calc-items">
        {r.items.map((it, i) => (
          <li key={i}>
            {it.name}
            <b>{it.tai}</b>
          </li>
        ))}
        {r.dealer.map((it, i) => (
          <li key={`d${i}`} className="dealer-item">
            {it.name}
            <b>{it.tai}</b>
          </li>
        ))}
        {r.items.length === 0 && <li className="none">沒有台（只算底）</li>}
      </ul>
      <p className="calc-pay">
        {p.payer !== undefined
          ? `放槍的付 ${fmt(p.payer)}`
          : p.dealer !== undefined
            ? `莊家付 ${fmt(p.dealer)}，另外兩家各付 ${fmt(p.each!)}`
            : `三家各付 ${fmt(p.each!)}`}
        <b>共收 {fmt(p.total)}</b>
        {onRecord && (
          <button type="button" className="btn small record-btn" onClick={() => onRecord(r.tai, x.tsumo)}>
            記到帳上
          </button>
        )}
      </p>
    </div>
  )
}
