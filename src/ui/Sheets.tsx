import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { BOSSES } from '../engine/bosses'
import { sellValue } from '../engine/game'
import { GODS, RARITY_NAME } from '../engine/gods'
import { ITEMS, meldBase } from '../engine/items'
import { PATTERNS, patternMult } from '../engine/patterns'
import { level } from '../engine/scoring'
import { useUI } from '../store'
import { GodPlaque, ItemSlip, Price } from './bits'
import { slotInfo, SlotVisual } from './Shop'

function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="sheet"
            role="dialog"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <span className="sheet-grip" aria-hidden="true" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function InfoSheet() {
  const info = useUI((s) => s.info)
  const run = useUI((s) => s.run)
  const setInfo = useUI((s) => s.setInfo)
  const sel = useUI((s) => s.sel)
  const { sellGod, sellItem, moveGod, applyItem, buy } = useUI.getState()
  const close = () => setInfo(null)
  let body: ReactNode = null

  if (info && run) {
    const scoring = run.round && run.round.status !== 'play'
    if (info.kind === 'god') {
      const i = run.gods.findIndex((g) => g.uid === info.uid)
      const inst = run.gods[i]
      if (inst) {
        const g = GODS[inst.id]
        body = (
          <>
            <div className="sheet-head">
              <GodPlaque id={g.id} big />
              <div>
                <span className="sheet-tag">神明・{RARITY_NAME[g.rarity]}</span>
                <h3>{g.name}</h3>
                <p>{g.desc}</p>
                {g.status && <p className="status">{g.status(inst, run)}</p>}
              </div>
            </div>
            <p className="sheet-note">神明由左到右觸發。「×台」的神明放越右邊，乘到的台數越多。</p>
            <div className="sheet-actions">
              <button type="button" className="btn" disabled={i === 0} onClick={() => moveGod(inst.uid, -1)}>
                往左
              </button>
              <button type="button" className="btn" disabled={i === run.gods.length - 1} onClick={() => moveGod(inst.uid, 1)}>
                往右
              </button>
              <button type="button" className="btn danger" disabled={!!scoring} onClick={() => sellGod(inst.uid)}>
                送走 <Price n={sellValue(g.price)} />
              </button>
            </div>
          </>
        )
      }
    } else if (info.kind === 'item') {
      const inst = run.items.find((x) => x.uid === info.uid)
      if (inst) {
        const it = ITEMS[inst.id]
        const needsTiles = it.min !== undefined
        const inRound = run.phase === 'round' && run.round?.status === 'play'
        const canUse = needsTiles ? inRound : !scoring
        body = (
          <>
            <div className="sheet-head">
              <ItemSlip id={it.id} big />
              <div>
                <span className="sheet-tag">{it.kind === 'talisman' ? '符' : '牌譜'}</span>
                <h3>{it.name}</h3>
                <p>{it.desc}</p>
                {it.level && run && <p className="status">目前 {level(run, it.level)} 級</p>}
              </div>
            </div>
            {needsTiles && (
              <p className="sheet-note">
                {inRound ? `先在手牌選好牌再使用。現在選了 ${sel.length} 張。` : '要在牌局中選好手牌才能用。'}
              </p>
            )}
            <div className="sheet-actions">
              <button type="button" className="btn primary" disabled={!canUse} onClick={() => applyItem(inst.uid)}>
                使用
              </button>
              <button type="button" className="btn danger" onClick={() => sellItem(inst.uid)}>
                賣掉 <Price n={sellValue(it.price)} />
              </button>
            </div>
          </>
        )
      }
    } else if (info.kind === 'slot') {
      const slot = run.shop?.slots[info.index]
      if (slot) {
        const d = slotInfo(slot)
        body = (
          <>
            <div className="sheet-head">
              <SlotVisual slot={slot} big />
              <div>
                <span className="sheet-tag">{d.tag}</span>
                <h3>{d.name}</h3>
                <p>{d.desc}</p>
              </div>
            </div>
            <div className="sheet-actions">
              <button type="button" className="btn primary" disabled={slot.sold || run.coins < slot.price} onClick={() => buy(info.index)}>
                {slot.sold ? '已買' : <>買 <Price n={slot.price} /></>}
              </button>
            </div>
          </>
        )
      }
    } else if (info.kind === 'boss' && run.round?.boss) {
      const b = BOSSES[run.round.boss]
      body = (
        <>
          <div className="sheet-head">
            <span className="boss-seal">{b.name.slice(0, 1)}</span>
            <div>
              <span className="sheet-tag">魔王局</span>
              <h3>{b.name}</h3>
              <p>{b.desc}</p>
            </div>
          </div>
          <p className="sheet-note">「不計分」的牌不加分、也不觸發神明，但牌型照算。</p>
        </>
      )
    }
  }

  return (
    <Sheet open={!!body} onClose={close} label="說明">
      {body}
    </Sheet>
  )
}

