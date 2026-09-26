// 我的造型：換髮型、髮色、膚色、衣服、背景、配件。先試穿，按「穿上」才買（金幣）。
// 換好之後牌桌、結算、連線時朋友看到的都是這個頭像。

import { useState } from 'react'
import type { Extra, Look } from '../engine/characters'
import { DEFAULT_LOOK } from '../engine/looks'
import { useMyName, useUI, type Mood } from '../store'
import { costOf, owns, tryOn, WARDROBE, WARDROBE_TABS, wearing, type WardrobeItem, type WardrobeTab } from '../wardrobe'
import { Avatar } from './Avatar'
import { cls, fmt } from './bits'
import { Sheet } from './Overlays'

const MOODS: Mood[] = ['normal', 'happy', 'sad']

export function WardrobeSheet() {
  const open = useUI((s) => s.lookSheet)
  if (!open) return null
  return <WardrobeBody />
}

function Lock() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7.5" rx="2" fill="currentColor" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function WardrobeBody() {
  const p = useUI((s) => s.progress)
  const name = useMyName()
  const { setLookSheet, saveLook, resetLook } = useUI.getState()
  const [draft, setDraft] = useState<Look>(p.myLook ?? DEFAULT_LOOK)
  const [tab, setTab] = useState<WardrobeTab>('hair')
  const [mood, setMood] = useState(0)
  const cost = costOf(p, draft)
  const items = WARDROBE.filter((x) => x.tab === tab)
  const close = () => setLookSheet(false)
  const swatch = tab !== 'hair' && tab !== 'extra'
  // 髮型、配件的小圖：只戴這一樣，看得清楚
  const preview = (it: WardrobeItem): Look =>
    it.tab === 'extra' ? { ...draft, extras: [it.value as Extra] } : { ...tryOn(draft, it), extras: [] }
  const label = cost.locked.length ? `還沒解鎖：${cost.locked[0].name}` : cost.coins ? `買下並穿上（${fmt(cost.coins)} 金幣）` : '穿上'
  return (
    <Sheet open onClose={close} label="我的造型">
      <div className="wardrobe">
        <div className="wd-side">
          <button type="button" className="wd-preview" onClick={() => setMood((mood + 1) % 3)} aria-label="換個表情看看">
            <Avatar look={draft} mood={MOODS[mood]} size={112} />
          </button>
          <b className="wd-name">{name}</b>
          <small className="wd-tip">點頭像換表情</small>
          <span className="coin-chip">
            <span className="coin-dot" aria-hidden="true" />
            {fmt(p.coins)}
          </span>
        </div>
        <div className="wd-main">
          <nav className="menu-tabs wd-tabs" aria-label="造型分類">
            {WARDROBE_TABS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className={cls('wd-grid', swatch && 'swatches')}>
            {items.map((it) => {
              const have = owns(p, it)
              return (
                <button key={it.id} type="button" className={cls('wd-item', wearing(draft, it) && 'on')} aria-pressed={wearing(draft, it)} onClick={() => setDraft(tryOn(draft, it))}>
                  {swatch ? <span className="wd-swatch" style={{ background: it.value }} /> : <Avatar look={preview(it)} size={46} />}
                  <span className="wd-label">{it.name}</span>
                  {!have &&
                    (it.unlock ? (
                      <em className="wd-lock" title={it.unlock.text}>
                        <Lock />
                        冠軍
                      </em>
                    ) : (
                      <em className="wd-price">{it.price}</em>
                    ))}
                </button>
              )
            })}
          </div>
          {cost.locked.length > 0 && <p className="pm-small wd-note">{cost.locked.map((x) => `${x.name}：${x.unlock!.text}才能穿`).join('、')}</p>}
        </div>
      </div>
      <div className="sheet-actions">
        {p.myLook && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              resetLook()
              close()
            }}
          >
            改回名字頭像
          </button>
        )}
        <button type="button" className="btn" onClick={close}>
          取消
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={cost.locked.length > 0 || p.coins < cost.coins}
          onClick={() => saveLook(draft) && close()}
        >
          {p.coins < cost.coins && !cost.locked.length ? `金幣不夠（要 ${fmt(cost.coins)}）` : label}
        </button>
      </div>
    </Sheet>
  )
}
