// 上帝視角回放：一局打完，把這一局從頭重打一遍，四家的牌全部攤開。
// 每一步看得到誰摸了什麼、打了什麼、誰在聽什麼（「原來他在聽這張！」）。

import { useEffect, useMemo, useState } from 'react'
import { kindOf, shanten, toCounts, waits } from '../engine/analysis'
import * as M from '../engine/match'
import { need, RESERVE, seatWind, type HandEvent, type HandState } from '../engine/table'
import { idx, tileName, WIND_CHAR, type Kind } from '../engine/tiles'
import { sfx } from '../sfx'
import { handReplay } from '../store'
import { cls, Tile, useStageSize } from './bits'
import { SeatFace, seatName } from './seat'

const SPEEDS = [1, 2, 4] as const

/** 播放鍵的小圖示（不用 emoji，各平台長得一樣） */
const ICON = {
  first: 'M5 4h2v16H5zM20 4 9 12l11 8z',
  prev: 'M17 4 6 12l11 8z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  next: 'M7 4l11 8-11 8z',
  last: 'M17 4h2v16h-2zM4 4l11 8-11 8z',
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/** 這一家在聽哪些牌（手上多一張、要打牌的時候不算） */
function waitsOf(h: HandState, seat: number): Kind[] {
  const s = h.seats[seat]
  const n = need(h, seat)
  if (s.hand.length !== 3 * n + 1) return []
  const c = toCounts(s.hand)
  if (shanten(c, n) !== 0) return []
  return waits(c, n).map(kindOf)
}

/** 這一步發生了什麼（給字幕用） */
function describe(m: M.MatchState, prev: M.MatchState | null, f: M.MatchState): string {
  const h = f.hand
  const name = (s: number) => (s === 0 ? '你' : seatName(m, s))
  if (!prev) return `開局：${name(h.dealer)}當莊`
  const evs = prev.handNo === f.handNo ? h.events.filter((x) => x.n > prev.hand.eventN).map((x) => x.e) : h.events.map((x) => x.e)
  const out: string[] = []
  const say = (e: HandEvent) => {
    switch (e.t) {
      case 'draw':
        if (h.drawn && h.turn === e.seat) out.push(`${name(e.seat)}摸到${tileName(h.drawn.kind)}`)
        else out.push(`${name(e.seat)}摸牌`)
        break
      case 'flower':
        out.push(`${name(e.seat)}補花（${tileName(e.tile.kind)}）`)
        break
      case 'discard': {
        const who = [0, 1, 2, 3].filter((s) => s !== e.seat && waitsOf(h, s).includes(e.tile.kind))
        out.push(`${name(e.seat)}打${tileName(e.tile.kind)}${who.length ? `（${who.map(name).join('、')}在聽這張！）` : ''}`)
        break
      }
      case 'chi':
      case 'pon':
      case 'kong':
        out.push(`${name(e.seat)}${{ chi: '吃', pon: '碰', kong: '槓' }[e.t]}${tileName(e.tile.kind)}`)
        break
      case 'ankan':
      case 'kakan':
        out.push(`${name(e.seat)}${e.t === 'ankan' ? '暗槓' : '加槓'}${tileName(e.kind)}`)
        break
      case 'skill':
        out.push(`${name(e.seat)}用了「${M.SKILLS[e.id].name}」`)
        break
      case 'win':
        out.push(e.from === null ? `${name(e.seat)}自摸！` : `${name(e.seat)}胡了${name(e.from)}打的牌！`)
        break
      case 'exhausted':
        out.push('牌摸完了，流局')
        break
    }
  }
  evs.forEach(say)
  return out.join('，') || (JSON.stringify(f.skills) !== JSON.stringify(prev.skills) ? '你用了絕招' : '…')
}

function sound(prev: M.MatchState | null, f: M.MatchState) {
  if (!prev || prev.handNo !== f.handNo) return
  for (const { e } of f.hand.events.filter((x) => x.n > prev.hand.eventN)) {
    if (e.t === 'discard') sfx.discard()
    else if (e.t === 'chi' || e.t === 'pon' || e.t === 'kong') sfx.call(e.t)
    else if (e.t === 'win') sfx.hu()
  }
}

export function ReplayPanel({ m, onBack }: { m: M.MatchState; onBack: () => void }) {
  const frames = useMemo(() => handReplay(m), [m])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const { W } = useStageSize()
  const last = (frames?.length ?? 1) - 1
  useEffect(() => {
    if (!frames || !playing) return
    if (i >= last) return setPlaying(false)
    const id = window.setTimeout(() => setI((k) => Math.min(last, k + 1)), 850 / speed)
    return () => window.clearTimeout(id)
  }, [frames, playing, i, last, speed])
  // 往前走的時候放一點聲音
  useEffect(() => {
    if (frames && i > 0) sound(frames[i - 1], frames[i])
  }, [frames, i])
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((k) => Math.min(last, k + 1))
      else if (e.key === 'ArrowLeft') setI((k) => Math.max(0, k - 1))
      else if (e.key === ' ') setPlaying((p) => !p)
      else if (e.key === 'Escape') onBack()
      else return
      e.preventDefault()
      if (e.key !== ' ') setPlaying(false)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [last, onBack])

  if (!frames) {
    return (
      <div className="overlay">
        <div className="panel result" role="dialog" aria-label="回放">
          <h2>這一局沒辦法回放</h2>
          <p className="help-lead">這一局的紀錄不完整（例如中途換了裝置），下一局就可以了。</p>
          <div className="result-actions">
            <button type="button" className="btn primary" onClick={onBack}>
              回到結果
            </button>
          </div>
        </div>
      </div>
    )
  }
  const f = frames[i]
  const h = f.hand
  const lastTile = h.lastDiscard?.tile.id
  const go = (k: number) => {
    setPlaying(false)
    setI(Math.max(0, Math.min(last, k)))
  }
  const winners = M.winsOf(h).map((w) => w.seat)
  return (
    <div className="overlay">
      <div className="panel replay" role="dialog" aria-label="上帝視角回放">
        <header className="rp-head">
          <h2>上帝視角回放</h2>
          <span className="rp-caption" aria-live="polite">
            {describe(m, i ? frames[i - 1] : null, f)}
          </span>
          <button type="button" className="btn small" onClick={onBack}>
            回到結果
          </button>
        </header>
        <div className="rp-seats">
          {[0, 1, 2, 3].map((s) => {
            const st = h.seats[s]
            const ws = h.phase === 'over' ? [] : waitsOf(h, s)
            const drawn = h.turn === s && h.drawn && st.hand.some((t) => t.id === h.drawn!.id) ? h.drawn : null
            const main = [...st.hand.filter((t) => t.id !== drawn?.id)].sort((a, b) => idx(a.kind) - idx(b.kind) || a.id - b.id)
            const count = st.hand.length + st.melds.reduce((a, x) => a + x.tiles.length, 0) + st.flowers.length * 0.7
            const tw = Math.max(13, Math.min(22, Math.floor((W - 330) / Math.max(17, count))))
            return (
              <div key={s} className={cls('rp-seat', h.turn === s && h.phase !== 'over' && 'turn', winners.includes(s) && 'won')}>
                <span className="rp-who">
                  <SeatFace m={m} seat={s} size={26} />
                  <span>
                    <b>{s === 0 ? '你' : seatName(m, s)}</b>
                    <small>
                      {WIND_CHAR[seatWind(h, s)]}
                      {h.dealer === s ? '・莊' : ''}
                    </small>
                  </span>
                </span>
                <span className="rp-hand">
                  {main.map((t) => (
                    <Tile key={t.id} kind={t.kind} w={tw} />
                  ))}
                  {drawn && (
                    <span className="rp-drawn">
                      <Tile kind={drawn.kind} w={tw} hot />
                    </span>
                  )}
                  {st.melds.map((x, k) => (
                    <span key={k} className="rp-meld">
                      {x.tiles.map((t) => (
                        <Tile key={t.id} kind={t.kind} w={tw - 2} dim={x.concealed} />
                      ))}
                    </span>
                  ))}
                  {st.flowers.length > 0 && (
                    <span className="rp-flowers">
                      {st.flowers.map((t) => (
                        <Tile key={t.id} kind={t.kind} w={Math.round(tw * 0.7)} />
                      ))}
                    </span>
                  )}
                </span>
                <span className="rp-ting">
                  {ws.length > 0 && (
                    <>
                      聽
                      {ws.map((k) => (
                        <Tile key={k} kind={k} w={14} />
                      ))}
                    </>
                  )}
                  {winners.includes(s) && <em>{M.winsOf(h).find((w) => w.seat === s)!.from === null ? '自摸' : '胡'}</em>}
                </span>
                <span className="rp-river">
                  {st.discards.map((d) => (
                    <Tile key={d.tile.id} kind={d.tile.kind} w={12} dim={d.claimed} hot={d.tile.id === lastTile} />
                  ))}
                </span>
              </div>
            )
          })}
        </div>
        <footer className="rp-controls">
          <button type="button" className="rp-btn" onClick={() => go(0)} aria-label="回到開頭">
            <Icon d={ICON.first} />
          </button>
          <button type="button" className="rp-btn" onClick={() => go(i - 1)} aria-label="上一步">
            <Icon d={ICON.prev} />
          </button>
          <button
            type="button"
            className="rp-btn play"
            onClick={() => {
              if (i >= last) setI(0)
              setPlaying(!playing || i >= last)
            }}
            aria-label={playing ? '暫停' : '播放'}
          >
            <Icon d={playing ? ICON.pause : ICON.play} />
          </button>
          <button type="button" className="rp-btn" onClick={() => go(i + 1)} aria-label="下一步">
            <Icon d={ICON.next} />
          </button>
          <button type="button" className="rp-btn" onClick={() => go(last)} aria-label="跳到最後">
            <Icon d={ICON.last} />
          </button>
          <input type="range" min={0} max={last} value={i} onChange={(e) => go(Number(e.target.value))} aria-label="回放進度" />
          <span className="rp-step">
            {i}/{last}
          </span>
          <div className="seg rp-speed" role="group" aria-label="速度">
            {SPEEDS.map((x) => (
              <button key={x} type="button" aria-pressed={speed === x} onClick={() => setSpeed(x)}>
                {x}×
              </button>
            ))}
          </div>
          <span className="rp-left">剩 {Math.max(0, h.wall.length - RESERVE)} 張</span>
        </footer>
      </div>
    </div>
  )
}
