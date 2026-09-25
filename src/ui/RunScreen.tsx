import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { BOSSES } from '../engine/bosses'
import { canDiscard, describeSelection, MAX_DISCARD_TILES, roundTitle, targetFor, WIND_NAME } from '../engine/game'
import { MAX_GODS } from '../engine/gods'
import { MAX_ITEMS } from '../engine/items'
import type { Meld } from '../engine/melds'
import { PATTERN } from '../engine/patterns'
import { scoreHand } from '../engine/scoring'
import type { RoundState, RunState, Step } from '../engine/types'
import { useUI } from '../store'
import { Coin, CountUp, EmptySlot, fmt, fmtMult, GodPlaque, ItemSlip, Price, TileView, cls, useViewportHeight, useWidth } from './bits'
import { GameOver, Victory } from './Screens'
import { nextPos, ShopView } from './Shop'

export function RunScreen() {
  const run = useUI((s) => s.run)
  if (!run) return null
  const wind = (run.round?.wind ?? run.wind) % 4
  return (
    <div className="run" data-wind={wind}>
      <TopBar run={run} />
      {(run.phase === 'round' || run.phase === 'cashout') && run.round && <RoundView run={run} round={run.round} />}
      {run.phase === 'shop' && <ShopView run={run} />}
      {run.phase === 'gameover' && <GameOver run={run} />}
      {run.phase === 'victory' && <Victory run={run} />}
    </div>
  )
}

function TopBar({ run }: { run: RunState }) {
  const setMenu = useUI((s) => s.setMenu)
  const round = run.round
  const wind = round?.wind ?? run.wind
  const next = nextPos(run)
  const inShop = run.phase === 'shop' && !(next.wind === 4 && !run.endless)
  const title = round ? roundTitle(round.wind, round.no) : inShop ? `下一局：${roundTitle(next.wind, next.no)}` : roundTitle(run.wind, run.no)
  return (
    <header className="topbar">
      <span className="wind-seal" aria-hidden="true">
        {WIND_NAME[wind % 4]}
      </span>
      <div className="topbar-title">
        <span className="round-name">{title}</span>
        {round && run.phase === 'round' && <span className="round-target">目標 {fmt(round.target)}</span>}
        {inShop && <span className="round-target">目標 {fmt(targetFor(run, next.wind, next.no))}</span>}
      </div>
      <span className="coins" aria-label={`銅錢 ${run.coins} 枚`}>
        <Coin size={18} />
        <CountUp value={run.coins} />
      </span>
      <button type="button" className="menu-btn" onClick={() => setMenu(true)} aria-label="選單">
        <span />
        <span />
        <span />
      </button>
    </header>
  )
}

/** 計分動畫：照著引擎給的步驟一格一格播，播完呼叫 resolve */
function useScoreDriver(round: RoundState) {
  const seq = useUI((s) => s.seq)
  const speed = useUI((s) => s.settings.speed)
  const advance = useUI((s) => s.advance)
  const resolve = useUI((s) => s.resolve)
  const steps = round.score?.steps
  const scoring = round.status !== 'play'
  useEffect(() => {
    if (!scoring || !steps) return
    let delay: number
    if (seq < 0) delay = 760
    else if (seq < steps.length) {
      const s = steps[seq]
      delay = s.t === 'meld' ? 200 : s.t === 'tile' ? 115 : s.t === 'pattern' ? 430 : s.tileId ? 150 : 420
    } else delay = 1500
    const id = window.setTimeout(seq >= steps.length ? resolve : advance, delay / speed)
    return () => window.clearTimeout(id)
  }, [scoring, steps, seq, speed, advance, resolve])
}

function currentStep(round: RoundState, seq: number): Step | null {
  const steps = round.score?.steps
  return steps && seq >= 0 && seq < steps.length ? steps[seq] : null
}

function RoundView({ run, round }: { run: RunState; round: RoundState }) {
  useScoreDriver(round)
  const seq = useUI((s) => s.seq)
  const step = currentStep(round, seq)
  const [quake, setQuake] = useState(false)
  const done = !!round.score && seq >= round.score.steps.length
  const big = done && round.score!.score >= round.target * 0.6
  useEffect(() => {
    if (!big) return
    setQuake(true)
    const id = window.setTimeout(() => setQuake(false), 450)
    return () => window.clearTimeout(id)
  }, [big])

  return (
    <main className={cls('round', quake && 'quake')}>
      {round.boss && <BossStrip id={round.boss} />}
      <ScorePanel run={run} round={round} seq={seq} />
      <Shrine run={run} step={step} />
      <TableArea round={round} seq={seq} step={step} />
      <HandArea round={round} />
      <ActionBar run={run} round={round} />
      <AnimatePresence>{run.phase === 'cashout' && <CashoutPanel run={run} round={round} />}</AnimatePresence>
    </main>
  )
}

