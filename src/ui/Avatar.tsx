import { memo } from 'react'
import type { Look } from '../engine/characters'
import type { Mood } from '../store'

// 扁平插畫頭像（viewBox 64×64）。頭髮、配件用參數組合，表情跟著牌局變：普通／開心／難過。

const INK = '#1d2a4a'

function HairBack({ look }: { look: Look }) {
  const c = look.hairColor
  switch (look.hair) {
    case 'perm':
      return (
        <g fill={c}>
          <circle cx="32" cy="26" r="18" />
          {[
            [15, 20],
            [21, 12],
            [32, 9],
            [43, 12],
            [49, 20],
            [16, 32],
            [48, 32],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="7.5" />
          ))}
        </g>
      )
    case 'long':
      return <path d="M16 30 Q14 14 32 13 Q50 14 48 30 L50 56 Q32 60 14 56 Z" fill={c} />
    case 'bob':
      return <path d="M16 32 Q15 14 32 14 Q49 14 48 32 L48 46 Q32 50 16 46 Z" fill={c} />
    case 'ponytail':
      return (
        <g fill={c}>
          <ellipse cx="50" cy="30" rx="7" ry="11" transform="rotate(20 50 30)" />
          <circle cx="32" cy="27" r="16" />
        </g>
      )
    case 'bun':
      return (
        <g fill={c}>
          <circle cx="32" cy="12" r="7" />
          <circle cx="32" cy="28" r="16" />
        </g>
      )
    default:
      return null
  }
}

function HairFront({ look }: { look: Look }) {
  const c = look.hairColor
  switch (look.hair) {
    case 'short':
      return <path d="M19 32 Q18 17 32 17 Q46 17 45 32 Q41 24 32 24 Q24 24 19 32 Z" fill={c} />
    case 'spiky':
      return <path d="M18 31 L17 20 L23 23 L25 14 L30 20 L34 12 L37 20 L43 14 L42 23 L47 20 L46 31 Q40 24 32 24 Q24 24 18 31 Z" fill={c} />
    case 'slick':
      return <path d="M19 31 Q18 16 33 17 Q47 18 45 31 Q43 22 36 22 Q28 22 26 26 Q23 24 19 31 Z" fill={c} />
    case 'bald':
      return (
        <g fill={c}>
          <path d="M18 34 Q18 28 21 27 L21 36 Z" />
          <path d="M46 34 Q46 28 43 27 L43 36 Z" />
        </g>
      )
    case 'perm':
    case 'bun':
    case 'ponytail':
      return <path d="M19 30 Q20 19 32 19 Q44 19 45 30 Q38 24 32 25 Q25 24 19 30 Z" fill={c} />
    case 'long':
    case 'bob':
      return <path d="M19 31 Q19 18 32 18 Q45 18 45 31 Q40 22 30 25 Q24 26 19 31 Z" fill={c} />
  }
}

function Face({ mood }: { mood: Mood }) {
  if (mood === 'happy') {
    return (
      <g stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round">
        <path d="M24.5 35 Q27 32 29.5 35" />
        <path d="M34.5 35 Q37 32 39.5 35" />
        <path d="M26.5 41 Q32 48 37.5 41 Z" fill="#d2405a" stroke="none" />
      </g>
    )
  }
  if (mood === 'sad') {
    return (
      <g>
        <path d="M24 31 L29 32.5 M40 31 L35 32.5" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="27" cy="35.5" r="1.8" fill={INK} />
        <circle cx="37" cy="35.5" r="1.8" fill={INK} />
        <path d="M28 45 Q32 41.5 36 45" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M40 38 Q41 41 40 42.5 Q38.6 41 40 38 Z" fill="#6cc3f5" />
      </g>
    )
  }
  return (
    <g>
      <circle cx="27" cy="35" r="1.9" fill={INK} />
      <circle cx="37" cy="35" r="1.9" fill={INK} />
      <path d="M28 42.5 Q32 45.5 36 42.5" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  )
}

