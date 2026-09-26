// 視覺風格提案用的靜態牌桌（橫向手機 844×390）。同一個畫面、三種主題：pop / neon / brutal。
// 選定風格後，這裡的排版和主題變數會直接搬進正式遊戲。

import type { CSSProperties, ReactNode } from 'react'
import { TileFace } from '../ui/TileFace'

const ks = (s: string) => s.split(' ')

const ME = {
  hand: ks('m2 m3 m4 p5 p6 p7 s3 s4 s5 p8 p8 s7 s8'),
  melds: [ks('z5 z5 z5')],
  flowers: ks('f1'),
  discards: ks('z1 m9 p1 z3 s1 m7 p2'),
}

interface Seat {
  name: string
  wind: string
  score: string
  dealer?: boolean
  discards: string[]
  concealed: number
  melds?: string[][]
  flowers?: string[]
}

const TOP: Seat = { name: '大舅媽', wind: '北', score: '24,300', discards: ks('z4 m1 s9 p9 z2 m5 s6'), concealed: 16 }
const LEFT: Seat = {
  name: '鄒家雀神',
  wind: '東',
  score: '26,400',
  dealer: true,
  discards: ks('z2 p1 m8 s2 z7 p3'),
  concealed: 13,
  melds: [ks('m6 m7 m8')],
  flowers: ks('f5 f6'),
}
const RIGHT: Seat = { name: '小姨丈', wind: '西', score: '22,800', discards: ks('m1 z6 p9 s8 m3 p4 z1'), concealed: 16 }

function Tile({ kind, w, hot }: { kind: string; w: number; hot?: boolean }) {
  return (
    <span className={hot ? 'mt hot' : 'mt'} style={{ '--w': `${w}px` } as CSSProperties}>
      <span className="mt-face">
        <TileFace kind={kind} />
      </span>
    </span>
  )
}

function Back({ w, h }: { w: number; h: number }) {
  return <span className="mb" style={{ width: w, height: h }} />
}

// 扁平插畫頭像：燙髮阿姨、戴眼鏡的年輕人、戴帽子的阿伯
function Face({ who }: { who: 'meiling' | 'kai' | 'lin' | 'me' }) {
  const skin = 'var(--skin, #f6c9a8)'
  return (
    <svg viewBox="0 0 64 64" className="face" aria-hidden="true">
      <rect width="64" height="64" className="face-bg" />
      {who === 'meiling' && (
        <>
          <circle cx="32" cy="24" r="17" fill="#3b2a3f" />
          {[14, 22, 32, 42, 50].map((x, i) => (
            <circle key={i} cx={x} cy={i % 2 ? 12 : 16} r="8" fill="#3b2a3f" />
          ))}
          <ellipse cx="32" cy="36" rx="13" ry="15" fill={skin} />
          <circle cx="27" cy="35" r="1.8" fill="#1d2a4a" />
          <circle cx="37" cy="35" r="1.8" fill="#1d2a4a" />
          <path d="M27 43 Q32 47 37 43" stroke="#d2405a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="40" r="2.6" fill="#ff8fa3" opacity=".6" />
          <circle cx="40" cy="40" r="2.6" fill="#ff8fa3" opacity=".6" />
          <path d="M14 64 Q32 50 50 64" fill="#ff6f91" />
        </>
      )}
      {who === 'kai' && (
        <>
          <path d="M16 30 Q16 12 32 12 Q48 12 48 30 L48 24 Q40 18 30 22 Q22 25 16 30 Z" fill="#1d2a4a" />
          <ellipse cx="32" cy="35" rx="13" ry="15" fill={skin} />
          <rect x="21" y="31" width="9" height="7" rx="2" fill="none" stroke="#1d2a4a" strokeWidth="2" />
          <rect x="34" y="31" width="9" height="7" rx="2" fill="none" stroke="#1d2a4a" strokeWidth="2" />
          <line x1="30" y1="34" x2="34" y2="34" stroke="#1d2a4a" strokeWidth="2" />
          <path d="M28 44 L36 44" stroke="#1d2a4a" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M12 64 Q32 48 52 64" fill="#3a6df0" />
          <path d="M26 52 L32 58 L38 52" stroke="#fff" strokeWidth="2" fill="none" />
        </>
      )}
      {who === 'lin' && (
        <>
          <ellipse cx="32" cy="36" rx="14" ry="15" fill={skin} />
          <path d="M16 28 Q17 12 32 12 Q47 12 48 28 Z" fill="#13a37f" />
          <rect x="14" y="26" width="36" height="5" rx="2.5" fill="#0e8466" />
          <path d="M24 34 L30 34 M34 34 L40 34" stroke="#1d2a4a" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M25 41 Q32 46 39 41" stroke="#8a8a8a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M28 45 Q32 47 36 45" stroke="#1d2a4a" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M12 64 Q32 50 52 64" fill="#f0c64a" />
        </>
      )}
    </svg>
  )
}

