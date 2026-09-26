import { useMemo } from 'react'
import { CHARACTERS } from '../engine/characters'
import { STAGES } from '../engine/stages'
import { dailyInfo } from '../daily'
import { claimable, rankOf } from '../progress'
import { lookFor, savedMatch, useUI } from '../store'
import { Avatar } from './Avatar'
import { cls, fmt, Tile } from './bits'

const FAN = ['m1', 'p5', 's1', 'z5', 'z1', 's9', 'm9']

export function Home() {
  const progress = useUI((s) => s.progress)
  const openStage = useUI((s) => s.openStage)
  const resume = useUI((s) => s.resume)
  const { setMenu, setLearn, setMissions, setShop, setRecords, setPeople } = useUI.getState()
  // 開打前的確認畫面關掉時會重新算（可能剛放棄了那一場）
  const prematch = useUI((s) => s.prematch)
  const saved = useMemo(() => savedMatch(), [prematch])
  const rank = rankOf(progress.rankPts)
  const todo = claimable(progress)
  const daily = dailyInfo()
  const doneToday = progress.dailyBest?.date === daily.date ? progress.dailyBest : null

  return (
    <div className="home">
      <div className="home-top">
        <span className="rank-chip" title={rank.next ? `再 ${rank.next.at - rank.pts} 點升${rank.next.name}` : '最高段位'}>
          <b>{rank.name}</b>
          <span className="rank-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (rank.into / rank.span) * 100)}%` }} />
          </span>
          <small>{rank.next ? `${rank.into}/${rank.span}` : `${rank.pts}`}</small>
        </span>
        <span className="coin-chip" aria-label={`金幣 ${progress.coins}`}>
          <span className="coin-dot" aria-hidden="true" />
          {fmt(progress.coins)}
        </span>
        <span className="top-spacer" />
        <button type="button" className="top-btn" onClick={() => setMissions(true)}>
          任務
          {todo > 0 && <span className="dot-count">{todo}</span>}
        </button>
        <button type="button" className="top-btn" onClick={() => setShop(true)}>
          商店
        </button>
        <button type="button" className="top-btn" onClick={() => setPeople('list')}>
          角色
        </button>
        <button type="button" className="top-btn" onClick={() => setRecords(true)}>
          戰績
        </button>
      </div>
      <section className="brand">
        <div className="fan" aria-hidden="true">
          {FAN.map((k, i) => (
            <span key={k} className="fan-tile" style={{ ['--i' as string]: i - 3 }}>
              <Tile kind={k} w={38} />
            </span>
          ))}
        </div>
        <h1>胡了！</h1>
        <p className="tagline">台灣十六張，找三個人陪你打</p>
        <div className="home-actions">
          {saved && (
            <button type="button" className="btn primary" onClick={resume}>
              繼續打：{STAGES[saved.stage].name}
            </button>
          )}
          <button type="button" className={cls('btn daily-btn', !saved && 'primary')} onClick={() => openStage({ stage: daily.stage, daily: daily.date })}>
            每日挑戰
            <small>{doneToday ? `今天第 ${doneToday.place} 名` : STAGES[daily.stage].name}</small>
          </button>
          <button type="button" className="btn online-btn" onClick={() => useUI.getState().setOnlineSheet(true)}>
            跟朋友打
          </button>
          <button type="button" className="btn" onClick={() => setLearn('tips')}>
            教學
          </button>
          <button type="button" className="btn" onClick={() => setMenu(true)}>
            設定
          </button>
        </div>
        <p className="record">
          打過 {progress.matches} 場・拿第一 {progress.wins} 次
        </p>
      </section>

      <section className="ladder" aria-label="闖關">
        {STAGES.map((st, i) => {
          const locked = i > progress.cleared
          const done = i < progress.cleared
          const fresh = i === 0 && !progress.tutorial
          return (
            <button key={st.id} type="button" className={cls('stage-card', locked && 'locked', done && 'done')} disabled={locked} onClick={() => openStage({ stage: i })}>
              <span className="stage-no">第 {i + 1} 關</span>
              <span className="stage-name">{st.name}</span>
              <span className="stage-place">{st.place}</span>
              <span className="stage-faces">
                {st.opponents.map((id) => (
                  <Avatar key={id} look={lookFor(progress, id)} size={34} />
                ))}
              </span>
              <span className="stage-names">{st.opponents.map((id) => CHARACTERS[id].name).join('、')}</span>
              <span className="stage-stake">
                底 {fmt(st.base)}・每台 {fmt(st.perTai)}
              </span>
              {st.ruleText && <span className="stage-rule">{st.ruleText.split('：')[0]}</span>}
              <span className="stage-cta">{locked ? '上一關拿第一解鎖' : fresh ? '從這裡開始' : done ? '再打一次' : '開打'}</span>
            </button>
          )
        })}
      </section>
    </div>
  )
}
