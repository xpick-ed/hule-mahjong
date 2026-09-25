import { memo } from 'react'
import { cat, CN_NUM, flowerChar, honorChar, rank, type Kind } from '../engine/tiles'

// 牌面全用 SVG 畫，viewBox 60×82。顏色跟真的麻將牌一樣：藍、紅、綠三色。
const RED = '#b8352b'
const GREEN = '#2d7a4f'
const NAVY = '#23456e'
const INK = '#1f2433'
const C = { n: NAVY, r: RED, g: GREEN } as const
type Col = keyof typeof C

// 筒：[x, y, 半徑, 顏色]
const PIN: Record<number, [number, number, number, Col][]> = {
  2: [
    [30, 22, 11, 'g'],
    [30, 60, 11, 'n'],
  ],
  3: [
    [15, 16, 9, 'n'],
    [30, 41, 9, 'r'],
    [45, 66, 9, 'g'],
  ],
  4: [
    [18, 22, 10, 'n'],
    [42, 22, 10, 'g'],
    [18, 60, 10, 'g'],
    [42, 60, 10, 'n'],
  ],
  5: [
    [16, 18, 9, 'n'],
    [44, 18, 9, 'g'],
    [30, 41, 9, 'r'],
    [16, 64, 9, 'g'],
    [44, 64, 9, 'n'],
  ],
  6: [
    [19, 15, 8.5, 'g'],
    [41, 15, 8.5, 'g'],
    [19, 43, 8.5, 'r'],
    [41, 43, 8.5, 'r'],
    [19, 67, 8.5, 'r'],
    [41, 67, 8.5, 'r'],
  ],
  7: [
    [13, 12, 7, 'g'],
    [30, 20, 7, 'g'],
    [47, 28, 7, 'g'],
    [19, 49, 8, 'r'],
    [41, 49, 8, 'r'],
    [19, 69, 8, 'r'],
    [41, 69, 8, 'r'],
  ],
  8: [19, 41].flatMap((x) => [12, 31, 51, 70].map((y) => [x, y, 8, 'n'] as [number, number, number, Col])),
  9: [15, 41, 67].flatMap((y, row) =>
    [13, 30, 47].map((x) => [x, y, 8, (['n', 'r', 'g'] as Col[])[row]] as [number, number, number, Col]),
  ),
}

// 條：[x, y, 高度, 顏色]
const SOU: Record<number, [number, number, number, Col][]> = {
  2: [
    [30, 22, 26, 'g'],
    [30, 60, 26, 'g'],
  ],
  3: [
    [30, 22, 26, 'g'],
    [19, 60, 26, 'g'],
    [41, 60, 26, 'g'],
  ],
  4: [
    [19, 22, 26, 'g'],
    [41, 22, 26, 'n'],
    [19, 60, 26, 'n'],
    [41, 60, 26, 'g'],
  ],
  5: [
    [16, 22, 26, 'g'],
    [44, 22, 26, 'n'],
    [30, 41, 24, 'r'],
    [16, 60, 26, 'n'],
    [44, 60, 26, 'g'],
  ],
  6: [15, 30, 45].flatMap((x) => [22, 60].map((y) => [x, y, 26, 'g'] as [number, number, number, Col])),
  7: [
    [30, 13, 18, 'r'],
    ...[15, 30, 45].flatMap((x) => [41, 66].map((y) => [x, y, 20, 'g'] as [number, number, number, Col])),
  ],
  8: [12, 24, 36, 48].flatMap((x, i) => [22, 60].map((y) => [x, y, 26, i % 3 ? 'g' : 'n'] as [number, number, number, Col])),
  9: [15, 30, 45].flatMap((x) =>
    [15, 41, 67].map((y) => [x, y, 20, x === 30 ? 'r' : 'g'] as [number, number, number, Col]),
  ),
}

function Circle({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={r * 0.24} />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke={c} strokeWidth={r * 0.08} strokeDasharray="1.6 1.4" />
      <circle cx={x} cy={y} r={r * 0.34} fill={c} />
    </g>
  )
}

