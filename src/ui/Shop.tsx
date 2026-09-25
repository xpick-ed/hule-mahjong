import { motion } from 'motion/react'
import { BOSSES } from '../engine/bosses'
import { bossFor, roundTitle } from '../engine/game'
import { GODS, RARITY_NAME } from '../engine/gods'
import { ITEMS } from '../engine/items'
import { tileName } from '../engine/tiles'
import type { RunState, ShopSlot } from '../engine/types'
import { useUI } from '../store'
import { cls, GodPlaque, ItemSlip, Price, TileStatic } from './bits'
import { Shrine } from './RunScreen'

export function slotInfo(slot: ShopSlot): { name: string; desc: string; tag: string } {
  if (slot.kind === 'god') {
    const g = GODS[slot.id]
    return { name: g.name, desc: g.desc, tag: `神明・${RARITY_NAME[g.rarity]}` }
  }
  if (slot.kind === 'item') {
    const it = ITEMS[slot.id]
    return { name: it.name, desc: it.desc, tag: it.kind === 'talisman' ? '符' : '牌譜' }
  }
  const enh = slot.tile.enh === 'gold' ? '金牌：過關時還在手上 +3 銅錢' : slot.tile.enh === 'jade' ? '玉牌：計分時 +2 台' : ''
  const what = slot.tile.kind[0] === 'f' ? '花牌：摸到自動亮出，胡牌時 +1 台' : slot.tile.kind[0] === 'z' ? '字牌：牌面 10 分，可以湊刻子' : ''
  return {
    name: `${tileName(slot.tile.kind)}${slot.tile.enh === 'gold' ? '（金）' : slot.tile.enh === 'jade' ? '（玉）' : ''}`,
    desc: `加進牌山。${enh || what}`,
    tag: '牌',
  }
}

export function SlotVisual({ slot, big }: { slot: ShopSlot; big?: boolean }) {
  if (slot.kind === 'god') return <GodPlaque id={slot.id} big={big} />
  if (slot.kind === 'item') return <ItemSlip id={slot.id} big={big} />
  return <TileStatic tile={slot.tile} size={big ? 58 : 46} />
}

export function nextPos(run: RunState) {
  let { wind, no } = run
  no++
  if (no > 3) {
    no = 0
    wind++
  }
  return { wind, no }
}

export function ShopView({ run }: { run: RunState }) {
  const buy = useUI((s) => s.buy)
  const reroll = useUI((s) => s.reroll)
  const next = useUI((s) => s.next)
  const setInfo = useUI((s) => s.setInfo)
  const shop = run.shop
  if (!shop) return null
  const pos = nextPos(run)
  const finished = pos.wind === 4 && !run.endless
  const boss = pos.no === 3 ? BOSSES[bossFor(run, pos.wind)] : null

  return (
    <main className="shop">
      <header className="shop-head">
        <h2>廟口</h2>
        <p>請神明、買符、加牌。買好了就出發。</p>
      </header>

      <div className="wares">
        {shop.slots.map((slot, i) => {
          const info = slotInfo(slot)
          return (
            <motion.article
              key={`${shop.rerollCost}-${i}`}
              className={cls('ware', slot.sold && 'sold')}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <button type="button" className="ware-visual" onClick={() => setInfo({ kind: 'slot', index: i })} aria-label={`${info.name}的說明`}>
                <SlotVisual slot={slot} />
              </button>
              <div className="ware-text">
                <span className="ware-tag">{info.tag}</span>
                <h3>{info.name}</h3>
                <p>{info.desc}</p>
              </div>
              <button type="button" className="btn buy" disabled={slot.sold || run.coins < slot.price} onClick={() => buy(i)}>
                {slot.sold ? '已買' : <Price n={slot.price} />}
              </button>
            </motion.article>
          )
        })}
      </div>

      <button type="button" className="btn reroll" disabled={run.coins < shop.rerollCost} onClick={reroll}>
        換一批 <Price n={shop.rerollCost} />
      </button>

      <div className="shop-owned">
        <span className="owned-label">你的神龕與符袋（點一下可以賣或調順序）</span>
        <Shrine run={run} />
      </div>

      <div className="next-card">
        {finished ? (
          <p>下一站：回到人間</p>
        ) : (
          boss && (
            <p className="next-boss">
              下一局是魔王局・{boss.name}：{boss.desc}
            </p>
          )
        )}
        <button type="button" className="btn primary wide" onClick={next}>
          {finished ? '打完了，回人間' : `出發：${roundTitle(pos.wind, pos.no)}`}
        </button>
      </div>
    </main>
  )
}
