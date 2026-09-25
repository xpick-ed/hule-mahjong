import { motion } from 'motion/react'
import { useMemo } from 'react'
import { roundTitle } from '../engine/game'
import { GODS } from '../engine/gods'
import type { RunState } from '../engine/types'
import { hasSave, useUI } from '../store'
import { fmt, TileStatic } from './bits'

const FAN = ['m1', 'p5', 's1', 'z5', 'z1', 's9', 'm9']

export function Title() {
  const newRun = useUI((s) => s.newRun)
  const resume = useUI((s) => s.resume)
  const setHelp = useUI((s) => s.setHelp)
  const canResume = useMemo(() => hasSave(), [])
  return (
    <main className="title">
      <div className="fan" aria-hidden="true">
        {FAN.map((k, i) => (
          <motion.span
            key={k}
            className="fan-tile"
            initial={{ y: 120, rotate: 0, opacity: 0 }}
            animate={{ y: Math.abs(i - 3) * 7, rotate: (i - 3) * 9, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
          >
            <TileStatic tile={{ kind: k }} size={46} />
          </motion.span>
        ))}
      </div>
      <motion.h1 initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7, duration: 0.5 }}>
        胡了
        <motion.span
          className="title-seal"
          initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ delay: 1.15, type: 'spring', stiffness: 600, damping: 22 }}
        >
          胡
        </motion.span>
      </motion.h1>
      <p className="tagline">誤闖神明的牌局。胡四圈，才回得了人間。</p>
      <div className="title-actions">
        <button type="button" className="btn primary wide" onClick={newRun}>
          開新的一輪
        </button>
        {canResume && (
          <button type="button" className="btn wide" onClick={resume}>
            繼續上一輪
          </button>
        )}
        <button type="button" className="btn ghost wide" onClick={() => setHelp(true)}>
          怎麼玩
        </button>
      </div>
    </main>
  )
}

function Stats({ run }: { run: RunState }) {
  return (
    <dl className="stats">
      <div>
        <dt>最高單手</dt>
        <dd>{fmt(run.stats.bestHand)}</dd>
      </div>
      <div>
        <dt>胡牌次數</dt>
        <dd>{run.stats.hus}</dd>
      </div>
      <div>
        <dt>過了幾局</dt>
        <dd>{run.stats.rounds}</dd>
      </div>
      <div>
        <dt>請過的神明</dt>
        <dd>{run.gods.length ? run.gods.map((g) => GODS[g.id].name).join('、') : '無'}</dd>
      </div>
    </dl>
  )
}

export function GameOver({ run }: { run: RunState }) {
  const newRun = useUI((s) => s.newRun)
  const toTitle = useUI((s) => s.toTitle)
  const round = run.round
  return (
    <main className="ending lose">
      <motion.span className="ending-seal" initial={{ scale: 2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
        流
      </motion.span>
      <h2>停在{roundTitle(run.wind, run.no)}</h2>
      {round && (
        <p>
          差 {fmt(Math.max(0, round.target - round.total))} 分：{fmt(round.total)}／{fmt(round.target)}
        </p>
      )}
      <Stats run={run} />
      <p className="seed">種子 {run.seed}</p>
      <div className="title-actions">
        <button type="button" className="btn primary wide" onClick={newRun}>
          再來一輪
        </button>
        <button type="button" className="btn ghost wide" onClick={toTitle}>
          回首頁
        </button>
      </div>
    </main>
  )
}

export function Victory({ run }: { run: RunState }) {
  const endless = useUI((s) => s.endless)
  const toTitle = useUI((s) => s.toTitle)
  return (
    <main className="ending win">
      <motion.span className="ending-seal" initial={{ scale: 2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
        歸
      </motion.span>
      <h2>回到人間了</h2>
      <p>東南西北四圈全勝。四方神獸讓開了路。</p>
      <Stats run={run} />
      <p className="seed">種子 {run.seed}</p>
      <div className="title-actions">
        <button type="button" className="btn primary wide" onClick={endless}>
          繼續打（無盡模式）
        </button>
        <button type="button" className="btn ghost wide" onClick={toTitle}>
          回首頁
        </button>
      </div>
    </main>
  )
}