function Stick({ x, y, h, c }: { x: number; y: number; h: number; c: string }) {
  return (
    <g>
      <rect x={x - 3.3} y={y - h / 2} width={6.6} height={h} rx={3.3} fill={c} />
      <rect x={x - 3.3} y={y - 0.8} width={6.6} height={1.6} fill="#f6efdc" />
      <rect x={x - 1} y={y - h / 2 + 2.5} width={1.3} height={h / 2 - 4} rx={0.6} fill="#f6efdc" opacity={0.45} />
    </g>
  )
}

function Bird() {
  return (
    <g>
      <path d="M22 54 L12 74 M27 56 L24 76 M32 56 L38 75" stroke={GREEN} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M31 22 C43 24 49 38 42 49 C37 57 25 59 20 52 C15 45 20 36 29 34 Z" fill={GREEN} />
      <path d="M26 40 C31 38 37 41 39 46" stroke="#f6efdc" strokeWidth={1.4} fill="none" opacity={0.7} />
      <circle cx={30} cy={19} r={6.5} fill={RED} />
      <circle cx={31.5} cy={18} r={1.3} fill="#f6efdc" />
      <path d="M24.5 18 L17 17 L24.5 22 Z" fill="#d9a93f" />
    </g>
  )
}

function Glyph({ ch, y = 42, size = 46, fill = INK }: { ch: string; y?: number; size?: number; fill?: string }) {
  return (
    <text className="tf" x={30} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fill={fill}>
      {ch}
    </text>
  )
}

function Face({ kind }: { kind: Kind }) {
  const c = cat(kind)
  const r = rank(kind)
  if (c === 'm') {
    return (
      <>
        <Glyph ch={CN_NUM[r - 1]} y={24} size={30} />
        <Glyph ch="萬" y={60} size={31} fill={RED} />
      </>
    )
  }
  if (c === 'p') {
    if (r === 1) {
      return (
        <g>
          <circle cx={30} cy={41} r={21} fill="none" stroke={GREEN} strokeWidth={3.4} />
          <circle cx={30} cy={41} r={15.5} fill="none" stroke={NAVY} strokeWidth={1.3} strokeDasharray="2.4 1.8" />
          <circle cx={30} cy={41} r={11} fill="none" stroke={RED} strokeWidth={2.6} />
          <circle cx={30} cy={41} r={5.5} fill={RED} />
        </g>
      )
    }
    return (
      <>
        {PIN[r].map(([x, y, rr, col], i) => (
          <Circle key={i} x={x} y={y} r={rr} c={C[col]} />
        ))}
      </>
    )
  }
  if (c === 's') {
    if (r === 1) return <Bird />
    return (
      <>
        {SOU[r].map(([x, y, h, col], i) => (
          <Stick key={i} x={x} y={y} h={h} c={C[col]} />
        ))}
      </>
    )
  }
  if (c === 'z') {
    if (r === 7) {
      return (
        <g fill="none" stroke={NAVY}>
          <rect x={13} y={15} width={34} height={52} rx={3} strokeWidth={3} />
          <rect x={18} y={20} width={24} height={42} rx={1.5} strokeWidth={1.2} />
        </g>
      )
    }
    const fill = r === 5 ? RED : r === 6 ? GREEN : INK
    return <Glyph ch={honorChar(kind)} size={48} fill={fill} />
  }
  // 花牌：字＋角落的序號
  return (
    <>
      <text className="tf" x={9} y={13} fontSize={12} fill={NAVY} textAnchor="middle" dominantBaseline="central">
        {((r - 1) % 4) + 1}
      </text>
      <Glyph ch={flowerChar(kind)} y={46} size={40} fill={r <= 4 ? GREEN : RED} />
    </>
  )
}

export const TileFace = memo(function TileFace({ kind }: { kind: Kind }) {
  return (
    <svg className="tile-svg" viewBox="0 0 60 82" aria-hidden="true">
      <Face kind={kind} />
    </svg>
  )
})
