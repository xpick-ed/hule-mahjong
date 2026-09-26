// 每日挑戰排行榜：打完那天第一場可以留名字上榜。網站沒上線（沒有 API）時顯示說明。

import { useEffect, useState } from 'react'
import { fetchBoard, submitScore, type Board } from '../daily'
import type { MatchState } from '../engine/match'
import { useUI } from '../store'
import { cls, fmt } from './bits'

const NAME_KEY = 'hule.name'
const sentKey = (date: string) => `hule.daily.sent.${date}`

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    // 無痕模式
  }
}

export function DailyBoard({ m, date: d0 }: { m?: MatchState; date?: string }) {
  const date = m?.daily ?? d0!
  const counted = useUI((s) => s.rewards?.dailyCounted)
  const best = useUI((s) => (s.progress.dailyBest?.date === date ? s.progress.dailyBest : null))
  const [board, setBoard] = useState<Board | null | 'loading'>('loading')
  const myName = useUI((s) => s.settings.name.trim())
  const [name, setName] = useState(() => read(NAME_KEY) || myName)
  const [sent, setSent] = useState(() => !!read(sentKey(date)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void fetchBoard(date).then((b) => live && setBoard(b))
    return () => {
      live = false
    }
  }, [date])

  const canSubmit = !!m && counted && !sent && board !== null && board !== 'loading'
  const submit = async () => {
    const n = name.trim().slice(0, 12)
    if (!m || !n) return
    setBusy(true)
    write(NAME_KEY, n)
    const b = await submitScore(m, n)
    setBusy(false)
    if (b) {
      setBoard(b)
      setSent(true)
      write(sentKey(date), '1')
    }
  }

  return (
    <div className="daily-board">
      <h4>
        每日挑戰排行榜 <small>{date.slice(5).replace('-', '/')}</small>
      </h4>
      {m && !counted && best && <p className="board-note">今天已經算過第一場了（第 {best.place} 名），這場不計分。</p>}
      {board === 'loading' && <p className="board-note">載入中…</p>}
      {board === null && <p className="board-note">排行榜現在連不上（試玩版或沒有網路時看不到）。{best ? `你今天第 ${best.place} 名、${fmt(best.points)} 分。` : ''}</p>}
      {board && board !== 'loading' && (
        <>
          {canSubmit && (
            <form
              className="board-form"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="你的暱稱" aria-label="暱稱" />
              <button type="submit" className="btn small primary" disabled={busy || !name.trim()}>
                上榜
              </button>
            </form>
          )}
          <ol className="board">
            {board.rows.map((r, i) => (
              <li key={i} className={cls(r.me && 'is-me')}>
                <span className="b-rank">{i + 1}</span>
                <span className="b-name">{r.name}</span>
                <span className="b-grid">{r.grid}</span>
                <b>{fmt(r.points)}</b>
              </li>
            ))}
            {board.rows.length === 0 && <li className="empty">還沒有人上榜，你來當第一個</li>}
          </ol>
          <p className="board-note">
            今天共 {board.total} 人挑戰{board.myRank ? `，你排第 ${board.myRank}` : ''}
          </p>
        </>
      )}
    </div>
  )
}
