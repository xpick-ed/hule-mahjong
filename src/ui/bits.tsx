import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { GODS } from '../engine/gods'
import { ITEMS } from '../engine/items'
import { tileName, type Tile } from '../engine/tiles'
import { TileFace } from './TileFace'

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

/** 量元素寬度（手牌、桌面依寬度決定牌的大小） */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** 視窗高度（矮的手機桌面改成三欄） */
export function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}

/** 數字從舊值滾到新值 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const dur = 450
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur)
      const v = Math.round(a + (value - a) * (1 - (1 - k) ** 3))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value])
  return <span className={className}>{fmt(shown)}</span>
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  return Math.round(n).toLocaleString('en-US')
}

export function fmtMult(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** 銅錢：圓形方孔 */
export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx={10} cy={10} r={9} fill="#d9a93f" stroke="#8a6414" strokeWidth={1.2} />
      <circle cx={10} cy={10} r={6.6} fill="none" stroke="#f3d27a" strokeWidth={0.8} opacity={0.8} />
      <rect x={7.2} y={7.2} width={5.6} height={5.6} fill="#2a1a12" stroke="#8a6414" strokeWidth={0.8} />
    </svg>
  )
}

export function Price({ n }: { n: number }) {
  return (
    <span className="price">
      <Coin size={14} />
      {n}
    </span>
  )
}

interface TileProps {
  tile: Tile
  size: number
  selected?: boolean
  dim?: boolean
  pop?: boolean
  onClick?: () => void
  children?: ReactNode
  /** 在桌上的牌不播入場動畫，靠 layoutId 從手上飛過來 */
  fromHand?: boolean
}

// 手牌離場：換掉的牌往下飛走；出牌的牌立刻消失，由桌上同一個 layoutId 的牌接著飛過去
const tileVariants = {
  gone: (reason: 'play' | 'discard' | null) =>
    reason === 'discard'
      ? { y: 40, opacity: 0, rotate: 10, transition: { duration: 0.22 } }
      : { opacity: 0, transition: { duration: 0 } },
}

export function TileView({ tile, size, selected, dim, pop, onClick, children, fromHand }: TileProps) {
  return (
    <motion.button
      type="button"
      layoutId={`t${tile.id}`}
      className={cls('tile', selected && 'sel', tile.enh, dim && 'dim', pop && 'pop', !onClick && 'static')}
      style={{ '--tw': `${size}px` } as CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${tileName(tile.kind)}${tile.enh === 'gold' ? '（金）' : tile.enh === 'jade' ? '（玉）' : ''}`}
      aria-pressed={selected}
      layout
      initial={fromHand ? false : { y: -28, opacity: 0 }}
      animate={{ y: selected ? -Math.round(size * 0.22) : 0, opacity: 1 }}
      variants={tileVariants}
      exit="gone"
      transition={{ type: 'spring', stiffness: 560, damping: 36 }}
    >
      <span className="tile-face">
        <TileFace kind={tile.kind} />
      </span>
      {children}
    </motion.button>
  )
}

const RARITY_CLASS = { 1: 'r1', 2: 'r2', 3: 'r3' } as const

export function GodPlaque({ id, active, bubble, onClick, big }: { id: string; active?: boolean; bubble?: ReactNode; onClick?: () => void; big?: boolean }) {
  const g = GODS[id]
  const className = cls('plaque', RARITY_CLASS[g.rarity], active && 'shake', big && 'big')
  const inner = (
    <>
      <span className="plaque-name" data-len={g.name.length}>
        {g.name}
      </span>
      {bubble}
    </>
  )
  // 沒有點擊動作時用 span（放在別的按鈕裡不能再包按鈕）
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={`${g.name}：${g.desc}`}>
      {inner}
    </button>
  ) : (
    <span className={className} aria-hidden="true">
      {inner}
    </span>
  )
}

export function ItemSlip({ id, onClick, big }: { id: string; onClick?: () => void; big?: boolean }) {
  const it = ITEMS[id]
  const className = cls('slip', it.kind, big && 'big')
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={`${it.name}：${it.desc}`}>
      <span className="slip-name">{it.name}</span>
    </button>
  ) : (
    <span className={className} aria-hidden="true">
      <span className="slip-name">{it.name}</span>
    </span>
  )
}

/** 不參與動畫的牌（廟口、說明） */
export function TileStatic({ tile, size }: { tile: { kind: string; enh?: Tile['enh'] }; size: number }) {
  return (
    <span className={cls('tile', 'static', tile.enh)} style={{ '--tw': `${size}px` } as CSSProperties} aria-label={tileName(tile.kind)}>
      <span className="tile-face">
        <TileFace kind={tile.kind} />
      </span>
    </span>
  )
}

export function EmptySlot({ kind }: { kind: 'plaque' | 'slip' }) {
  return <span className={cls('empty-slot', kind === 'slip' && 'for-slip')} aria-hidden="true" />
}