export function HelpSheet() {
  const open = useUI((s) => s.help)
  const setHelp = useUI((s) => s.setHelp)
  const run = useUI((s) => s.run)
  return (
    <Sheet open={open} onClose={() => setHelp(false)} label="怎麼玩">
      <div className="help">
        <h3>怎麼玩</h3>
        <ol className="rules">
          <li>點手牌選取。湊成順子、刻子、槓就能<b>出牌</b>放上桌；對子放成雀頭。出牌後會自動補牌。</li>
          <li>不要的牌可以<b>換牌</b>：一次 1–5 張，每局次數有限。</li>
          <li>桌上湊滿 4 組面子＋1 組雀頭就<b>胡</b>。得分＝分×台，加進本局。</li>
          <li>本局分數達到目標就過關。沒達標會清桌，手牌留著繼續胡下一手。</li>
          <li>換牌用完又出不了牌就流局：桌上的牌只算分。沒達標就結束這一輪。</li>
          <li>過關後去廟口：請神明、買符和牌譜、加牌進牌山。每圈第 4 局有魔王。</li>
        </ol>
        <h4>面子底分</h4>
        <table className="ptable">
          <tbody>
            {(['chow', 'pung', 'kong', 'pair'] as const).map((m) => (
              <tr key={m}>
                <td>{{ chow: '順子', pung: '刻子', kong: '槓', pair: '雀頭' }[m]}</td>
                <td className="num chips">{meldBase(m, run ? level(run, m) : 1)} 分</td>
                <td className="lv">{run && level(run, m) > 1 ? `${level(run, m)} 級` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help-note">每張牌再加牌面分：數牌是點數，字牌 10。</p>
        <h4>牌型台數</h4>
        <table className="ptable">
          <tbody>
            {PATTERNS.map((p) => {
              const lv = run ? level(run, p.id) : 1
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="desc">{p.desc}</td>
                  <td className="num mult">+{patternMult(p.id, lv)}</td>
                  <td className="lv">{lv > 1 ? `${lv} 級` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="help-note">底台是 1。胡牌之後才算牌型；流局台數固定 1。</p>
      </div>
    </Sheet>
  )
}

export function MenuSheet() {
  const open = useUI((s) => s.menu)
  const settings = useUI((s) => s.settings)
  const run = useUI((s) => s.run)
  const { setMenu, setHelp, setSettings, toTitle, newRun } = useUI.getState()
  return (
    <Sheet open={open} onClose={() => setMenu(false)} label="選單">
      <div className="menu">
        <button type="button" className="btn wide" onClick={() => setHelp(true)}>
          怎麼玩、牌型台數表
        </button>
        <div className="setting">
          <span>音效</span>
          <button type="button" className="toggle" aria-pressed={settings.sound} onClick={() => setSettings({ sound: !settings.sound })}>
            {settings.sound ? '開' : '關'}
          </button>
        </div>
        <div className="setting">
          <span>計分速度</span>
          <div className="seg">
            {[1, 2, 3].map((v) => (
              <button key={v} type="button" aria-pressed={settings.speed === v} onClick={() => setSettings({ speed: v })}>
                {v}×
              </button>
            ))}
          </div>
        </div>
        {run && <p className="seed">種子 {run.seed}</p>}
        <button type="button" className="btn ghost wide" onClick={toTitle}>
          回首頁（進度會保留）
        </button>
        <button
          type="button"
          className="btn danger wide"
          onClick={() => {
            if (window.confirm('放棄這一輪，重新開始？')) newRun()
          }}
        >
          放棄這一輪，重新開始
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
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.key} className="toast" role="status" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
