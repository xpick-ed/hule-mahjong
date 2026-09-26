import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { tileName, type Kind } from '../engine/tiles'
import { TileFace } from './TileFace'

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0'
}

/** 數字從舊值滾到新值 */
export function CountUp({ value, ms = 500, signed }: { value: number; ms?: number; signed?: boolean }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const from = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setShown(Math.round(from + (value - from) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{signed ? fmtSigned(shown) : fmt(shown)}</>
}

interface TileProps {
  kind: Kind
  w: number
  hot?: boolean
  selected?: boolean
  dim?: boolean
  mark?: boolean
  /** 危險牌提示：安全／有點危險／很危險 */
  badge?: 'safe' | 'risky' | 'danger'
  fresh?: boolean
  onClick?: () => void
  children?: ReactNode
  label?: string
}

/** 一張牌。有 onClick 就是按鈕 */
const BADGE = { safe: '安', risky: '', danger: '危' } as const

export function Tile({ kind, w, hot, selected, dim, mark, badge, fresh, onClick, children, label }: TileProps) {
  const className = cls('mt', hot && 'hot', selected && 'sel', dim && 'dim', mark && 'mark', fresh && 'fresh', badge && `b-${badge}`)
  const style = { '--w': `${w}px` } as CSSProperties
  const inner = (
    <>
      <span className="mt-face">
        <TileFace kind={kind} />
      </span>
      {badge && BADGE[badge] && (
        <span className="mt-badge" aria-hidden="true">
          {BADGE[badge]}
        </span>
      )}
      {children}
    </>
  )
  return onClick ? (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      aria-label={(label ?? tileName(kind)) + (badge === 'danger' ? '（危險）' : badge === 'safe' ? '（安全）' : '')}
      aria-pressed={selected}
    >
      {inner}
    </button>
  ) : (
    <span className={className} style={style} aria-label={label ?? tileName(kind)} role="img">
      {inner}
    </span>
  )
}

export function Back({ w, h }: { w: number; h: number }) {
  return <span className="mb" style={{ width: w, height: h }} aria-hidden="true" />
}

/**
 * 邏輯畫面：高度固定 390，寬度跟著可用區域比例（720–960 之間），整個等比縮放。
 * 可用區域 = 視窗扣掉瀏海、Home 指示條（safe-area），所以量 .viewport 本身的大小。
 * 手機直拿時整個畫面轉 90 度（橫著畫），把手機往左轉就能玩——鎖了螢幕旋轉也可以。
 */
function fit(vw: number, vh: number) {
  const portrait = vh > vw * 1.05
  const [aw, ah] = portrait ? [vh, vw] : [vw, vh]
  const H = 390
  const W = Math.round(Math.max(720, Math.min(960, (H * aw) / Math.max(1, ah))))
  const scale = Math.min(aw / W, ah / H)
  return { W, H, scale, portrait }
}

export function useStageSize() {
  const [s, setS] = useState(() => fit(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const el = document.querySelector('.viewport')
    const on = () => {
      const r = el?.getBoundingClientRect()
      setS(fit(r?.width || window.innerWidth, r?.height || window.innerHeight))
    }
    on()
    const ro = el ? new ResizeObserver(on) : null
    if (el && ro) ro.observe(el)
    window.addEventListener('orientationchange', on)
    return () => {
      ro?.disconnect()
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return s
}

export function Stage({ children }: { children: ReactNode }) {
  const { W, H, scale, portrait } = useStageSize()
  // 直拿時提示一下「往左轉」，幾秒後或點一下就收起來
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!portrait) return setHint(false)
    setHint(true)
    const id = window.setTimeout(() => setHint(false), 4000)
    return () => window.clearTimeout(id)
  }, [portrait])
  const transform = `translate(-50%, -50%)${portrait ? ' rotate(90deg)' : ''} scale(${scale})`
  return (
    <>
      <div className="viewport">
        <div className="stage" style={{ width: W, height: H, transform, '--W': `${W}px` } as CSSProperties}>
          {children}
        </div>
      </div>
      {hint && (
        <button type="button" className="rotate-hint" onClick={() => setHint(false)}>
          <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
            <rect x="20" y="8" width="24" height="42" rx="5" fill="none" stroke="currentColor" strokeWidth="3.5" />
            <path d="M52 20 Q56 6 40 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M44 1 L39 6 L44 11" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          把手機往左轉，橫著玩
        </button>
      )}
    </>
  )
}
