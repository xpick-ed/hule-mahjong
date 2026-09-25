import { useEffect, useState, type ReactNode } from 'react'
import { CHARACTERS } from '../engine/characters'
import * as M from '../engine/match'
import { SKINS, STAGES } from '../engine/stages'
import { useUI } from '../store'
import { Avatar, MeBadge } from './Avatar'
import { cls, fmt, fmtSigned, Tile } from './bits'

const nameOf = (m: M.MatchState, seat: number) => (seat === 0 ? '你' : CHARACTERS[m.chars[seat]].name)

function Face({ m, seat, size = 34 }: { m: M.MatchState; seat: number; size?: number }) {
  return seat === 0 ? <MeBadge size={size} /> : <Avatar look={CHARACTERS[m.chars[seat]].look} size={size} />
}

/** 等胡牌的蓋章播完再出現 */
function useDelay(ms: number) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), ms)
    return () => window.clearTimeout(id)
  }, [ms])
  return ready
}

export function HandEnd({ m }: { m: M.MatchState }) {
  const next = useUI((s) => s.nextHand)
  const ready = useDelay(1300)
  const r = m.result
  if (!ready || !r) return null
  const w = r.win
  const last = m.passes >= 3 && w && w.seat !== m.dealer
  const seats = [0, 1, 2, 3]

  return (
    <div className="overlay">
      <div className="panel result" role="dialog" aria-label="這一局的結果">
        {w ? (
          <>
            <header className="result-head">
              <Face m={m} seat={w.seat} size={46} />
              <div>
                <h2>
                  {nameOf(m, w.seat)}
                  {w.from === null ? ' 自摸！' : ' 胡了！'}
                </h2>
                <p>{w.from === null ? '三家都要付' : `${nameOf(m, w.from)}放槍`}</p>
              </div>
              <span className="total-tai">
                <b>{w.score.total}</b>台{r.dealerItems ? <small>＋莊家台</small> : null}
              </span>
            </header>
            <div className="win-hand">
              {m.hand.seats[w.seat].melds.map((mm, i) => (
                <span key={i} className="meld">
                  {mm.tiles.map((t) => (
                    <Tile key={t.id} kind={t.kind} w={24} />
                  ))}
                </span>
              ))}
              <span className="meld">
                {w.hand.map((t) => (
                  <Tile key={t.id} kind={t.kind} w={24} hot={t.id === w.tile.id} />
                ))}
              </span>
              {m.hand.seats[w.seat].flowers.map((f) => (
                <Tile key={f.id} kind={f.kind} w={20} />
              ))}
            </div>
            <ul className="tai-list">
              {w.score.items.map((it, i) => (
                <li key={i}>
                  {it.name}
                  <b>{it.tai}</b>
                </li>
              ))}
              {w.score.items.length === 0 && <li className="none">沒有台（只算底）</li>}
              {r.dealerItems?.map((it, i) => (
                <li key={`d${i}`} className="dealer-item">
                  {it.name}
                  <b>{it.tai}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <header className="result-head">
            <span className="stamp-small">流</span>
            <div>
              <h2>流局</h2>
              <p>牌摸完了，沒人胡。莊家連莊。</p>
            </div>
          </header>
        )}
        <div className="deltas">
          {seats.map((s) => (
            <div key={s} className={cls('delta', r.deltas[s] > 0 && 'up', r.deltas[s] < 0 && 'down')}>
              <Face m={m} seat={s} size={26} />
              <span className="d-name">{nameOf(m, s)}</span>
              <b>{fmtSigned(r.deltas[s])}</b>
              <small>{fmt(m.points[s])}</small>
            </div>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={next}>
          {last || m.points.some((p) => p < 0) ? '看最後結果' : '下一局'}
        </button>
      </div>
    </div>
  )
}

export function MatchEnd({ m }: { m: M.MatchState }) {
  const start = useUI((s) => s.startStage)
  const toHome = useUI((s) => s.toHome)
  const order = M.ranking(m)
  const first = order[0] === 0
  const stage = STAGES[m.stage]
  const hasNext = m.stage + 1 < STAGES.length
  return (
    <div className="overlay">
      <div className="panel final" role="dialog" aria-label="這一場的結果">
        <h2>{first ? (hasNext ? `過關！${stage.name}拿第一` : '你就是新的雀神！') : `第 ${order.indexOf(0) + 1} 名`}</h2>
        <p className="final-sub">
          {first ? `解鎖桌布「${stage.reward.name}」${hasNext ? `，下一關：${STAGES[m.stage + 1].name}` : ''}` : '拿第一才能過關，再挑戰一次吧'}
        </p>
        <ol className="podium">
          {order.map((s, i) => (
            <li key={s} className={cls(s === 0 && 'is-me')}>
              <span className="rank">{i + 1}</span>
              <Face m={m} seat={s} size={32} />
              <span className="d-name">{nameOf(m, s)}</span>
              <b>{fmt(m.points[s])}</b>
            </li>
          ))}
        </ol>
        {first && s0(m) && <p className="quote">「{s0(m)}」</p>}
        <div className="final-actions">
          <button type="button" className="btn" onClick={toHome}>
            回首頁
          </button>
          {first && hasNext ? (
            <button type="button" className="btn primary" onClick={() => start(m.stage + 1)}>
              下一關
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => start(m.stage)}>
              再打一場
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** 輸掉的對手最後講一句 */
function s0(m: M.MatchState): string | null {
  const order = M.ranking(m)
  const loser = order[order.length - 1]
  if (loser === 0) return null
  const ls = CHARACTERS[m.chars[loser]].lines.matchLose
  return ls?.[0] ?? null
}

function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay dim" onClick={onClose}>
      <div className="panel sheet" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function Menu() {
  const open = useUI((s) => s.menu)
  const settings = useUI((s) => s.settings)
  const progress = useUI((s) => s.progress)
  const screen = useUI((s) => s.screen)
  const { setMenu, setSettings, setHelp, toHome, setSkin } = useUI.getState()
  return (
    <Sheet open={open} onClose={() => setMenu(false)} label="選單">
      <h3>設定</h3>
      <div className="settings">
        <label className="row">
          <span>音效</span>
          <button type="button" className="toggle" aria-pressed={settings.sound} onClick={() => setSettings({ sound: !settings.sound })}>
            {settings.sound ? '開' : '關'}
          </button>
        </label>
        <label className="row">
          <span>電腦出牌速度</span>
          <button type="button" className="toggle" aria-pressed={settings.fast} onClick={() => setSettings({ fast: !settings.fast })}>
            {settings.fast ? '快' : '正常'}
          </button>
        </label>
        <label className="row">
          <span>提示（打哪張會聽）</span>
          <button type="button" className="toggle" aria-pressed={settings.hints} onClick={() => setSettings({ hints: !settings.hints })}>
            {settings.hints ? '開' : '關'}
          </button>
        </label>
        <div className="row">
          <span>桌布</span>
          <div className="skins">
            {Object.values(SKINS).map((sk) => {
              const owned = progress.skins.includes(sk.id)
              return (
                <button
                  key={sk.id}
                  type="button"
                  className={cls('skin', progress.skin === sk.id && 'on')}
                  style={{ background: owned ? sk.color : undefined }}
                  disabled={!owned}
                  onClick={() => setSkin(sk.id)}
                  aria-label={owned ? sk.name : `${sk.name}（還沒解鎖）`}
                  title={owned ? sk.name : '過關解鎖'}
                />
              )
            })}
          </div>
        </div>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => setHelp(true)}>
          台數表
        </button>
        {screen === 'match' && (
          <button type="button" className="btn" onClick={toHome}>
            回首頁（會保留這一場）
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => setMenu(false)}>
          繼續
        </button>
      </div>
    </Sheet>
  )
}

const TAI_TABLE: [number, string][] = [
  [1, '莊家、門清、自摸、正花（每張）、圈風、門風、中發白（每組）、槓上開花、海底撈月、河底撈魚、獨聽'],
  [2, '連莊（連 1 拉 1 起，每連一次 +2）、平胡、全求人、三暗刻、春夏秋冬／梅蘭竹菊（湊齊一組）'],
  [3, '門清自摸（取代門清＋自摸）'],
  [4, '碰碰胡、混一色、小三元'],
  [5, '四暗刻'],
  [8, '清一色、大三元、小四喜、五暗刻、嚦咕嚦咕、八仙過海'],
  [16, '字一色、大四喜、天胡、地胡'],
]

export function Help() {
  const open = useUI((s) => s.help)
  const setHelp = useUI((s) => s.setHelp)
  return (
    <Sheet open={open} onClose={() => setHelp(false)} label="台數表">
      <h3>台數表</h3>
      <p className="help-lead">台灣十六張：湊 5 組面子＋1 對。放槍的人付「底＋台數×每台」，自摸三家都付。</p>
      <table className="tai-table">
        <tbody>
          {TAI_TABLE.map(([t, s]) => (
            <tr key={t}>
              <th>{t} 台</th>
              <td>{s}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={() => setHelp(false)}>
          知道了
        </button>
      </div>
    </Sheet>
  )
}

export function Toast() {
  const toast = useUI((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => useUI.setState({ toast: null }), 1800)
    return () => window.clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div key={toast.key} className="toast" role="status">
      {toast.msg}
    </div>
  )
}
