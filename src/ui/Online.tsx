// 連線對打的畫面：開房／加入（OnlineSheet）、房間（RoomView：房號、邀請連結、座位、房主設定、開打）。

import { useState } from 'react'
import { CHARACTERS } from '../engine/characters'
import { ROOM_RE } from '../engine/online'
import { STAGES } from '../engine/stages'
import { canPlayOnline, inviteLink, SITE } from '../net'
import { DEFAULT_NAME, TURN_TIMES, useUI } from '../store'
import { cls } from './bits'
import { NAME_MAX, Sheet } from './Overlays'
import { PlayerBadge } from './seat'

/** 首頁「跟朋友打」：開新房間，或輸入朋友給的房號加入 */
export function OnlineSheet() {
  const open = useUI((s) => s.onlineSheet)
  if (!open) return null
  // 每次打開重新建一次，房號（從邀請連結帶進來的）才會填好
  return <OnlineSheetBody key={String(open)} initialCode={typeof open === 'string' ? open : ''} />
}

function OnlineSheetBody({ initialCode }: { initialCode: string }) {
  const saved = useUI((s) => s.settings.name)
  const { setOnlineSheet, setSettings, createRoom, joinRoom } = useUI.getState()
  const [name, setName] = useState(saved)
  const [code, setCode] = useState(initialCode)
  // 名字可以不填：用預設的「小明」
  const nameOk = true
  const codeOk = ROOM_RE.test(code)
  const keepName = () => setSettings({ name: name.trim().slice(0, NAME_MAX), nameAsked: true })
  return (
    <Sheet open onClose={() => setOnlineSheet(false)} label="跟朋友打">
      <div className="online-sheet">
        <h3>跟朋友打</h3>
        <p className="help-lead">開一個房間，把邀請連結傳給朋友。2–4 個人都能打，空位由電腦補上。連線時不能用絕招，也不算金幣和段位。</p>
        {!canPlayOnline() ? (
          <p className="pm-warn">試玩版不能連線對打，請到正式網站玩：{SITE}</p>
        ) : null}
        <label className="row name-row">
          <span>你的名字</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder={DEFAULT_NAME} aria-label="你的名字" />
        </label>
        <div className="online-choices">
          <button
            type="button"
            className="btn primary"
            disabled={!nameOk}
            onClick={() => {
              keepName()
              createRoom()
            }}
          >
            開新房間
          </button>
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nameOk || !codeOk) return
              keepName()
              joinRoom(code)
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="房號（5 碼）"
              aria-label="房號"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn" disabled={!nameOk || !codeOk}>
              加入
            </button>
          </form>
        </div>
        <p className="pm-small">沒填名字的話，朋友看到的是「{DEFAULT_NAME}」。</p>
      </div>
    </Sheet>
  )
}

/** 房間：等人、房主設定、開打 */
export function RoomView() {
  const online = useUI((s) => s.online)
  const { leaveRoom, roomSend, showToast } = useUI.getState()
  if (!online) return null
  const room = online.room
  const code = online.code
  const me = room?.players[room.you]
  const host = !!me?.host
  const st = room?.settings
  const humans = room?.players.filter((p) => p.connected).length ?? 0
  const set = (x: object) => roomSend({ t: 'settings', settings: x })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code))
      showToast('邀請連結複製好了，貼給朋友吧')
    } catch {
      showToast(`房號 ${code}`)
    }
  }
  const shareLink = async () => {
    try {
      await navigator.share({ title: '胡了！一起打麻將', text: `來打麻將！房號 ${code}`, url: inviteLink(code) })
    } catch {
      void copy()
    }
  }
  const canShare = typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches

  return (
    <div className="room">
      <header className="room-head">
        <button type="button" className="btn small" onClick={leaveRoom}>
          離開
        </button>
        <div className="room-code">
          <small>房號</small>
          <b>{code}</b>
        </div>
        <div className="room-invite">
          <button type="button" className="btn small" onClick={copy}>
            複製邀請連結
          </button>
          {canShare && (
            <button type="button" className="btn small" onClick={shareLink}>
              分享
            </button>
          )}
        </div>
      </header>

      {online.status !== 'open' && <p className="room-status">{online.status === 'retry' ? '連線中斷，重新連線中…' : '連線中…'}</p>}

      {room && st && (
        <div className="room-body">
          <section className="room-seats" aria-label="座位">
            <h4>
              玩家 {room.players.length}/4
            </h4>
            <ul>
              {room.players.map((p, i) => (
                <li key={i} className={cls(!p.connected && 'gone')}>
                  <PlayerBadge name={p.name} seat={i} size={30} />
                  <b>{p.name}</b>
                  {p.host && <em className="tag host">房主</em>}
                  {i === room.you && <em className="tag you">你</em>}
                  {!p.connected && <em className="tag">離開了</em>}
                </li>
              ))}
              {Array.from({ length: 4 - room.players.length }, (_, i) => (
                <li key={`ai${i}`} className="ai">
                  <span className="ai-dot" aria-hidden="true" />
                  <span>空位：開打時電腦補上</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="room-settings" aria-label="設定">
            <h4>{host ? '設定（你是房主）' : '設定（房主決定）'}</h4>
            <div className="stage-pick" role="group" aria-label="關卡">
              {STAGES.map((s, i) => (
                <button key={s.id} type="button" aria-pressed={st.stage === i} disabled={!host} onClick={() => set({ stage: i })}>
                  <b>{s.name}</b>
                  <small>{s.opponents.map((id) => CHARACTERS[id].name).join('、')}</small>
                </button>
              ))}
            </div>
            <div className="row">
              <span>出牌時間</span>
              <div className="seg" role="group" aria-label="出牌時間">
                {TURN_TIMES.map((t) => (
                  <button key={t} type="button" aria-pressed={st.turnTime === t} disabled={!host} onClick={() => set({ turnTime: t })}>
                    {t}秒
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span>電腦出牌</span>
              <div className="seg" role="group" aria-label="電腦出牌速度">
                <button type="button" aria-pressed={!st.fast} disabled={!host} onClick={() => set({ fast: false })}>
                  正常
                </button>
                <button type="button" aria-pressed={!!st.fast} disabled={!host} onClick={() => set({ fast: true })}>
                  快
                </button>
              </div>
            </div>
            <p className="rules-note">
              規則：{st.rules.multiRon ? '一炮多響' : '截胡'}・{st.rules.passWin ? '有過水' : '沒有過水'}・{st.rules.streakCap ? `連 ${st.rules.streakCap} 換莊` : '連莊不限'}
              {host ? '（照你的「設定 → 牌桌規則」）' : ''}
            </p>
          </section>
        </div>
      )}

      <footer className="room-foot">
        {host ? (
          <button type="button" className="btn primary" disabled={online.status !== 'open'} onClick={() => roomSend({ t: 'start' })}>
            開打（{humans} 個人{humans < 4 ? `＋${4 - humans} 個電腦` : ''}）
          </button>
        ) : (
          <span className="wait-host">等房主開打…</span>
        )}
      </footer>
    </div>
  )
}
