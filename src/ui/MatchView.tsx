import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { visible } from '../engine/ai'
import { discardShanten, kindOf, shanten, toCounts, waits } from '../engine/analysis'
import { evaluate } from '../engine/coach'
import { EMOTES, TAUNTS } from '../engine/characters'
import * as M from '../engine/match'
import { canTsumo, need, passedWin, RESERVE, seatWind, selfKongs, type HandState } from '../engine/table'
import { idx, WIND_CHAR, type Kind } from '../engine/tiles'
import { BACK } from '../progress'
import { dangerMap, publicThreats } from '../review'
import { sfx } from '../sfx'
import { tableSkin, useMyName, useUI } from '../store'
import { isFriend, SeatFace, seatName } from './seat'
import { MeBadge } from './Avatar'
import { Back, cls, fmt, Tile, useStageSize } from './bits'
import { CutIn } from './Celebrate'
import { Guide, useGuideStep } from './Guide'
import { HandEnd, MatchEnd } from './Overlays'

/** 電腦的節奏：不是在等你的時候，隔一下就讓電腦動一步（引導說明出現時先停） */
function useDriver(m: M.MatchState, paused: boolean) {
  const step = useUI((s) => s.step)
  const fast = useUI((s) => s.settings.fast)
  useEffect(() => {
    if (paused || m.phase !== 'play' || M.waitingForYou(m)) return
    if (m.hand.phase === 'over') return
    const id = window.setTimeout(step, M.aiDelay(m, Math.random()) * (fast ? 0.5 : 1))
    return () => window.clearTimeout(id)
  }, [m, step, fast, paused])
}

/** 有人看起來聽牌了（只看公開資訊） */
function useThreats(m: M.MatchState): number[] {
  const heard = useUI((s) => s.heardTing)
  const on = useUI((s) => s.settings.danger)
  return useMemo(() => (on && m.phase === 'play' ? publicThreats(m.hand, heard) : []), [on, m, heard])
}

/** 桌機鍵盤：←→ 選牌、Enter 打出、H 胡、P 碰、C 吃、K 槓、X 過 */
function useKeys(m: M.MatchState) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const st = useUI.getState()
      if (e.metaKey || e.ctrlKey || e.altKey || st.menu || st.learn || st.prematch || st.records || st.people) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        if (st.mode) useUI.setState({ mode: null })
        else st.setMenu(true)
        return
      }
      if (!M.waitingForYou(m)) return
      const h = m.hand
      if (h.phase === 'claim') {
        const o = h.options[0]!
        if (k === 'h' && o.hu) st.claim({ type: 'hu' })
        else if (k === 'p' && o.pon) st.claim({ type: 'pon' })
        else if (k === 'k' && o.kong) st.claim({ type: 'kong' })
        else if (k === 'c' && o.chi.length) (o.chi.length === 1 ? st.claim({ type: 'chi', use: o.chi[0] }) : st.setChiOpen(!st.chiOpen))
        else if (k === 'x' || k === ' ') st.claim({ type: 'pass' })
        else return
        e.preventDefault()
        return
      }
      const hand = h.seats[0].hand
      const i = hand.findIndex((t) => t.id === st.sel)
      if (k === 'arrowleft' || k === 'arrowright') {
        const d = k === 'arrowleft' ? -1 : 1
        const j = i < 0 ? (d > 0 ? 0 : hand.length - 1) : (i + d + hand.length) % hand.length
        useUI.setState({ sel: hand[j].id })
        sfx.select()
      } else if (k === 'enter' || k === ' ') {
        if (i >= 0) st.tapTile(hand[i].id)
        else useUI.setState({ sel: (h.drawn && hand.some((t) => t.id === h.drawn!.id) ? h.drawn : hand[hand.length - 1]).id })
      } else if (k === 'h' && canTsumo(h, 0)) st.tsumo()
      else if (k === 'k') {
        const ks = selfKongs(h, 0)
        const kind = ks.ankan[0] ?? ks.kakan[0]
        if (kind) st.kong(kind)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [m])
}

