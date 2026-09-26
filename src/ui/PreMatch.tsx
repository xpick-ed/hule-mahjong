// 開打前：選難度、第一次玩可以選引導局；有沒打完的一場時先確認（網頁版不能用 confirm()）。

import { useMemo, useState } from 'react'
import { CHARACTERS } from '../engine/characters'
import * as M from '../engine/match'
import { STAGES } from '../engine/stages'
import { dailyInfo } from '../daily'
import { lookFor, savedMatch, useUI } from '../store'
import { Avatar } from './Avatar'
import { cls, fmt } from './bits'
import { DailyBoard } from './DailyBoard'
import { Sheet } from './Overlays'

const LEVELS: M.Difficulty[] = ['easy', 'normal', 'hard']

export function PreMatch() {
  const pm = useUI((s) => s.prematch)
  const open = useUI((s) => s.openStage)
  if (!pm) return null
  return (
    <Sheet open onClose={() => open(null)} label="開打">
      <PreMatchBody key={`${pm.stage}-${pm.daily ?? ''}`} stage={pm.stage} daily={pm.daily} />
    </Sheet>
  )
}

function PreMatchBody({ stage: stageIdx, daily }: { stage: number; daily?: string }) {
  const settings = useUI((s) => s.settings)
  const progress = useUI((s) => s.progress)
  const { startStage, resume, openStage } = useUI.getState()
  const saved = useMemo(() => savedMatch(), [])
  const firstTime = !progress.tutorial && stageIdx === 0 && !daily
  const [diff, setDiff] = useState<M.Difficulty>(settings.difficulty)
  const [guided, setGuided] = useState(firstTime)
  const d = daily ? dailyInfo(daily) : null
  const stage = STAGES[d ? d.stage : stageIdx]
  const playedToday = d && progress.dailyBest?.date === d.date ? progress.dailyBest : null
  const go = () => (d ? startStage(d.stage, { daily: d.date }) : startStage(stageIdx, { difficulty: diff, tutorial: guided }))

  return (
    <div className="prematch">
      <header className="pm-head">
        <span className="pm-no">{d ? `每日挑戰 ${d.date.slice(5).replace('-', '/')}` : `第 ${stageIdx + 1} 關`}</span>
        <h3>{stage.name}</h3>
        <span className="pm-faces">
          {stage.opponents.map((id) => (
            <span key={id} className="pm-face">
              <Avatar look={lookFor(progress, id)} size={36} />
              <small>{CHARACTERS[id].name}</small>
            </span>
          ))}
        </span>
      </header>
      <p className="pm-meta">
        底 {fmt(stage.base)}・每台 {fmt(stage.perTai)}
        {stage.ruleText ? `・${stage.ruleText}` : ''}
      </p>

      {d ? (
        <div className="pm-daily">
          <p>今天大家拿到的牌都一模一樣。一天只算第一場的成績，打完可以分享、上排行榜。</p>
          <p className="pm-small">標準規則、普通難度，不能用商店買的絕招補給。</p>
          {playedToday && (
            <>
              <p className="pm-played">
                今天已經打過：第 {playedToday.place} 名、{fmt(playedToday.points)} 分。再打一次不計分。
              </p>
              <DailyBoard date={d.date} />
            </>
          )}
        </div>
      ) : (
        <>
          {firstTime && (
            <button type="button" className={cls('pm-guided', guided && 'on')} aria-pressed={guided} onClick={() => setGuided(!guided)}>
              <span className="check" aria-hidden="true" />
              <span>
                <b>引導局</b>
                <small>第一次玩？一步一步教你：怎麼打牌、吃碰、聽牌、胡。對手放水、不計時。</small>
              </span>
            </button>
          )}
          {!guided && (
            <div className="pm-diff">
              <div className="seg" role="group" aria-label="難度">
                {LEVELS.map((lv) => (
                  <button key={lv} type="button" aria-pressed={diff === lv} onClick={() => setDiff(lv)}>
                    {M.DIFFICULTY[lv].name}
                  </button>
                ))}
              </div>
              <p className="pm-small">
                {M.DIFFICULTY[diff].desc}
                {M.DIFFICULTY[diff].coins !== 1 ? `。金幣 ×${M.DIFFICULTY[diff].coins}` : ''}
              </p>
            </div>
          )}
        </>
      )}

      {saved && (
        <p className="pm-warn" role="alert">
          你還有一場「{STAGES[saved.stage].name}」打到第 {saved.handNo} 局。開新的一場，那一場就沒了。
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => openStage(null)}>
          取消
        </button>
        {saved && (
          <button type="button" className="btn" onClick={resume}>
            繼續那一場
          </button>
        )}
        <button type="button" className="btn primary" onClick={go}>
          {saved ? '放棄那場，開新的' : '開打'}
        </button>
      </div>
    </div>
  )
}
