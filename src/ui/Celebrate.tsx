import { useEffect, useState } from 'react'
import * as M from '../engine/match'
import type { WinScore } from '../engine/scoring'
import { sfx } from '../sfx'
import { SeatFace, seatName } from './seat'

/** 大牌：有 4 台以上的牌型（碰碰胡、混一色、小三元……）就算，回傳要秀的名字 */
export function bigHand(score: WinScore): { title: string; tai: number } | null {
  const big = score.items.filter((x) => x.tai >= 4).sort((a, b) => b.tai - a.tai)
  if (!big.length) return null
  return { title: big.slice(0, 2).map((x) => x.name).join('・'), tai: score.total }
}

/** 大牌演出多長（毫秒），結算面板要等它播完 */
export const CUT_IN_MS = 2300

/** 大牌的全螢幕演出：斜斜的色帶掃進來、頭像放大、牌型名字砸下來 */
export function CutIn({ m }: { m: M.MatchState }) {
  // 一炮多響時你有胡就演你的
  const w = M.winsOf(m.result).find((x) => x.seat === 0) ?? m.result?.win
  const big = w ? bigHand(w.score) : null
  const [on, setOn] = useState(!!big)
  useEffect(() => {
    if (!big) return
    const a = window.setTimeout(() => sfx.bigWin(), 350)
    const b = window.setTimeout(() => setOn(false), CUT_IN_MS)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
    // 每一局只演一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!on || !w || !big) return null
  const name = seatName(m, w.seat)
  return (
    <div className="cutin" role="status" aria-label={`${name}胡了${big.title}`}>
      <div className="cutin-rays" aria-hidden="true" />
      <div className="cutin-band">
        <span className="cutin-face">
          <SeatFace m={m} seat={w.seat} size={120} mood="happy" />
        </span>
        <div className="cutin-text">
          <span className="cutin-who">
            {name}
            {w.from === null ? '・自摸' : '・胡'}
          </span>
          <strong>{big.title}</strong>
          <span className="cutin-tai">
            <b>{big.tai}</b> 台
          </span>
        </div>
      </div>
    </div>
  )
}

/** 一項一項亮出來：回傳目前亮到第幾項；all() 直接全亮 */
export function useStagger(count: number, startMs: number, stepMs: number, onStep?: (i: number) => void) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (shown >= count) return
    const id = window.setTimeout(
      () => {
        onStep?.(shown)
        setShown(shown + 1)
      },
      shown === 0 ? startMs : stepMs,
    )
    return () => window.clearTimeout(id)
  }, [shown, count, startMs, stepMs, onStep])
  return { shown, all: () => setShown(count) }
}