function BossStrip({ id }: { id: string }) {
  const setInfo = useUI((s) => s.setInfo)
  const b = BOSSES[id]
  return (
    <button type="button" className="boss-strip" onClick={() => setInfo({ kind: 'boss' })}>
      <span className="boss-name">魔王・{b.name}</span>
      <span className="boss-desc">{b.desc}</span>
    </button>
  )
}

function ScorePanel({ run, round, seq }: { run: RunState; round: RoundState; seq: number }) {
  const score = round.score
  const scoring = round.status !== 'play' && !!score
  // 沒在計分時，顯示桌上已出的牌值多少分（流局時就是這個數）
  const tableChips = useMemo(() => (round.status === 'play' ? scoreHand(run, round, 'draw').chips : 0), [run, round])

  let chips: number | null = tableChips
  let mult: number | null = null
  let patterns: { id: string; name: string; mult: number; count: number }[] = []
  if (scoring) {
    const upto = Math.min(seq, score.steps.length - 1)
    const s = upto >= 0 ? score.steps[upto] : null
    chips = s ? s.c : 0
    mult = s ? s.m : 1
    patterns = score.steps
      .slice(0, upto + 1)
      .filter((x): x is Extract<Step, { t: 'pattern' }> => x.t === 'pattern')
      .map((x) => ({ id: x.id, name: PATTERN[x.id].name, mult: x.mult, count: x.count }))
  }
  const done = scoring && seq >= score.steps.length
  const pct = Math.min(100, (round.total / round.target) * 100)

  return (
    <section className="score-panel" aria-live="polite">
      <div className="total-row">
        <span className="total-label">本局</span>
        <CountUp value={round.total} className="total-num" />
        <span className="total-target">／{fmt(round.target)}</span>
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="calc">
        <span className={cls('box chips', scoring && 'live')}>
          <small>分</small>
          <b>{chips === null ? '—' : fmt(chips)}</b>
        </span>
        <span className="times">×</span>
        <span className={cls('box mult', scoring && 'live')}>
          <small>台</small>
          <b>{mult === null ? '—' : fmtMult(mult)}</b>
        </span>
        <span className={cls('eq', done && 'on')}>{done ? `＝ ${fmt(score.score)}` : ''}</span>
      </div>
      <div className="pattern-line">
        {scoring ? (
          score.kind === 'draw' ? (
            <span className="pat draw">流局：只算分，台數 1</span>
          ) : (
            patterns.map((p) => (
              <motion.span key={p.id} className="pat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {p.name}
                {p.count > 1 ? `×${p.count}` : ''} <em>+{p.mult}</em>
              </motion.span>
            ))
          )
        ) : (
          <span className="pat idle">
            {[
              round.hands ? `已胡 ${round.hands} 手` : '',
              round.table.melds.length || round.table.eye ? `桌上已有 ${fmt(tableChips)} 分，胡牌才算台` : '',
            ]
              .filter(Boolean)
              .join('。')}
          </span>
        )}
      </div>
    </section>
  )
}

function godBubble(step: Step | null, uid: number) {
  if (!step || step.t !== 'god' || step.uid !== uid) return null
  const text = step.xmult ? `×${step.xmult}` : step.mult ? `+${step.mult}台` : step.coins ? `+${step.coins}錢` : `+${step.chips}分`
  const kind = step.xmult || step.mult ? 'mult' : step.coins ? 'coins' : 'chips'
  return (
    <span key={`${uid}-${step.c}-${step.m}`} className={cls('bubble', kind)}>
      {text}
    </span>
  )
}

