// 有什麼新東西：更新之後第一次打開跳出來。每一項可以直接點過去玩。

import { LADDER, STAGES, TOURNEY } from '../engine/stages'
import { NEWS, type NewsAction } from '../news'
import { useUI } from '../store'
import { cls } from './bits'
import { Sheet } from './Overlays'

function go(a: NewsAction) {
  const st = useUI.getState()
  const p = st.progress
  st.setNews(false)
  if ((a === 'blitz' || a === 'tourney') && p.cleared < 1) return st.showToast('過第一關就能玩')
  if (a === 'blitz') st.openStage({ stage: Math.min(p.cleared, LADDER.length - 1), blitz: true })
  else if (a === 'tourney') st.openStage({ stage: STAGES.indexOf(TOURNEY[Math.min(p.tourneyCleared, TOURNEY.length - 1)]), tourney: true })
  else if (a === 'look') st.setLookSheet(true)
  else if (a === 'calc') st.setCalc(true)
  else if (a === 'save') st.setMenu(true, 'save')
  else st.setOnlineSheet(true)
}

export function News() {
  const setNews = useUI((s) => s.setNews)
  const close = () => setNews(false)
  return (
    <Sheet open onClose={close} label="有什麼新東西">
      <div className="news">
        <h3>有什麼新東西</h3>
        <ul className="news-list">
          {NEWS.map((n) => (
            <li key={n.title} className={cls('news-item', n.tone)}>
              <span className="news-top">
                <b>{n.title}</b>
                {n.action && (
                  <button type="button" className="btn small" onClick={() => go(n.action!.go)}>
                    {n.action.label}
                  </button>
                )}
              </span>
              <p>{n.text}</p>
            </li>
          ))}
        </ul>
        <div className="sheet-actions">
          <button type="button" className="btn primary" onClick={close}>
            好，知道了
          </button>
        </div>
      </div>
    </Sheet>
  )
}
