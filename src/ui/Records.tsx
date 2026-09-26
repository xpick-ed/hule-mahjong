// 戰績與成就。

import { useState } from 'react'
import { CHARACTERS } from '../engine/characters'
import * as P from '../progress'
import { lookFor, useUI } from '../store'
import { Avatar } from './Avatar'
import { cls } from './bits'
import { Sheet } from './Overlays'

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

export function Records() {
  const open = useUI((s) => s.records)
  const setRecords = useUI((s) => s.setRecords)
  const progress = useUI((s) => s.progress)
  const [tab, setTab] = useState<'stats' | 'ach'>('stats')
  const got = P.ACHIEVEMENTS.filter((a) => progress.ach[a.id]).length
  return (
    <Sheet open={open} onClose={() => setRecords(false)} label="戰績">
      <nav className="menu-tabs" aria-label="分類">
        <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>
          戰績
        </button>
        <button type="button" aria-pressed={tab === 'ach'} onClick={() => setTab('ach')}>
          成就 {got}/{P.ACHIEVEMENTS.length}
        </button>
      </nav>
      {tab === 'stats' ? <Stats p={progress} /> : <Achievements p={progress} />}
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