export function Shrine({ run, step = null }: { run: RunState; step?: Step | null }) {
  const setInfo = useUI((s) => s.setInfo)
  return (
    <section className="shrine" aria-label="神龕與符袋">
      <div className="gods">
        {Array.from({ length: MAX_GODS }, (_, i) => {
          const g = run.gods[i]
          return g ? (
            <GodPlaque
              key={g.uid}
              id={g.id}
              active={step?.t === 'god' && step.uid === g.uid}
              bubble={godBubble(step, g.uid)}
              onClick={() => setInfo({ kind: 'god', uid: g.uid })}
            />
          ) : (
            <EmptySlot key={`e${i}`} kind="plaque" />
          )
        })}
      </div>
      <div className="items">
        {Array.from({ length: MAX_ITEMS }, (_, i) => {
          const it = run.items[i]
          return it ? (
            <ItemSlip key={it.uid} id={it.id} onClick={() => setInfo({ kind: 'item', uid: it.uid })} />
          ) : (
            <EmptySlot key={`e${i}`} kind="slip" />
          )
        })}
      </div>
    </section>
  )
}

function floatFor(step: Step | null, tileId: number, seq: number) {
  if (!step) return null
  if (step.t === 'tile' && step.id === tileId) {
    if (step.debuff) return <span key={seq} className="float debuff">不計分</span>
    return (
      <span key={seq} className={cls('float', step.mult ? 'mult' : 'chips')}>
        {step.mult ? `+${step.mult}台` : `+${step.chips}`}
      </span>
    )
  }
  if (step.t === 'god' && step.tileId === tileId) {
    return (
      <span key={seq} className="float chips god">
        +{step.chips}
      </span>
    )
  }
  return null
}

function TableArea({ round, seq, step }: { round: RoundState; seq: number; step: Step | null }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const vh = useViewportHeight()
  const skip = useUI((s) => s.skip)
  const scoring = round.status !== 'play'
  // 矮的螢幕改三欄：面子 3＋1，雀頭和花排在第二列
  const compact = vh < 760
  const cols = compact ? 3 : 2
  const gap = 8
  const slotW = (w - (cols - 1) * gap) / cols
  const size = Math.max(18, Math.min(38, Math.floor((slotW - 18) / 4.2)))
  const done = !!round.score && seq >= round.score.steps.length

  const slot = (meld: Meld | null | undefined, i: number, label: string) => {
    const lit = step?.t === 'meld' && step.i === i
    return (
      <div key={i} className={cls('slot', i === 4 && 'eye', meld && 'filled', lit && 'lit')} style={{ minHeight: Math.round(size * 1.46 + 16) }}>
        {meld ? (
          <div className="slot-tiles">
            {meld.tiles.map((t) => {
              const tileStep = step && ((step.t === 'tile' && step.id === t.id) || (step.t === 'god' && step.tileId === t.id))
              const debuffed = !!round.score?.steps.some((s) => s.t === 'tile' && s.id === t.id && s.debuff)
              return (
                <TileView key={t.id} tile={t} size={size} fromHand pop={!!tileStep} dim={scoring && debuffed}>
                  {floatFor(step, t.id, seq)}
                </TileView>
              )
            })}
          </div>
        ) : (
          <span className="slot-label">{label}</span>
        )}
        {lit && step?.t === 'meld' && (
          <span key={seq} className={cls('float', step.debuff ? 'debuff' : 'chips', 'slot-float')}>
            {step.debuff ? '不計分' : `+${step.chips}`}
          </span>
        )}
      </div>
    )
  }

  const flowers =
    round.flowers.length > 0 ? (
      <div className="flowers" aria-label="花牌">
        {round.flowers.map((t) => (
          <TileView key={t.id} tile={t} size={Math.round(size * 0.8)} />
        ))}
      </div>
    ) : null

  return (
    <section className={cls('table', scoring && 'scoring')} ref={ref} onClick={scoring ? skip : undefined} aria-label="桌面">
      <div className="slots" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
        {[0, 1, 2, 3].map((i) => slot(round.table.melds[i], i, '面子'))}
        {compact ? (
          <>
            {slot(round.table.eye, 4, '雀頭')}
            {flowers ?? <span />}
          </>
        ) : (
          <div className="eye-row">
            {slot(round.table.eye, 4, '雀頭')}
            {flowers}
          </div>
        )}
      </div>
      <AnimatePresence>
        {scoring && seq < 0 && (
          <motion.div
            key="seal"
            className={cls('seal-stamp', round.status === 'draw' && 'draw')}
            initial={{ scale: 2.6, opacity: 0, rotate: -16 }}
            animate={{ scale: 1, opacity: 1, rotate: -7 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 700, damping: 24 }}
          >
            {round.status === 'hu' ? '胡' : '流'}
          </motion.div>
        )}
        {done && round.score && (
          <motion.div
            key="burst"
            className="score-burst"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ y: -80, opacity: 0, scale: 0.6, transition: { duration: 0.35 } }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          >
            +{fmt(round.score.score)}
          </motion.div>
        )}
      </AnimatePresence>
      {scoring && <span className="skip-hint">點桌面快轉</span>}
    </section>
  )
}