function Extras({ look }: { look: Look }) {
  const ex = look.extras ?? []
  return (
    <>
      {ex.includes('earrings') && (
        <g fill="#ffb020">
          <circle cx="19" cy="41" r="2" />
          <circle cx="45" cy="41" r="2" />
        </g>
      )}
      {ex.includes('mustache') && <path d="M26 40.5 Q29 38.5 32 40.5 Q35 38.5 38 40.5 Q35 42.5 32 41.2 Q29 42.5 26 40.5 Z" fill="#6f6f6f" />}
      {ex.includes('beard') && <path d="M20 38 Q21 50 32 51 Q43 50 44 38 Q41 46 32 46.5 Q23 46 20 38 Z" fill={look.hairColor} />}
      {ex.includes('glasses') && (
        <g fill="none" stroke={INK} strokeWidth="1.8">
          <rect x="21.5" y="31.5" width="10" height="7.5" rx="2.5" />
          <rect x="32.5" y="31.5" width="10" height="7.5" rx="2.5" />
        </g>
      )}
      {ex.includes('sunglasses') && (
        <g fill={INK}>
          <rect x="21" y="31" width="10.5" height="7" rx="2.5" />
          <rect x="32.5" y="31" width="10.5" height="7" rx="2.5" />
          <rect x="30" y="32.5" width="4" height="1.6" />
        </g>
      )}
      {ex.includes('cap') && (
        <g fill={look.capColor ?? '#ef3d5c'}>
          <path d="M18 28 Q18 13 32 13 Q46 13 46 28 Z" />
          <rect x="14" y="26" width="36" height="4.5" rx="2.2" opacity=".85" />
        </g>
      )}
      {ex.includes('bow') && (
        <g fill="#ef3d5c">
          <path d="M40 18 L47 14 L47 22 Z" />
          <path d="M40 18 L33 14 L33 22 Z" />
          <circle cx="40" cy="18" r="2" />
        </g>
      )}
      {ex.includes('headphones') && (
        <g>
          <path d="M17 34 Q17 13 32 13 Q47 13 47 34" fill="none" stroke={INK} strokeWidth="2.6" />
          <rect x="14" y="31" width="6" height="10" rx="3" fill={INK} />
          <rect x="44" y="31" width="6" height="10" rx="3" fill={INK} />
        </g>
      )}
    </>
  )
}

export const Avatar = memo(function Avatar({ look, mood = 'normal', size = 42 }: { look: Look; mood?: Mood; size?: number }) {
  const ex = look.extras ?? []
  return (
    <svg className="avatar-svg" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill={look.bg} />
      <g clipPath="url(#avatar-clip)">
        <path d="M8 66 Q10 50 32 49 Q54 50 56 66 Z" fill={look.shirt} />
        {ex.includes('tie') && <path d="M30 50 L34 50 L35 60 L32 64 L29 60 Z" fill="#ef3d5c" />}
        <HairBack look={look} />
        <ellipse cx="19.5" cy="36" rx="2.6" ry="3.6" fill={look.skin} />
        <ellipse cx="44.5" cy="36" rx="2.6" ry="3.6" fill={look.skin} />
        <ellipse cx="32" cy="35" rx="13" ry="15" fill={look.skin} />
        <circle cx="24" cy="40" r="2.6" fill="#ff8fa3" opacity=".45" />
        <circle cx="40" cy="40" r="2.6" fill="#ff8fa3" opacity=".45" />
        <HairFront look={look} />
        <Face mood={mood} />
        <Extras look={look} />
      </g>
      <defs>
        <clipPath id="avatar-clip">
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
    </svg>
  )
})

/** 你自己的頭像（簡單的圖案，不是人臉） */
export function MeBadge({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1d2a4a" />
      <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="#ffe066" fontFamily="var(--ui)">
        你
      </text>
    </svg>
  )
}
