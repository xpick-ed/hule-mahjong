// 開打前：選難度、第一次玩可以選引導局；有沒打完的一場時先確認（網頁版不能用 confirm()）。

import { useMemo, useState } from 'react'
import { CHARACTERS } from '../engine/characters'
import * as M from '../engine/match'
import { LADDER, STAGES, TOURNEY } from '../engine/stages'
import { dailyInfo } from '../daily'
import { STAR_GOALS, starsOf } from '../progress'
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
      {pm.tourney ? <TourneyBody first={pm.stage} /> : pm.survival ? <SurvivalBody /> : <PreMatchBody key={`${pm.stage}-${pm.daily ?? ''}`} stage={pm.stage} daily={pm.daily} />}
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

      {!d && STAR_GOALS[stage.id] && (
        <ul className="pm-goals" aria-label="這一關的三顆星">
          {STAR_GOALS[stage.id].map((g, i) => {
            const on = starsOf(progress, stage.id)[i]
            return (
              <li key={i} className={cls(on && 'on')}>
                <i aria-hidden="true">★</i>
                {g.text}
                {on && <small>已拿到</small>}
              </li>
            )
          })}
        </ul>
      )}
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

/** 生存模式：規則、紀錄、繼續上次的或重新開始 */
function SurvivalBody() {
  const progress = useUI((s) => s.progress)
  const { startStage, openStage, resume } = useUI.getState()
  const saved = useMemo(() => savedMatch(), [])
  const run = progress.survivalRun
  const best = progress.survivalBest
  const next = run ? M.survivalStage(run.level, LADDER.length) : null
  return (
    <div className="prematch">
      <header className="pm-head">
        <span className="pm-no">挑戰模式</span>
        <h3>生存模式</h3>
      </header>
      <ul className="survival-rules">
        <li>從第一關開始，一關打一場。</li>
        <li>打完的本錢照倍數帶到下一關：第一關打到 1.5 倍，下一關就從 1.5 倍開始。</li>
        <li>拿最後一名（或輸光）就結束。六關打完，下一輪變高手難度。</li>
      </ul>
      <p className="pm-meta">{best ? `最佳紀錄：撐過 ${best.stages} 關（${best.date}）` : '還沒有紀錄'}</p>
      {run && next && (
        <p className="pm-played">
          上次打到第 {run.level + 1} 關：{STAGES[next.stage].name}
          {next.loop > 1 ? `（第 ${next.loop} 輪，高手難度）` : ''}，本錢 ×{run.ratio.toFixed(2)}
        </p>
      )}
      {saved && (
        <p className="pm-warn" role="alert">
          你還有一場「{STAGES[saved.stage].name}」打到第 {saved.handNo} 局。開始生存模式，那一場就沒了。
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => openStage(null)}>
          取消
        </button>
        {saved?.survival && (
          <button type="button" className="btn" onClick={resume}>
            繼續那一場
          </button>
        )}
        <button type="button" className={run ? 'btn' : 'btn primary'} onClick={() => startStage(0, { survival: { level: 0, ratio: 1 } })}>
          {run ? '重新開始' : '開始挑戰'}
        </button>
        {run && (
          <button type="button" className="btn primary" onClick={() => startStage(0, { survival: run })}>
            繼續第 {run.level + 1} 關
          </button>
        )}
      </div>
    </div>
  )
}

/** 全國錦標賽：三站的路線、每站的對手和特別道具，選一站開打（沒晉級的站鎖住） */
function TourneyBody({ first }: { first: number }) {
  const progress = useUI((s) => s.progress)
  const { startStage, openStage, resume } = useUI.getState()
  const saved = useMemo(() => savedMatch(), [])
  const [pick, setPick] = useState(first)
  const stage = STAGES[pick]
  return (
    <div className="prematch">
      <header className="pm-head">
        <span className="pm-no">挑戰模式{progress.tourneyWins > 0 ? `・拿過 ${progress.tourneyWins} 次冠軍` : ''}</span>
        <h3>全國錦標賽</h3>
      </header>
      <p className="pm-small">每站打一場東風圈，拿第一才晉級下一站。每站兩個特別道具各用一次，每次開打重新發。對手一站比一站強。</p>
      <ol className="tourney-steps">
        {TOURNEY.map((t, k) => {
          const idx = STAGES.indexOf(t)
          const open = k <= progress.tourneyCleared
          const done = k < progress.tourneyCleared
          const stars = starsOf(progress, t.id)
          return (
            <li key={t.id}>
              <button type="button" className={cls('tourney-step', pick === idx && 'on', !open && 'locked')} disabled={!open} onClick={() => setPick(idx)}>
                <span className="ts-no">{k + 1}</span>
                <span className="ts-main">
                  <b>
                    {t.name}
                    {done && <em className="tag">已晉級</em>}
                    {!open && <em className="tag">上一站拿第一解鎖</em>}
                  </b>
                  <small>{t.opponents.map((id) => CHARACTERS[id].name).join('、')}</small>
                  <span className="ts-items">
                    {(t.items ?? []).map((id) => (
                      <span key={id} className="item-chip" title={M.SKILLS[id].desc}>
                        {M.SKILLS[id].name}
                      </span>
                    ))}
                    <span className="ts-stars" aria-label={`${stars.filter(Boolean).length} 顆星`}>
                      {stars.map((on, i) => (
                        <i key={i} className={cls(on && 'on')}>★</i>
                      ))}
                    </span>
                  </span>
                </span>
                <span className="ts-faces">
                  {t.opponents.map((id) => (
                    <Avatar key={id} look={lookFor(progress, id)} size={28} />
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {saved && (
        <p className="pm-warn" role="alert">
          你還有一場「{STAGES[saved.stage].name}」打到第 {saved.handNo} 局。開新的一場，那一場就沒了。
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => openStage(null)}>
          取消
        </button>
        {saved && STAGES[saved.stage].tournament && (
          <button type="button" className="btn" onClick={resume}>
            繼續那一場
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => startStage(pick)}>
          開打：{stage.name}
        </button>
      </div>
    </div>
  )
}
