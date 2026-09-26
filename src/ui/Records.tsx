// 戰績與成就。

import { useState } from 'react'
import { CHARACTERS } from '../engine/characters'
import { STAGES } from '../engine/stages'
import * as P from '../progress'
import { lookFor, useUI } from '../store'
import { Avatar } from './Avatar'
import { cls, Tile } from './bits'
import { Sheet } from './Overlays'

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

export function Records() {
  const open = useUI((s) => s.records)
  const setRecords = useUI((s) => s.setRecords)
  const progress = useUI((s) => s.progress)
  const [tab, setTab] = useState<'stats' | 'ach' | 'album'>('stats')
  const got = P.ACHIEVEMENTS.filter((a) => progress.ach[a.id]).length
  const collected = P.ALBUM.filter((a) => progress.album[a.name]).length
  return (
    <Sheet open={open} onClose={() => setRecords(false)} label="戰績">
      <nav className="menu-tabs" aria-label="分類">
        <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>
          戰績
        </button>
        <button type="button" aria-pressed={tab === 'ach'} onClick={() => setTab('ach')}>
          成就 {got}/{P.ACHIEVEMENTS.length}
        </button>
        <button type="button" aria-pressed={tab === 'album'} onClick={() => setTab('album')}>
          牌型圖鑑 {collected}/{P.ALBUM.length}
        </button>
      </nav>
      {tab === 'stats' ? <Stats p={progress} /> : tab === 'ach' ? <Achievements p={progress} /> : <Album p={progress} />}
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={() => setRecords(false)}>
          關閉
        </button>
      </div>
    </Sheet>
  )
}

function Stats({ p }: { p: P.Progress }) {
  const st = p.stats
  const cells: [string, string][] = [
    ['打過', `${p.matches} 場`],
    ['拿第一', `${p.wins} 次（${pct(p.wins, p.matches)}）`],
    ['打過幾局', `${st.hands} 局`],
    ['胡牌率', pct(st.wins, st.hands)],
    ['自摸', `${st.tsumo} 次`],
    ['放槍率', pct(st.dealIns, st.hands)],
    ['平均台數', st.wins ? `${(st.totalTai / st.wins).toFixed(1)} 台` : '—'],
    ['當莊最多連', `${st.bestStreak} 次`],
  ]
  const vs = Object.entries(p.vs).sort((a, b) => b[1].played - a[1].played)
  return (
    <div className="stats">
      <dl className="stat-grid">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="best-hand">
        <h4>最大的一手</h4>
        {st.best ? (
          <p>
            <b>{st.best.tai} 台</b>
            <span>{st.best.items.join('、')}</span>
            <small>{st.best.date}</small>
          </p>
        ) : (
          <p className="muted">還沒胡過。</p>
        )}
      </div>
      {vs.length > 0 && (
        <div className="vs">
          <h4>對手戰績（名次比他高的場數）</h4>
          <ul>
            {vs.map(([id, v]) => (
              <li key={id}>
                <Avatar look={lookFor(p, id)} size={22} />
                <span>{CHARACTERS[id]?.name ?? id}</span>
                <b>
                  {v.above}/{v.played}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Achievements({ p }: { p: P.Progress }) {
  return (
    <ul className="ach-grid">
      {P.ACHIEVEMENTS.map((a) => {
        const date = p.ach[a.id]
        const hidden = !date && a.secret
        return (
          <li key={a.id} className={cls(date ? 'got' : 'locked')}>
            <span className="ach-medal" aria-hidden="true">
              {date ? '★' : '？'}
            </span>
            <b>{hidden ? '？？？' : a.name}</b>
            <small>{hidden ? '隱藏成就' : a.desc}</small>
            {date && <em>{date}</em>}
          </li>
        )
      })}
    </ul>
  )
}

/** 一手牌：亮出來的組、手牌（胡的那張框起來）、花 */
export function SnapHand({ snap, w = 20 }: { snap: P.HandSnap; w?: number }) {
  let marked = false
  return (
    <span className="snap-hand">
      {snap.melds.map((g, i) => (
        <span key={`m${i}`} className="snap-group">
          {g.map((k, j) => (
            <Tile key={j} kind={k} w={w} />
          ))}
        </span>
      ))}
      <span className="snap-group">
        {snap.hand.map((k, i) => {
          const hot = !marked && k === snap.win && i === snap.hand.lastIndexOf(k)
          if (hot) marked = true
          return <Tile key={i} kind={k} w={w} hot={hot} />
        })}
      </span>
      {snap.flowers.length > 0 && (
        <span className="snap-group">
          {snap.flowers.map((k, i) => (
            <Tile key={i} kind={k} w={w * 0.8} />
          ))}
        </span>
      )}
    </span>
  )
}

function Album({ p }: { p: P.Progress }) {
  const [open, setOpen] = useState<string | null>(null)
  const brag = useUI((s) => s.brag)
  const entry = open ? p.album[open] : null
  const def = open ? P.ALBUM.find((a) => a.name === open) : null
  if (entry && def) {
    const r = P.rarityOf(def.tai)
    return (
      <div className="album-detail">
        <header>
          <span className={cls('rarity', r)}>{P.RARITY_NAME[r]}</span>
          <h4>{def.name}</h4>
          <span className="album-tai">{def.tai} 台</span>
        </header>
        <p className="muted small">
          胡過 {entry.count} 次・最大的一手：{entry.best.tai} 台，{entry.best.tsumo ? '自摸' : '胡別人的'}，{STAGES[entry.best.stage]?.name ?? ''}，{entry.best.date}
        </p>
        <SnapHand snap={entry.best} w={22} />
        <p className="album-items">{entry.best.items.join('、')}</p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => setOpen(null)}>
            回圖鑑
          </button>
          <button type="button" className="btn primary" onClick={() => brag(entry.best)}>
            做成炫耀卡
          </button>
        </div>
      </div>
    )
  }
  return (
    <ul className="album-grid">
      {P.ALBUM.map((a) => {
        const e = p.album[a.name]
        const r = P.rarityOf(a.tai)
        return (
          <li key={a.name}>
            <button type="button" className={cls('album-card', r, !e && 'locked')} disabled={!e} onClick={() => setOpen(a.name)}>
              <b>{a.name}</b>
              <span className="album-tai">{a.tai} 台</span>
              <small>{e ? `胡過 ${e.count} 次` : a.hint}</small>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