function Player({ seat, who, side, bubble }: { seat: Seat; who: 'meiling' | 'kai' | 'lin'; side: 'top' | 'left' | 'right'; bubble?: ReactNode }) {
  return (
    <div className={`player ${side}`}>
      <div className="avatar">
        <Face who={who} />
        <span className="seat-wind">{seat.wind}</span>
        {seat.dealer && <span className="dealer">莊</span>}
      </div>
      <div className="player-info">
        <span className="pname">{seat.name}</span>
        <span className="pscore">{seat.score}</span>
      </div>
      {bubble && <div className="bubble">{bubble}</div>}
    </div>
  )
}

function Pond({ tiles, hotLast, className }: { tiles: string[]; hotLast?: boolean; className: string }) {
  return (
    <div className={`pond ${className}`}>
      {tiles.map((k, i) => (
        <Tile key={i} kind={k} w={22} hot={hotLast && i === tiles.length - 1} />
      ))}
    </div>
  )
}

export function MockTable({ theme }: { theme: string }) {
  return (
    <div className={`mock t-${theme}`}>
      <header className="strip">
        <button type="button" className="icon-btn" aria-label="選單">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="round-info">
          東風圈 第 2 局<small>莊 鄒家雀神・連 1</small>
        </span>
        <span className="left-count">
          剩 <b>58</b> 張
        </span>
      </header>

      <div className="table">
        <div className="compass">
          <span className="c-top">北</span>
          <span className="c-left">東</span>
          <span className="c-right">西</span>
          <span className="c-bottom">南</span>
          <span className="c-center">
            東<small>2</small>
          </span>
        </div>
        <Pond tiles={TOP.discards} hotLast className="p-top" />
        <Pond tiles={LEFT.discards} className="p-left" />
        <Pond tiles={RIGHT.discards} className="p-right" />
        <Pond tiles={ME.discards} className="p-me" />
      </div>

      <Player seat={TOP} who="meiling" side="top" bubble="這張應該沒人要吧～" />
      <div className="backs top-backs">
        {Array.from({ length: TOP.concealed }, (_, i) => (
          <Back key={i} w={13} h={18} />
        ))}
      </div>

      <Player seat={LEFT} who="lin" side="left" />
      <div className="backs left-backs">
        {Array.from({ length: LEFT.concealed }, (_, i) => (
          <Back key={i} w={18} h={11} />
        ))}
      </div>
      <div className="side-melds left-melds">
        {LEFT.melds!.map((m, i) => (
          <span key={i} className="meld">
            {m.map((k, j) => (
              <Tile key={j} kind={k} w={18} />
            ))}
          </span>
        ))}
        {LEFT.flowers!.map((k, i) => (
          <Tile key={`f${i}`} kind={k} w={18} />
        ))}
      </div>

      <Player seat={RIGHT} who="kai" side="right" />
      <div className="backs right-backs">
        {Array.from({ length: RIGHT.concealed }, (_, i) => (
          <Back key={i} w={18} h={11} />
        ))}
      </div>

      <div className="me">
        <div className="my-melds">
          {ME.melds.map((m, i) => (
            <span key={i} className="meld">
              {m.map((k, j) => (
                <Tile key={j} kind={k} w={30} />
              ))}
            </span>
          ))}
          {ME.flowers.map((k, i) => (
            <Tile key={`f${i}`} kind={k} w={30} />
          ))}
        </div>
        <div className="hand">
          {ME.hand.map((k, i) => (
            <Tile key={i} kind={k} w={43} />
          ))}
        </div>
      </div>

      <div className="my-tag">
        <span className="seat-wind">南</span>
        <span className="pname">你</span>
        <span className="pscore">26,500</span>
      </div>

      <div className="ting">
        聽 <Tile kind="s6" w={18} />
        <Tile kind="s9" w={18} />
      </div>

      <div className="claims">
        <button type="button" className="claim pass">
          過
        </button>
        <button type="button" className="claim chi">
          吃
        </button>
        <button type="button" className="claim hu">
          胡
        </button>
      </div>
    </div>
  )
}