export function MatchView() {
  const match = useUI((s) => s.match)
  const skinId = useUI((s) => s.progress.skin)
  const backId = useUI((s) => s.progress.back)
  if (!match) return null
  const skin = tableSkin(skinId)
  const back = BACK[backId] ?? BACK.pink
  return <Table m={match} skin={skin} back={back} />
}

function Table({ m: match, skin, back }: { m: M.MatchState; skin: ReturnType<typeof tableSkin>; back: (typeof BACK)[string] }) {
  const guide = useGuideStep(match)
  const timer = useTurnTimer(match, !!guide)
  const online = !!match.online
  const threats = useThreats(match)
  useKeys(match)
  return (
    <div
      className="match"
      style={{ '--table': skin.color, '--table-rim': skin.rim, '--table-edge': skin.edge, '--back': back.bg, '--back-ring': back.ring } as CSSProperties}
    >
      <Driver m={match} paused={!!guide || online} />
      <TopStrip m={match} />
      <TableCenter m={match} timer={timer} />
      <Opponent m={match} seat={2} side="top" threat={threats.includes(2)} />
      <Opponent m={match} seat={3} side="left" threat={threats.includes(3)} />
      <Opponent m={match} seat={1} side="right" threat={threats.includes(1)} />
      <MyArea m={match} threats={threats} />
      <Actions m={match} />
      {guide && <Guide key={guide.id} step={guide} />}
      {match.phase === 'handEnd' && <CutIn key={`cut${match.handNo}`} m={match} />}
      {match.phase === 'handEnd' && <HandEnd key={`end${match.handNo}`} m={match} />}
      {match.phase === 'end' && <MatchEnd m={match} />}
    </div>
  )
}

function Driver({ m, paused }: { m: M.MatchState; paused: boolean }) {
  useDriver(m, paused)
  return null
}

function TopStrip({ m }: { m: M.MatchState }) {
  const setMenu = useUI((s) => s.setMenu)
  const skill = useUI((s) => s.skill)
  const mode = useUI((s) => s.mode)
  const h = m.hand
  const me = useMyName()
  const dealerName = m.dealer === 0 ? me : seatName(m, m.dealer)
  const lucky = h.luckySeat === 0
  return (
    <header className="strip">
      <button type="button" className="icon-btn" aria-label="選單" onClick={() => setMenu(true)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className="round-info">
        東風圈 第 {m.handNo} 局
        <small>
          莊 {dealerName}
          {m.streak ? `・連 ${m.streak}` : ''}
        </small>
      </span>
      <MeChip m={m} />
      {!m.online && <div className="skills" role="group" aria-label="絕招">
        {(Object.keys(M.SKILLS) as M.SkillId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={cls('skill', (mode === id || (id === 'lucky' && lucky)) && 'on')}
            disabled={m.skills[id] <= 0 && mode !== id}
            onClick={() => skill(id)}
            title={M.SKILLS[id].desc}
          >
            {M.SKILLS[id].name}
            <b>{m.skills[id]}</b>
          </button>
        ))}
      </div>}
      <span className="left-count">
        剩 <b>{Math.max(0, h.wall.length - RESERVE)}</b> 張
      </span>
    </header>
  )
}

function MeChip({ m }: { m: M.MatchState }) {
  const myBubble = useUI((s) => s.bubbles[0])
  const name = useUI((s) => s.settings.name.trim())
  const h = m.hand
  return (
    <div className={cls('me-chip', h.turn === 0 && h.phase !== 'over' && 'active')}>
      <span className="seat-wind">{WIND_CHAR[seatWind(h, 0)]}</span>
      <MeBadge size={20} />
      {name && <span className="me-name">{name}</span>}
      <span className="pscore">{fmt(m.points[0])}</span>
      {m.dealer === 0 && <span className="dealer">莊</span>}
      <TauntButton />
      {myBubble && (
        <div key={myBubble.key} className="bubble from-me" role="status">
          {myBubble.text}
        </div>
      )}
    </div>
  )
}

