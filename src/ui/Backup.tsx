// 設定 → 存檔：產生轉移碼（到新手機輸入）、輸入轉移碼（把舊手機的進度搬過來）。

import { useState } from 'react'
import { showCode } from '../backup-core'
import { apply, download, restoreLink, summary, upload, type Backup } from '../backup'
import { canPlayOnline, SITE } from '../net'
import { useUI } from '../store'
import { fmt } from './bits'

export function BackupTab() {
  const showToast = useUI((s) => s.showToast)
  const prefill = useUI((s) => s.restoreCode)
  const [made, setMade] = useState<{ code: string; until: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState(prefill ? showCode(prefill) : '')
  const [found, setFound] = useState<Backup | null>(null)
  const [err, setErr] = useState('')
  if (!canPlayOnline()) return <p className="pm-warn">試玩版不能用存檔轉移碼，請到正式網站：{SITE}</p>

  const make = async () => {
    setBusy(true)
    setErr('')
    try {
      setMade(await upload())
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }
  const look = async () => {
    setBusy(true)
    setErr('')
    setFound(null)
    try {
      setFound(await download(input))
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }
  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(msg)
    } catch {
      showToast(text)
    }
  }
  const sm = found ? summary(found) : null
  const until = made ? new Date(made.until) : null
  return (
    <div className="settings backup">
      <section className="bk-part">
        <h4>換手機：在這支手機產生轉移碼</h4>
        <p className="pm-small">金幣、段位、成就、造型、好感度、設定、記帳都會一起搬。轉移碼 30 天內有效。</p>
        {made ? (
          <div className="bk-code">
            <b>{showCode(made.code)}</b>
            <small>
              到 {until!.getMonth() + 1}/{until!.getDate()} 前有效
            </small>
            <button type="button" className="btn small" onClick={() => copy(made.code, '轉移碼複製好了')}>
              複製
            </button>
            <button type="button" className="btn small" onClick={() => copy(restoreLink(made.code), '連結複製好了，在新手機打開')}>
              複製連結
            </button>
          </div>
        ) : (
          <button type="button" className="btn primary" disabled={busy} onClick={make}>
            {busy ? '產生中…' : '產生轉移碼'}
          </button>
        )}
      </section>
      <section className="bk-part">
        <h4>新手機：輸入轉移碼</h4>
        <form
          className="join-form bk-form"
          onSubmit={(e) => {
            e.preventDefault()
            void look()
          }}
        >
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase().slice(0, 9))
              setFound(null)
            }}
            placeholder="ABCD-2345"
            aria-label="轉移碼"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn" disabled={busy || input.replace(/[^A-Z0-9]/gi, '').length !== 8}>
            找找看
          </button>
        </form>
        {sm && (
          <div className="bk-found" role="alert">
            <p>
              找到了：{sm.name || '沒填名字'}・{sm.rank}・金幣 {fmt(sm.coins)}・打過 {sm.matches} 場{sm.ledger ? '・有記到一半的帳' : ''}
            </p>
            <p className="pm-warn">這支手機現在的進度會被換掉，換了就回不去。</p>
            <button type="button" className="btn primary" onClick={() => apply(found!)}>
              確定，換成這一份
            </button>
          </div>
        )}
      </section>
      {err && <p className="pm-warn">{err}</p>}
    </div>
  )
}
