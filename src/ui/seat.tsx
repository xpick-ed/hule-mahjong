// 每個座位是誰：你、連線的朋友、或電腦角色。名字和頭像都從這裡拿。

import { CHARACTERS } from '../engine/characters'
import type { MatchState } from '../engine/match'
import { lookFor, myName, useUI, type Mood } from '../store'
import { Avatar, MeBadge } from './Avatar'

/** 連線的朋友（不是你） */
export const isFriend = (m: MatchState, seat: number) => seat !== 0 && !!m.players?.[seat]?.human

export function seatName(m: MatchState, seat: number): string {
  if (seat === 0) return myName()
  return m.players?.[seat]?.name ?? CHARACTERS[m.chars[seat]]?.name ?? '電腦'
}

const FRIEND_COLORS = ['#1d2a4a', '#ef3d5c', '#3a6df0', '#13a37f']

/** 朋友的頭像：圓圈放名字第一個字，每個座位一個顏色 */
export function PlayerBadge({ name, seat, size = 30 }: { name: string; seat: number; size?: number }) {
  const ch = [...name.trim()][0] ?? '?'
  const latin = /[\x00-\x7f]/.test(ch)
  return (
    <svg className="avatar-svg" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill={FRIEND_COLORS[seat % 4]} />
      <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fontSize={latin ? 17 : 15} fontWeight="900" fill="#fff" fontFamily="var(--ui)">
        {latin ? ch.toUpperCase() : ch}
      </text>
    </svg>
  )
}

/** 任何座位的頭像 */
export function SeatFace({ m, seat, size = 34, mood }: { m: MatchState; seat: number; size?: number; mood?: Mood }) {
  const progress = useUI((s) => s.progress)
  if (seat === 0) return <MeBadge size={size} />
  if (isFriend(m, seat)) return <PlayerBadge name={seatName(m, seat)} seat={seat} size={size} />
  const id = m.chars[seat]
  if (!CHARACTERS[id]) return <PlayerBadge name={seatName(m, seat)} seat={seat} size={size} />
  return <Avatar look={lookFor(progress, id)} mood={mood} size={size} />
}
