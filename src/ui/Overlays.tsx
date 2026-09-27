import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { CHARACTERS } from '../engine/characters'
import * as M from '../engine/match'
import { LADDER, SKINS, STAGES, TOURNEY } from '../engine/stages'
import { share, shareText } from '../daily'
import * as P from '../progress'
import { canReplay, TURN_TIMES, useUI } from '../store'
import { LEVEL_UNLOCKS } from '../stories'
import { speak } from '../voice'
import { sfx } from '../sfx'
import { cls, CountUp, fmt, Tile } from './bits'
import { bigHand, CUT_IN_MS, useStagger } from './Celebrate'
import { DailyBoard } from './DailyBoard'
import { BackupTab } from './Backup'
import { isFriend, SeatFace, seatName } from './seat'

const nameOf = seatName

// 回放不常用：按了才下載
const ReplayPanel = lazy(() => import('./Replay').then((m) => ({ default: m.ReplayPanel })))

export function Face({ m, seat, size = 34 }: { m: M.MatchState; seat: number; size?: number }) {
  return <SeatFace m={m} seat={seat} size={size} />
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
  const r = m.result
  const main = r ? (M.winsOf(r).find((x) => x.seat === 0) ?? r.win) : null
  const big = main ? bigHand(main.score) : null
  const ready = useDelay(big ? CUT_IN_MS + 200 : 1300)
  if (!ready || !r) return null
  return <HandEndPanel m={m} r={r} />
}

const tick = (i: number) => sfx.tick(i)