function TableCenter({ m, timer }: { m: M.MatchState; timer: TurnTimerState }) {
  const h = m.hand
  const callout = useUI((s) => s.callout)
  const turnSide = ['bottom', 'right', 'top', 'left'][h.turn]
  const last = h.lastDiscard
  return (
    <div className="table">
      <div
        className={cls('compass', `turn-${turnSide}`, timer.active && 'ticking', timer.active && timer.secs <= 5 && 'urgent')}
        style={{ '--p': timer.frac } as CSSProperties}
        aria-label={`輪到${seatName(m, h.turn)}`}
      >
        <span className="c-bottom">{WIND_CHAR[seatWind(h, 0)]}</span>
        <span className="c-right">{WIND_CHAR[seatWind(h, 1)]}</span>
        <span className="c-top">{WIND_CHAR[seatWind(h, 2)]}</span>
        <span className="c-left">{WIND_CHAR[seatWind(h, 3)]}</span>
        {timer.active ? (
          <span className="c-center c-timer" role="timer" aria-label={`剩 ${timer.secs} 秒`}>
            {timer.secs}
          </span>
        ) : (
          <span className="c-center">
            東<small>{m.handNo}</small>
          </span>
        )}
      </div>
      {([
        [2, 'p-top'],
        [3, 'p-left'],
        [1, 'p-right'],
        [0, 'p-me'],
      ] as const).map(([seat, c]) => (
        <div key={seat} className={cls('pond', c)}>
          {h.seats[seat].discards
            .filter((d) => !d.claimed)
            .map((d) => (
              <Tile key={d.tile.id} kind={d.tile.kind} w={19} hot={!!last && last.tile.id === d.tile.id && h.phase === 'claim'} fresh />
            ))}
        </div>
      ))}
      {callout && (
        <span
          key={callout.key}
          className={cls(
            'callout',
            `at-${['bottom', 'right', 'top', 'left'][callout.seat]}`,
            callout.text.length > 1 && 'wide',
            Object.values(M.SKILLS).some((x) => x.name === callout.text) && 'skill',
          )}
        >
          {callout.text}
        </span>
      )}
      {h.phase === 'over' && (
        <span className={cls('stamp', !h.win && 'draw')}>{h.win ? (h.win.from === null ? '自摸' : '胡') : '流局'}</span>
      )}
    </div>
  )
}