function HandArea({ round }: { round: RoundState }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const vh = useViewportHeight()
  const sel = useUI((s) => s.sel)
  const toggle = useUI((s) => s.toggle)
  const lastAction = useUI((s) => s.lastAction)
  const playing = round.status === 'play'
  const gap = 5
  const n = Math.max(round.hand.length, round.handSize)
  let cols = n
  let size = (w - (cols - 1) * gap) / cols
  if (size < 46) {
    cols = Math.ceil(n / 2)
    size = (w - (cols - 1) * gap) / cols
  }
  size = Math.max(24, Math.min(60, Math.floor(vh * 0.075), Math.floor(size)))

  return (
    <section className="hand-wrap" ref={ref} aria-label="手牌">
      <div className="hand" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: `${gap + 6}px ${gap}px` }}>
        <AnimatePresence custom={lastAction} mode="popLayout">
          {round.hand.map((t) => (
            <TileView
              key={t.id}
              tile={t}
              size={size}
              selected={sel.includes(t.id)}
              onClick={playing ? () => toggle(t.id) : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

function ActionBar({ run, round }: { run: RunState; round: RoundState }) {
  const sel = useUI((s) => s.sel)
  const play = useUI((s) => s.play)
  const doDiscard = useUI((s) => s.discard)
  const clearSel = useUI((s) => s.clearSel)
  const playing = round.status === 'play' && run.phase === 'round'
  const desc = describeSelection(round, sel)
  const canPlay = playing && !!desc.type && desc.fits
  const discardOk = playing && canDiscard(run, round)
  const canDisc = discardOk && sel.length >= 1 && sel.length <= MAX_DISCARD_TILES
  const free = playing && !round.freeDiscardUsed && run.gods.some((g) => g.id === 'guanyin')

  let hint: string
  if (!playing) hint = run.phase === 'cashout' ? '' : '計分中'
  else if (sel.length === 0) hint = round.hands === 0 && round.table.melds.length === 0 ? '點牌選取，湊成順子、刻子或對子就能出牌' : '選牌出牌，或換掉不要的牌'
  else if (desc.type && !desc.fits) hint = desc.type === 'pair' ? '雀頭已經有了，這對要留著湊刻子' : '面子已經滿了，還差雀頭'
  else if (desc.type) hint = `${desc.name}，可以出`
  else if (sel.length > MAX_DISCARD_TILES) hint = `一次最多換 ${MAX_DISCARD_TILES} 張`
  else hint = `已選 ${sel.length} 張`

  const playLabel = desc.type && desc.fits ? (desc.type === 'pair' ? '放雀頭' : `出${desc.name}`) : '出牌'

  return (
    <section className="actions">
      <div className="hint-row">
        <span className="hint">{hint}</span>
        {sel.length > 0 && playing && (
          <button type="button" className="link" onClick={clearSel}>
            取消選取
          </button>
        )}
        <span className="pile">牌山 {round.pile.length}</span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn discard" disabled={!canDisc} onClick={doDiscard}>
          換牌
          <span className="count">{free ? '免' : round.discardsLeft}</span>
        </button>
        <button type="button" className="btn primary play" disabled={!canPlay} onClick={play}>
          {playLabel}
        </button>
      </div>
    </section>
  )
}

function CashoutPanel({ run, round }: { run: RunState; round: RoundState }) {
  const collect = useUI((s) => s.collect)
  const c = run.cashout
  if (!c) return null
  return (
    <motion.div
      className="cashout-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="cashout"
        role="dialog"
        aria-label="過關"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.15 }}
      >
        <div className="cashout-head">
          <span className="seal-small">過</span>
          <div>
            <h2>{roundTitle(round.wind, round.no)} 過關</h2>
            <p>
              胡了 {round.hands} 手，共 {fmt(round.total)} 分（目標 {fmt(round.target)}）
            </p>
          </div>
        </div>
        <ul className="cashout-lines">
          {c.lines.map((l, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.12 }}>
              <span>{l.label}</span>
              <Price n={l.coins} />
            </motion.li>
          ))}
        </ul>
        <button type="button" className="btn primary wide" onClick={collect}>
          收下 {c.total} 枚銅錢，去廟口
        </button>
      </motion.div>
    </motion.div>
  )
}