function HandEndPanel({ m, r }: { m: M.MatchState; r: M.HandResult }) {
  const next = useUI((s) => s.nextHand)
  // 連線：你按過了，等其他人
  const waiting = useUI((s) => !!s.online?.ready.includes(0))
  const review = useUI((s) => s.review)
  const rivalNotes = useUI((s) => s.rivalNotes)
  const [showReview, setShowReview] = useState(false)
  const [showReplay, setShowReplay] = useState(false)
  const replayable = canReplay(m)
  const wins = M.winsOf(r)
  // 一炮多響：你有胡就先看你的
  const w = wins.find((x) => x.seat === 0) ?? r.win
  const others = wins.filter((x) => x !== w)
  const cap = M.rulesOf(m).streakCap
  const last = M.matchOverAfter(m)
  const myDiscards = m.hand.seats[0].discards.length
  useEffect(() => {
    // 看覆盤、回放的時候 Enter 不要跳下一局
    if (showReview || showReplay) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) next()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [next, showReview, showReplay])
  const seats = [0, 1, 2, 3]
  // 莊家台只算在跟莊家有關的那筆（莊家胡、莊家放槍、或自摸時莊家也要付）
  const dealerIn = !!w && !!r.dealerItems && (w.seat === r.dealer || w.from === null || w.from === r.dealer)
  const items = w ? [...w.score.items, ...(dealerIn ? r.dealerItems! : []).map((x) => ({ ...x, dealer: true }))] : []
  // 台數一項一項亮，亮完再亮每家輸贏
  const { shown, all } = useStagger(items.length + 1, 350, 160, tick)
  const done = shown > items.length
  const taiSoFar = (w ? w.score.items : []).slice(0, shown).reduce((s, x) => s + x.tai, 0)
  useEffect(() => {
    if (done && r.deltas[0] !== 0) sfx.coin()
  }, [done, r.deltas])

  if (showReview) return <ReviewPanel onBack={() => setShowReview(false)} />
  if (showReplay)
    return (
      <Suspense fallback={null}>
        <ReplayPanel m={m} onBack={() => setShowReplay(false)} />
      </Suspense>
    )

  return (
    <div className="overlay" onClick={all}>
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
                <p>
                  {w.from === null ? (w.score.items.some((x) => x.name === '八仙過海') ? '八張花到齊，三家都要付' : '三家都要付') : `${nameOf(m, w.from)}放槍`}
                  {w.score.items.some((x) => x.name === '搶槓') ? '（搶槓）' : ''}
                  {w.score.items.some((x) => x.name === '七搶一') ? '（七搶一：搶了第八張花）' : ''}
                </p>
              </div>
              <span className="total-tai">
                <b key={taiSoFar} className="bump">
                  {taiSoFar}
                </b>
                台{dealerIn ? <small>＋莊家台</small> : null}
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
              {items.slice(0, shown).map((it, i) => (
                <li key={i} className={cls('pop-in', 'dealer' in it && 'dealer-item', it.tai >= 4 && 'big')}>
                  {it.name}
                  <b>{it.tai}</b>
                </li>
              ))}
              {items.length === 0 && <li className="none">沒有台（只算底）</li>}
            </ul>
            {others.length > 0 && (
              <p className="also-won">
                一炮多響：{others.map((x) => `${nameOf(m, x.seat)} ${x.score.total} 台`).join('、')}也胡了
              </p>
            )}
          </>
        ) : (
          <header className="result-head">
            <span className="stamp-small">流</span>
            <div>
              <h2>流局</h2>
              <p>牌摸完了，沒人胡。{cap > 0 && m.streak >= cap ? `莊家連到上限（連 ${cap}），換莊。` : '莊家連莊。'}</p>
            </div>
          </header>
        )}
        {r.extras?.length || rivalNotes.length ? (
          <div className="extras">
            {(r.extras ?? []).map((x, i) => (
              <span key={i} className="extra">
                {x.label}
                {x.coins ? <b>+{x.coins} 金幣</b> : null}
              </span>
            ))}
            {rivalNotes.map((ev) => (
              <span key={`${ev.kind}${ev.seat}`} className={cls('extra', 'rival-note', ev.kind)}>
                {ev.kind === 'revenge'
                  ? `報仇成功！${nameOf(m, ev.seat)}付錢給你了`
                  : ev.kind === 'new'
                    ? `${nameOf(m, ev.seat)}成了你的宿敵（放槍給他 ${ev.n} 次）。讓他付錢給你就能報仇`
                    : `又放槍給宿敵${nameOf(m, ev.seat)}（第 ${ev.n} 次）`}
                {ev.coins ? <b>+{ev.coins} 金幣</b> : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className={cls('deltas', !done && 'waiting')}>
          {seats.map((s) => (
            <div key={s} className={cls('delta', r.deltas[s] > 0 && 'up', r.deltas[s] < 0 && 'down')}>
              <Face m={m} seat={s} size={26} />
              <span className="d-name">{nameOf(m, s)}</span>
              <b>{done ? <CountUp value={r.deltas[s]} signed ms={600} /> : '　'}</b>
            </div>
          ))}
        </div>
        <div className="result-actions">
          {w && w.seat === 0 && !m.spectator && (
            <button type="button" className={cls('btn', 'brag-btn', w.score.total >= 4 && 'big')} onClick={() => useUI.getState().brag(P.snapOf(m, w))}>
              炫耀卡
            </button>
          )}
          {replayable && (
            <button type="button" className="btn replay-btn" onClick={() => setShowReplay(true)}>
              回放
            </button>
          )}
          {review.length > 0 ? (
            <button type="button" className="btn review-btn" onClick={() => setShowReview(true)}>
              教練覆盤<b>{review.length}</b>
            </button>
          ) : (
            myDiscards >= 4 && !m.spectator && <span className="coach-ok">教練：這一局打得很穩</span>
          )}
          {m.spectator ? (
            <button type="button" className="btn primary" disabled>
              觀戰中：等大家按下一局
            </button>
          ) : m.online && waiting ? (
            <button type="button" className="btn primary" disabled>
              等其他人按下一局
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={next}>
              {last ? '看最後結果' : '下一局'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const REASON = { speed: '差一步', uke: '進張少', defense: '危險牌' } as const

/** 教練覆盤：這一局最值得檢討的 1–3 張 */
function ReviewPanel({ onBack }: { onBack: () => void }) {
  const review = useUI((s) => s.review)
  const setLearn = useUI((s) => s.setLearn)
  return (
    <div className="overlay">
      <div className="panel result review" role="dialog" aria-label="教練覆盤">
        <header className="review-head">
          <h2>教練覆盤</h2>
          <p>這一局有 {review.length} 張可以打得更好。紅框是你打的，綠框是教練建議的。</p>
        </header>
        <ol className="notes">
          {review.map((n) => (
            <li key={n.turn} className={cls(n.dealtIn && 'dealt-in')}>
              <div className="note-top">
                <span className="note-turn">第 {n.turn} 張</span>
                <span className={cls('note-tag', n.reason)}>{n.dealtIn ? '放槍' : REASON[n.reason]}</span>
                <span className="note-hand">
                  {n.hand.map((k, i) => (
                    <Tile key={i} kind={k} w={17} hot={k === n.kind && n.hand.indexOf(k) === i} mark={k === n.better && n.hand.indexOf(k) === i} />
                  ))}
                </span>
              </div>
              <p>
                {n.dealtIn ? '這張放槍了。' : ''}
                {n.text}
              </p>
              <button type="button" className="lesson-link" onClick={() => setLearn('tips', { ch: n.lesson.ch, i: n.lesson.i })}>
                看教學：{n.lesson.title}
              </button>
            </li>
          ))}
        </ol>
        <div className="result-actions">
          <button type="button" className="btn primary" onClick={onBack}>
            回到結果
          </button>
        </div>
      </div>
    </div>
  )
}

export function MatchEnd({ m }: { m: M.MatchState }) {
  const start = useUI((s) => s.startStage)
  const toHome = useUI((s) => s.toHome)
  const { leaveRoom, roomSend } = useUI.getState()
  const isHost = useUI((s) => !!s.online?.room?.players[s.online.room.you]?.host)
  const order = M.ranking(m)
  const first = order[0] === 0
  const q = finalWord(m)
  useEffect(() => {
    if (q) speak(m.chars[q.seat], `line.${q.key}.0`)
    // 只在結束畫面出現時講一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const stage = STAGES[m.stage]
  const hasNext = m.stage + 1 < LADDER.length
  const place = order.indexOf(0) + 1
  const showToast = useUI((s) => s.showToast)
  const doShare = async () => {
    const r = await share(shareText(m, useUI.getState().settings.name))
    if (r === 'copied') showToast('戰績複製好了，貼給朋友吧')
    else if (r === 'failed') showToast('這個瀏覽器不能分享')
  }
  const sv = useUI((s) => s.rewards?.survival)
  const svBest = useUI((s) => s.progress.survivalBest)
  const svRun = useUI((s) => s.progress.survivalRun)
  const svNext = svRun ? M.survivalStage(svRun.level, LADDER.length) : null
  const tr = useUI((s) => s.rewards?.tourney)
  const nextEvent = tr ? TOURNEY[tr.event] : undefined
  const title = tr
    ? tr.champion
      ? '全國錦標賽冠軍！'
      : tr.won
        ? `晉級！${stage.name}拿第一`
        : `第 ${place} 名，止步${stage.name}`
    : m.survival && sv
    ? sv.out
      ? `生存模式結束：撐過 ${sv.stages} 關`
      : `撐過第 ${sv.stages} 關！`
    : m.spectator
    ? `${nameOf(m, order[0])}拿第一！`
    : m.online
    ? first
      ? '你是這一桌的贏家！'
      : `第 ${place} 名`
    : m.daily
    ? `每日挑戰 ${m.daily.slice(5).replace('-', '/')}：第 ${place} 名`
    : m.blitz
    ? first
      ? '閃電局拿第一！'
      : `閃電局第 ${place} 名`
    : m.tutorial
      ? `引導局完成！第 ${place} 名`
      : first
        ? stage.id === 5
          ? '你是全國冠軍！'
          : stage.id === 3
            ? '你就是新的雀神！'
            : `過關！${stage.name}拿第一`
        : `第 ${place} 名`
  const sub = tr
    ? tr.champion
      ? '你打敗了賭神、賭俠、賭聖！'
      : tr.won
        ? `下一站：${nextEvent?.name ?? ''}`
        : '拿第一才能晉級。再挑戰一次，特別道具會重新發'
    : m.survival && sv
    ? sv.out
      ? sv.best
        ? '新紀錄！'
        : `最佳紀錄：撐過 ${svBest?.stages ?? 0} 關`
      : `本錢 ×${sv.ratio.toFixed(2)} 帶到下一關：${svNext ? STAGES[svNext.stage].name : ''}${svNext && svNext.loop > 1 ? '（高手難度）' : ''}`
    : m.spectator
    ? `觀戰・${stage.name}・${m.handNo} 局。房主再開一場時，有位子你就能一起打`
    : m.online
    ? `跟朋友連線・${stage.name}・${m.handNo} 局`
    : m.daily
    ? `${stage.name}・今天大家的牌都一樣`
    : m.blitz
    ? `${stage.name}・${m.handNo} 局打完。閃電局不算過關，要過關請打完整的一場`
    : m.tutorial
      ? `你已經會打了！之後每一步會計時、對手也不再放水${first && hasNext ? `。下一關：${STAGES[m.stage + 1].name}` : ''}`
      : first
        ? `解鎖桌布「${stage.reward.name}」${hasNext ? `，下一關：${STAGES[m.stage + 1].name}` : ''}`
        : '拿第一才能過關，再挑戰一次吧'
  return (
    <div className="overlay">
      <div className="panel final" role="dialog" aria-label="這一場的結果">
        <h2>{title}</h2>
        <p className="final-sub">{sub}</p>
        <div className="final-grid">
          <div>
            <ol className="podium">
              {order.map((s, i) => (
                <li key={s} className={cls(s === 0 && 'is-me')}>
                  <span className="rank">{i + 1}</span>
                  <Face m={m} seat={s} size={30} />
                  <span className="d-name">{nameOf(m, s)}</span>
                  <b>{fmt(m.points[s])}</b>
                </li>
              ))}
            </ol>
            {q && (
              <p className="quote">
                {nameOf(m, q.seat)}：「{q.text}」
              </p>
            )}
            <Affinity m={m} />
          </div>
          <div className="final-side">
            {m.daily && <DailyBoard m={m} />}
            <Rewards />
            {tr ? (
              <div className="final-actions">
                <button type="button" className="btn" onClick={toHome}>
                  回首頁
                </button>
                <button type="button" className="btn" onClick={doShare}>
                  分享
                </button>
                {tr.won && nextEvent ? (
                  <button type="button" className="btn primary" onClick={() => start(STAGES.indexOf(nextEvent))}>
                    下一站
                  </button>
                ) : (
                  <button type="button" className="btn primary" onClick={() => start(m.stage)}>
                    {tr.champion ? '再打一次' : '再挑戰'}
                  </button>
                )}
              </div>
            ) : m.survival ? (
              <div className="final-actions">
                <button type="button" className="btn" onClick={toHome}>
                  {sv?.out ? '回首頁' : '回首頁（保留進度）'}
                </button>
                <button type="button" className="btn" onClick={doShare}>
                  分享
                </button>
                {sv?.out ? (
                  <button type="button" className="btn primary" onClick={() => start(0, { survival: { level: 0, ratio: 1 } })}>
                    再挑戰一次
                  </button>
                ) : (
                  svRun && (
                    <button type="button" className="btn primary" onClick={() => start(0, { survival: svRun })}>
                      下一關
                    </button>
                  )
                )}
              </div>
            ) : m.online ? (
              <div className="final-actions">
                <button type="button" className="btn" onClick={leaveRoom}>
                  離開房間
                </button>
                {isHost && !m.spectator ? (
                  <button type="button" className="btn primary" onClick={() => roomSend({ t: 'again' })}>
                    再來一場
                  </button>
                ) : (
                  <span className="wait-host">等房主決定要不要再來一場</span>
                )}
              </div>
            ) : (
            <div className="final-actions">
              <button type="button" className="btn" onClick={toHome}>
                回首頁
              </button>
              <button type="button" className="btn" onClick={doShare}>
                分享
              </button>
              {m.daily ? null : m.blitz ? (
                <button type="button" className="btn primary" onClick={() => start(m.stage, { difficulty: m.difficulty, blitz: true })}>
                  再來一場閃電局
                </button>
              ) : first && hasNext ? (
                <button type="button" className="btn primary" onClick={() => start(m.stage + 1)}>
                  下一關
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => start(m.stage)}>
                  再打一場
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Rewards() {
  const rw = useUI((s) => s.rewards)
  if (!rw) return null
  const before = P.rankOf(rw.rankBefore)
  const after = P.rankOf(rw.rankAfter)
  const up = after.i > before.i
  const down = after.i < before.i
  return (
    <div className="rewards">
      <ul>
        {rw.r.lines.map((l, i) => (
          <li key={i}>
            {l.label}
            {l.coins > 0 && (
              <b>
                +<CountUp value={l.coins} ms={700} />
              </b>
            )}
          </li>
        ))}
        {rw.finished.map((f) => (
          <li key={f.id} className="mission-done">
            任務完成：{f.text}
            <small>回首頁領 +{f.reward}</small>
          </li>
        ))}
        {rw.tourney && rw.tourney.coins > 0 && (
          <li className="star-done">
            {rw.tourney.champion ? '全國冠軍獎金' : '晉級獎金'}
            <b>+{fmt(rw.tourney.coins)}</b>
          </li>
        )}
        {rw.survival && rw.survival.coins > 0 && (
          <li className="star-done">
            {rw.survival.out ? `生存模式撐過 ${rw.survival.stages} 關` : '生存模式晉級'}
            <b>+{rw.survival.coins}</b>
          </li>
        )}
        {(rw.stars ?? []).map((s) => (
          <li key={s.text} className="star-done">
            ★ {s.text}
            <b>+{s.coins}</b>
          </li>
        ))}
        {rw.unlocked.map((a) => (
          <li key={a.id} className="ach-done">
            成就：{a.name}
            <small>{a.desc}</small>
          </li>
        ))}
      </ul>
      <p className={cls('rank-change', up && 'up', down && 'down')}>
        段位 {rw.r.rankDelta >= 0 ? `+${rw.r.rankDelta}` : `−${-rw.r.rankDelta}`}
        {up ? `，升上${after.name}！` : down ? `，掉回${after.name}` : `（${after.name}）`}
      </p>
    </div>
  )
}

/** 這一場每個對手加了多少好感度；升級的話說解鎖了什麼 */
function Affinity({ m }: { m: M.MatchState }) {
  const rw = useUI((s) => s.rewards)
  const setPeople = useUI((s) => s.setPeople)
  if (!rw) return null
  return (
    <div className="affinity-gains" aria-label="好感度">
      {[1, 2, 3].map((seat) => {
        const id = m.chars[seat]
        const up = rw.levelUps.find((x) => x.id === id)
        return (
          <button key={seat} type="button" className={cls('gain', up && 'up')} onClick={() => setPeople(id)}>
            <Face m={m} seat={seat} size={24} />
            <span>
              <b>好感 +{rw.gains[id] ?? 0}</b>
              {up && <small>Lv{up.lv} {LEVEL_UNLOCKS[up.lv]}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 最後一句：你拿第一，墊底的對手認輸；你沒拿第一，第一名的對手得意一下 */
function finalWord(m: M.MatchState): { seat: number; key: 'matchWin' | 'matchLose'; text: string } | null {
  const order = M.ranking(m)
  const seat = order[0] === 0 ? order[order.length - 1] : order[0]
  if (seat === 0 || isFriend(m, seat)) return null
  const key = order[0] === 0 ? 'matchLose' : 'matchWin'
  const text = CHARACTERS[m.chars[seat]]?.lines[key]?.[0]
  return text ? { seat, key, text } : null
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
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

/** 名字最多幾個字（牌桌上的名牌放得下） */
export const NAME_MAX = 8

/** 第一次打開：問你叫什麼名字（可以跳過，之後在設定裡改） */
export function NameSheet() {
  const open = useUI((s) => s.nameSheet)
  const saved = useUI((s) => s.settings.name)
  const { setNameSheet, setSettings } = useUI.getState()
  const [name, setName] = useState(saved)
  if (!open) return null
  const done = (n: string) => {
    setSettings({ name: n.trim().slice(0, NAME_MAX), nameAsked: true })
    setNameSheet(false)
  }
  return (
    <Sheet open onClose={() => done(saved)} label="你的名字">
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault()
          done(name)
        }}
      >
        <h3>你叫什麼名字？</h3>
        <p className="help-lead">牌桌上、結算和排行榜會用這個名字。之後可以在「設定 → 遊戲」改。</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder="小明" aria-label="你的名字" autoFocus />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => done(saved)}>
            先跳過
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            好
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function Vol({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="row vol">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label={label} />
      <small>{value > 0 ? `${Math.round(value * 100)}` : '關'}</small>
    </label>
  )
}

export function Menu() {
  const open = useUI((s) => s.menu)
  const settings = useUI((s) => s.settings)
  const progress = useUI((s) => s.progress)
  const screen = useUI((s) => s.screen)
  const inMatch = useUI((s) => !!s.match && s.screen === 'match')
  const { setMenu, setSettings, setLearn, toHome, setSkin } = useUI.getState()
  const inRoom = useUI((s) => !!s.online)
  const watching = useUI((s) => s.online?.room?.you === -1)
  const tab = useUI((s) => s.menuTab)
  const setTab = useUI((s) => s.setMenuTab)
  const rules = settings.rules
  const setRules = (r: Partial<typeof rules>) => setSettings({ rules: { ...rules, ...r } })
  const desktop = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches
  return (
    <Sheet open={open} onClose={() => setMenu(false)} label="選單">
      <nav className="menu-tabs" aria-label="設定分類">
        {(
          [
            ['sound', '聲音'],
            ['game', '遊戲'],
            ['rules', '牌桌規則'],
            ['save', '存檔'],
          ] as const
        ).map(([id, name]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === 'sound' && (
        <div className="settings">
          <Vol label="音效" value={settings.sfxVol} onChange={(v) => setSettings({ sfxVol: v })} />
          <Vol label="配音（報牌、喊牌、台詞）" value={settings.voiceVol} onChange={(v) => setSettings({ voiceVol: v })} />
          <Vol label="背景音樂" value={settings.musicVol} onChange={(v) => setSettings({ musicVol: v })} />
          <label className="row">
            <span>你的聲音</span>
            <button type="button" className="toggle on-both" onClick={() => setSettings({ myVoice: settings.myVoice === 'f' ? 'm' : 'f' })}>
              {settings.myVoice === 'f' ? '女聲' : '男聲'}
            </button>
          </label>
        </div>
      )}
      {tab === 'game' && (
        <div className="settings">
          <label className="row">
            <span>你的名字</span>
            <input
              className="text-input"
              value={settings.name}
              onChange={(e) => setSettings({ name: e.target.value.slice(0, NAME_MAX), nameAsked: true })}
              maxLength={NAME_MAX}
              placeholder="小明"
              aria-label="你的名字"
            />
          </label>
          <div className="row">
            <span>你的出牌時間</span>
            <div className="seg" role="group" aria-label="出牌時間">
              {TURN_TIMES.map((t) => (
                <button key={t} type="button" aria-pressed={settings.turnTime === t} onClick={() => setSettings({ turnTime: t })}>
                  {t}秒
                </button>
              ))}
            </div>
          </div>
          <label className="row">
            <span>電腦出牌速度</span>
            <button type="button" className="toggle" aria-pressed={settings.fast} onClick={() => setSettings({ fast: !settings.fast })}>
              {settings.fast ? '快' : '正常'}
            </button>
          </label>
          <label className="row">
            <span>開局擲骰子</span>
            <button type="button" className="toggle" aria-pressed={settings.dice} onClick={() => setSettings({ dice: !settings.dice })}>
              {settings.dice ? '開' : '關'}
            </button>
          </label>
          <label className="row">
            <span>提示（打哪張會聽）</span>
            <button type="button" className="toggle" aria-pressed={settings.hints} onClick={() => setSettings({ hints: !settings.hints })}>
              {settings.hints ? '開' : '關'}
            </button>
          </label>
          <label className="row">
            <span>危險牌提示（有人快胡時標「危」「安」）</span>
            <button type="button" className="toggle" aria-pressed={settings.danger} onClick={() => setSettings({ danger: !settings.danger })}>
              {settings.danger ? '開' : '關'}
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
          {desktop && (
            <p className="keys-help">
              鍵盤：<kbd>←</kbd>
              <kbd>→</kbd> 選牌、<kbd>Enter</kbd> 打出、<kbd>H</kbd> 胡／自摸、<kbd>P</kbd> 碰、<kbd>C</kbd> 吃、<kbd>K</kbd> 槓、<kbd>X</kbd> 過、<kbd>Esc</kbd> 選單
            </p>
          )}
        </div>
      )}
      {tab === 'save' && <BackupTab />}
      {tab === 'rules' && (
        <div className="settings">
          <div className="row">
            <span>
              兩家以上胡同一張
              <small>截胡：只算照順序最近的那家</small>
            </span>
            <div className="seg" role="group" aria-label="兩家以上胡同一張">
              <button type="button" aria-pressed={!rules.multiRon} onClick={() => setRules({ multiRon: false })}>
                截胡
              </button>
              <button type="button" aria-pressed={rules.multiRon} onClick={() => setRules({ multiRon: true })}>
                一炮多響
              </button>
            </div>
          </div>
          <label className="row">
            <span>
              過水
              <small>放過能胡的牌，摸牌前都不能胡別人打的</small>
            </span>
            <button type="button" className="toggle" aria-pressed={rules.passWin} onClick={() => setRules({ passWin: !rules.passWin })}>
              {rules.passWin ? '開' : '關'}
            </button>
          </label>
          <div className="row">
            <span>
              連莊上限
              <small>連到上限就換莊</small>
            </span>
            <div className="seg" role="group" aria-label="連莊上限">
              {[0, 3, 5].map((n) => (
                <button key={n} type="button" aria-pressed={rules.streakCap === n} onClick={() => setRules({ streakCap: n })}>
                  {n ? `連 ${n}` : '不限'}
                </button>
              ))}
            </div>
          </div>
          <p className="rules-note">
            搶槓胡、七搶一一定算。{inMatch ? '改了規則從下一場開始生效；' : ''}每日挑戰固定用預設規則（截胡、過水、不限連莊）。
          </p>
        </div>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => setLearn('rules')}>
          台數規則
        </button>
        <button type="button" className="btn" onClick={() => setLearn('tips')}>
          胡牌技巧
        </button>
        {screen === 'home' && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMenu(false)
              useUI.getState().setNews(true)
            }}
          >
            有什麼新東西
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setMenu(false)
            useUI.getState().setCalc(true)
          }}
        >
          算台記帳
        </button>
        {screen === 'match' && !inRoom && (
          <button type="button" className="btn" onClick={toHome}>
            回首頁（保留這一場）
          </button>
        )}
        {inRoom && (
          <button type="button" className="btn" onClick={() => useUI.getState().leaveRoom()}>
            {watching ? '離開觀戰' : '離開房間（電腦幫你打完）'}
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => setMenu(false)}>
          {screen === 'match' ? '繼續' : '好'}
        </button>
      </div>
    </Sheet>
  )
}

export function Missions() {
  const open = useUI((s) => s.missions)
  const progress = useUI((s) => s.progress)
  const setMissions = useUI((s) => s.setMissions)
  const claimMission = useUI((s) => s.claimMission)
  const ids = progress.daily?.ids ?? []
  return (
    <Sheet open={open} onClose={() => setMissions(false)} label="今日任務">
      <h3>今日任務</h3>
      <p className="help-lead">每天換三個。完成後在這裡領金幣。</p>
      <ul className="missions">
        {ids.map((id) => {
          const st = P.missionState(progress, id)
          return (
            <li key={id} className={cls(st.done && 'done', st.claimed && 'claimed')}>
              <div className="m-text">
                <span>{st.def.text}</span>
                <span className="m-bar" aria-hidden="true">
                  <i style={{ width: `${(st.n / st.def.goal) * 100}%` }} />
                </span>
                <small>
                  {st.n}/{st.def.goal}
                </small>
              </div>
              <button type="button" className="btn small" disabled={!st.done || st.claimed} onClick={() => claimMission(id)}>
                {st.claimed ? '已領' : <>領 {st.def.reward}</>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={() => setMissions(false)}>
          好
        </button>
      </div>
    </Sheet>
  )
}

export function Shop() {
  const open = useUI((s) => s.shop)
  const progress = useUI((s) => s.progress)
  const { setShop, buyBack, equipBack, buySupply } = useUI.getState()
  return (
    <Sheet open={open} onClose={() => setShop(false)} label="商店">
      <div className="shop-head">
        <h3>商店</h3>
        <span className="coin-chip">
          <span className="coin-dot" aria-hidden="true" />
          {fmt(progress.coins)}
        </span>
      </div>
      <h4 className="shop-sub">牌背</h4>
      <div className="backs">
        {P.BACKS.map((b) => {
          const owned = progress.backs.includes(b.id)
          const on = progress.back === b.id
          return (
            <button
              key={b.id}
              type="button"
              className={cls('back-item', on && 'on')}
              onClick={() => (owned ? equipBack(b.id) : buyBack(b.id))}
              disabled={!owned && progress.coins < b.price}
            >
              <span className="back-preview" style={{ background: b.bg, boxShadow: `inset 0 0 0 2px ${b.ring}` }} />
              <span className="back-name">{b.name}</span>
              <small>{on ? '使用中' : owned ? '換上' : `${fmt(b.price)} 金幣`}</small>
            </button>
          )
        })}
      </div>
      <h4 className="shop-sub">絕招補給（下一場多一次）</h4>
      <div className="supplies">
        {P.SUPPLY.map((x) => (
          <button key={x.id} type="button" className="supply" onClick={() => buySupply(x.id)} disabled={progress.coins < x.price}>
            <b>{M.SKILLS[x.id].name} +1</b>
            <small>{M.SKILLS[x.id].desc}</small>
            <span>
              {fmt(x.price)} 金幣{progress.bonus[x.id] ? `・已備 ${progress.bonus[x.id]}` : ''}
            </span>
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={() => setShop(false)}>
          關閉
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