function Opponent({ m, seat, side, threat }: { m: M.MatchState; seat: number; side: 'top' | 'left' | 'right'; threat: boolean }) {
  const name = seatName(m, seat)
  const offline = isFriend(m, seat) && m.players?.[seat]?.connected === false
  const h = m.hand
  const s = h.seats[seat]
  const bubble = useUI((st) => st.bubbles[seat])
  const mood = useUI((st) => st.moods[seat])
  const mode = useUI((st) => st.mode)
  const peekAt = useUI((st) => st.peekAt)
  const reveal = m.peek === seat || h.phase === 'over'
  const top = side === 'top'
  const meldW = top ? 17 : 15

  const concealed = (
    <div className={cls('concealed', reveal && 'revealed')}>
      {reveal
        ? s.hand.map((t) => <Tile key={t.id} kind={t.kind} w={top ? 16 : 13} />)
        : s.hand.map((t) => (top ? <Back key={t.id} w={13} h={18} /> : <Back key={t.id} w={9} h={13} />))}
    </div>
  )
  const melds =
    s.melds.length > 0 || s.flowers.length > 0 ? (
      <div className="opp-melds">
        {s.melds.map((mm, i) => (
          <span key={i} className="meld">
            {mm.tiles.map((t, j) => (mm.concealed && (j === 0 || j === 3) ? <Back key={t.id} w={meldW} h={meldW * 1.36} /> : <Tile key={t.id} kind={t.kind} w={meldW} />))}
          </span>
        ))}
        {s.flowers.length > 0 && (
          <span className="opp-flowers">
            {s.flowers.map((f) => (
              <Tile key={f.id} kind={f.kind} w={top ? 17 : 12} />
            ))}
          </span>
        )}
      </div>
    ) : null

  return (
    <>
      <div className={cls('opp', side, h.turn === seat && h.phase !== 'over' && 'active')}>
        <button type="button" className={cls('avatar', mode === 'peek' && 'pickable')} onClick={() => peekAt(seat)} aria-label={`${name}${mode === 'peek' ? '（點一下偷看）' : ''}`} disabled={mode !== 'peek'}>
          <SeatFace m={m} seat={seat} size={44} mood={mood ?? 'normal'} />
          {h.turn === seat && h.phase === 'discard' && (
            <span className="thinking" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="seat-wind">{WIND_CHAR[seatWind(h, seat)]}</span>
          {m.dealer === seat && <span className="dealer">莊</span>}
          {threat && h.phase !== 'over' && (
            <span className="threat" title="看起來快胡了">
              聽?
            </span>
          )}
        </button>
        <div className="player-info">
          <span className="pname">
            {name}
            {offline && <em className="offline">斷線</em>}
          </span>
          <span className="pscore">{fmt(m.points[seat])}</span>
        </div>
        {!top && (
          <div className="side-tiles">
            {concealed}
            {melds}
          </div>
        )}
        {bubble && (
          <div key={bubble.key} className={cls('bubble', `from-${side}`)} role="status">
            {bubble.text}
          </div>
        )}
      </div>
      {top && (
        <div className="opp-tiles top">
          {concealed}
          {melds}
        </div>
      )}
    </>
  )
}

interface TurnTimerState {
  active: boolean
  secs: number
  frac: number
}

/** 出牌倒數：輪到你（打牌或吃碰）才開始；時間到系統幫你打。開選單或教學時暫停 */
function useTurnTimer(m: M.MatchState, guide: boolean): TurnTimerState {
  const online = !!m.online
  const turnTime = useUI((s) => (online ? (s.online?.room?.settings.turnTime ?? 20) : s.settings.turnTime))
  // 連線時照伺服器的時間倒數，不能暫停（大家在等你）
  const deadline = useUI((s) => s.online?.deadline ?? null)
  const paused = useUI((s) => s.menu || s.learn !== null || s.people !== null || s.records) || guide
  const autoPlay = useUI((s) => s.autoPlay)
  // 引導局不計時
  const key = M.waitingForYou(m) && !m.tutorial && (!online || deadline !== null) ? `${m.handNo}:${m.hand.eventN}:${m.hand.phase}` : ''
  const total = turnTime * 1000
  const [left, setLeft] = useState(total)
  useEffect(() => setLeft(online && deadline ? deadline - Date.now() : total), [key, total, online, deadline])
  useEffect(() => {
    if (!key || !online || !deadline) return
    const id = window.setInterval(() => setLeft(deadline - Date.now()), 100)
    return () => window.clearInterval(id)
  }, [key, online, deadline])
  useEffect(() => {
    if (!key || paused || online) return
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      // 切到別的 App、螢幕關掉時不扣時間；回來時也不會一次扣一大段
      const dt = document.hidden ? 0 : Math.min(250, now - last)
      last = now
      if (dt) setLeft((l) => l - dt)
    }, 100)
    return () => window.clearInterval(id)
  }, [key, paused])
  const secs = Math.max(0, Math.ceil(left / 1000))
  const out = left <= 0
  useEffect(() => {
    if (key && !paused && secs > 0 && secs <= 5) sfx.timer(secs <= 3)
    // 只在秒數變的時候嘀一聲
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs])
  useEffect(() => {
    if (key && out && !online) autoPlay()
    // 歸零的那一下觸發一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out])
  return { active: !!key, secs, frac: Math.max(0, Math.min(1, left / total)) }
}

/** 嗆聲：點一下跳出四句話，選一句講，對手會回嘴 */
function TauntButton() {
  const taunt = useUI((s) => s.taunt)
  const [open, setOpen] = useState(false)
  return (
    <span className="taunt">
      <button type="button" className="taunt-btn" aria-label="嗆聲" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <span className="taunt-menu" role="menu">
          {TAUNTS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                taunt(t.id)
                setOpen(false)
              }}
            >
              {t.text}
            </button>
          ))}
          <span className="emote-row">
            {EMOTES.map((e) => (
              <button
                key={e.id}
                type="button"
                role="menuitem"
                title={e.text}
                aria-label={e.text}
                onClick={() => {
                  taunt(e.id)
                  setOpen(false)
                }}
              >
                {e.emoji}
              </button>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}

function remaining(h: HandState, kinds: number[]): { kind: Kind; left: number }[] {
  const seen = visible(h, 0)
  return kinds.map((k) => ({ kind: kindOf(k), left: Math.max(0, 4 - seen[k]) }))
}

function MyArea({ m, threats }: { m: M.MatchState; threats: number[] }) {
  const h = m.hand
  const me = h.seats[0]
  const sel = useUI((s) => s.sel)
  const tap = useUI((s) => s.tapTile)
  const mode = useUI((s) => s.mode)
  const hints = useUI((s) => s.settings.hints)
  const { W } = useStageSize()
  const myTurn = M.waitingForYou(m) && h.phase === 'discard'
  const n = need(h, 0)

  // 打哪張會聽（提示）
  const after = useMemo(() => (myTurn ? discardShanten(me.hand, n) : null), [myTurn, me.hand, n])
  const best = after ? Math.min(...after.values()) : null

  const selTile = me.hand.find((t) => t.id === sel)

  const selInfo = useMemo(() => {
    if (!selTile || !myTurn) return null
    const c = toCounts(me.hand)
    c[idx(selTile.kind)]--
    const sh = shanten(c, n)
    if (sh === 0) return { ting: remaining(h, waits(c, n)) }
    return { sh }
  }, [selTile, myTurn, me.hand, n, h])

  // 不是你打牌的時候：聽牌就顯示聽什麼
  const ting = useMemo(() => {
    if (myTurn || h.phase === 'over') return null
    const c = toCounts(me.hand)
    if (shanten(c, n) !== 0) return null
    return remaining(h, waits(c, n))
  }, [myTurn, me.hand, n, h])

  // 危險牌提示：輪到你打牌、有人看起來聽了才標
  const dm = useMemo(() => (myTurn && threats.length ? dangerMap(h, threats) : null), [myTurn, threats, h])

  // 引導局：每一手都標出教練建議打的那張（平常只在打了就聽牌時標）。
  // 有人快胡、自己還差兩步以上時，跟覆盤一樣建議打安全牌
  const coachPick = useMemo(() => {
    if (!m.tutorial || !myTurn) return null
    const ev = evaluate(me.hand, n)
    if (dm && ev[0].sh >= 2 && dm.get(ev[0].kind) === 'danger') {
      const safe = ev.find((e) => dm.get(e.kind) === 'safe')
      if (safe) return safe.kind
    }
    return ev[0]?.kind ?? null
  }, [m.tutorial, myTurn, me.hand, n, dm])

  const drawn = myTurn && h.drawn && me.hand.some((t) => t.id === h.drawn!.id) ? h.drawn : null
  const main = drawn ? me.hand.filter((t) => t.id !== drawn.id) : me.hand
  const meldTiles = me.melds.reduce((s, x) => s + x.tiles.length, 0) + me.flowers.length
  const meldW = meldTiles * 29 + me.melds.length * 5
  const avail = W - 24 - meldW - (meldTiles ? 14 : 0) - (drawn ? 12 : 0)
  const size = Math.max(28, Math.min(43, Math.floor(avail / me.hand.length) - 2))

  const tileEl = (t: (typeof me.hand)[number]) => (
    <Tile
      key={t.id}
      kind={t.kind}
      w={size}
      selected={sel === t.id}
      mark={(hints && best === 0 && after?.get(t.kind) === 0) || (best !== 0 && t.kind === coachPick)}
      badge={dm ? dm.get(t.kind) : undefined}
      onClick={myTurn ? () => tap(t.id) : undefined}
      label={undefined}
    />
  )

  return (
    <>
      <div className="me">
        {(me.melds.length > 0 || me.flowers.length > 0) && (
          <div className="my-melds">
            {me.melds.map((mm, i) => (
              <span key={i} className="meld">
                {mm.tiles.map((t, j) => (mm.concealed && (j === 0 || j === 3) ? <Back key={t.id} w={28} h={38} /> : <Tile key={t.id} kind={t.kind} w={28} />))}
              </span>
            ))}
            {me.flowers.map((f) => (
              <Tile key={f.id} kind={f.kind} w={24} />
            ))}
          </div>
        )}
        <div className={cls('hand', myTurn && 'my-turn', mode === 'swap' && 'swapping')}>
          {main.map(tileEl)}
          {drawn && <span className="drawn-gap">{tileEl(drawn)}</span>}
        </div>
      </div>

      {selInfo && (
        <div className="sel-hint" role="status">
          {selInfo.ting ? (
            <>
              打這張就聽
              {selInfo.ting.map((w) => (
                <span key={w.kind} className="wait">
                  <Tile kind={w.kind} w={18} />
                  <small>{w.left}</small>
                </span>
              ))}
            </>
          ) : (
            <>打這張，還差 {selInfo.sh} 步聽牌</>
          )}
          <em>再點一次打出</em>
        </div>
      )}

      {ting && (
        <div className="ting" role="status">
          聽
          {passedWin(h, 0) && (
            <span className="passed" title="放過能胡的牌，摸牌之前不能胡別人打的">
              過水
            </span>
          )}
          {ting.map((w) => (
            <span key={w.kind} className="wait">
              <Tile kind={w.kind} w={18} />
              <small>{w.left}</small>
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function Actions({ m }: { m: M.MatchState }) {
  const claim = useUI((s) => s.claim)
  const tsumo = useUI((s) => s.tsumo)
  const kong = useUI((s) => s.kong)
  const chiOpen = useUI((s) => s.chiOpen)
  const setChiOpen = useUI((s) => s.setChiOpen)
  const h = m.hand
  if (!M.waitingForYou(m)) return null

  if (h.phase === 'claim') {
    const o = h.options[0]!
    const tile = h.lastDiscard!.tile
    return (
      <div className="claims">
        {chiOpen && o.chi.length > 1 && (
          <div className="chi-pick" role="group" aria-label="選擇吃法">
            {o.chi.map((use) => (
              <button key={use.join()} type="button" className="chi-opt" onClick={() => claim({ type: 'chi', use })}>
                {[...use, tile.kind]
                  .sort()
                  .map((k, i) => (
                    <Tile key={i} kind={k} w={22} hot={k === tile.kind} />
                  ))}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="claim pass" onClick={() => claim({ type: 'pass' })}>
          過
        </button>
        {o.chi.length > 0 && (
          <button type="button" className="claim chi" onClick={() => (o.chi.length === 1 ? claim({ type: 'chi', use: o.chi[0] }) : setChiOpen(!chiOpen))}>
            吃
          </button>
        )}
        {o.pon && (
          <button type="button" className="claim pon" onClick={() => claim({ type: 'pon' })}>
            碰
          </button>
        )}
        {o.kong && (
          <button type="button" className="claim kong" onClick={() => claim({ type: 'kong' })}>
            槓
          </button>
        )}
        {o.hu && (
          <button type="button" className={cls('claim hu', h.robbing && 'small-label')} onClick={() => claim({ type: 'hu' })}>
            {h.robbing ? '搶槓' : '胡'}
          </button>
        )}
      </div>
    )
  }

  const canHu = canTsumo(h, 0)
  const ks = selfKongs(h, 0)
  const kongs = [...ks.ankan, ...ks.kakan]
  if (!canHu && !kongs.length) return null
  return (
    <div className="claims">
      {kongs.map((k) => (
        <button key={k} type="button" className="claim kong small-label" onClick={() => kong(k)}>
          槓
          <Tile kind={k} w={16} />
        </button>
      ))}
      {canHu && (
        <button type="button" className="claim hu" onClick={tsumo}>
          自摸
        </button>
      )}
    </div>
  )
}
