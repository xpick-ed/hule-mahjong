// 大牌炫耀卡：把你胡的一手做成一張圖（1080×1350），可以傳到 LINE。
// 做法：整張卡畫成一個 SVG（牌面直接用遊戲裡的 TileFace，字型內嵌），再畫到 canvas 轉成 PNG。

import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { STAGES } from './engine/stages'
import chironUrl from './fonts/chiron-900.woff2?url'
import { RARITY_NAME, rarityOf, type HandSnap } from './progress'
import { TileFace } from './ui/TileFace'

export const CARD_W = 1080
export const CARD_H = 1350

const RARITY_COLOR = { common: '#8a94a8', rare: '#3a6df0', epic: '#8b5cf6', legend: '#f0a000' } as const

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ---------- 牌面 SVG ----------

const faceCache = new Map<string, string>()

/** 一張牌的牌面（SVG 內容，viewBox 0 0 60 82） */
function faceMarkup(kind: string): string {
  const hit = faceCache.get(kind)
  if (hit !== undefined) return hit
  const div = document.createElement('div')
  const root = createRoot(div)
  flushSync(() => root.render(createElement(TileFace, { kind })))
  const inner = div.querySelector('svg')?.innerHTML ?? ''
  root.unmount()
  faceCache.set(kind, inner)
  return inner
}

function tileSvg(kind: string, x: number, y: number, w: number, hot: boolean): string {
  const h = w * 1.37
  const r = w * 0.16
  const edge = w * 0.1
  return `<g>
    <rect x="${x}" y="${y + edge}" width="${w}" height="${h}" rx="${r}" fill="#ff8fa3"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fffaf0" ${hot ? `stroke="#ffb020" stroke-width="${w * 0.09}"` : ''}/>
    <svg x="${x + w * 0.06}" y="${y + w * 0.07}" width="${w * 0.88}" height="${h - w * 0.14}" viewBox="0 0 60 82">${faceMarkup(kind)}</svg>
  </g>`
}

// ---------- 字型 ----------

let fontData: Promise<string | null> | null = null

/** 遊戲的字型轉成 data URI 嵌進 SVG（圖片裡不能用網頁載入的字型）；拿不到就用系統字型 */
function font(): Promise<string | null> {
  fontData ??= fetch(chironUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((buf) => {
      if (!buf) return null
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return `data:font/woff2;base64,${btoa(bin)}`
    })
    .catch(() => null)
  return fontData
}

// ---------- 卡片 ----------

/** 這一手最值得說的牌型（台數最多的那個） */
export function headline(snap: HandSnap): string {
  const scored = snap.items.map((s) => {
    const m = s.match(/ ×(\d+)$/)
    return { name: s, tai: tai(s) * (m ? Number(m[1]) : 1) }
  })
  scored.sort((a, b) => b.tai - a.tai)
  return scored[0]?.name ?? (snap.tsumo ? '自摸' : '胡了')
}

const TAI: Record<string, number> = { 門清自摸: 3, 碰碰胡: 4, 混一色: 4, 小三元: 4, 四暗刻: 5, 清一色: 8, 大三元: 8, 小四喜: 8, 五暗刻: 8, 嚦咕嚦咕: 8, 八仙過海: 8, 七搶一: 8, 字一色: 16, 大四喜: 16, 天胡: 16, 地胡: 16, 平胡: 2, 全求人: 2, 三暗刻: 2, 春夏秋冬: 2, 梅蘭竹菊: 2 }
const tai = (name: string) => TAI[name.replace(/ ×\d+$/, '')] ?? 1

function cardSvg(snap: HandSnap, name: string, fontUri: string | null): string {
  const W = CARD_W
  const H = CARD_H
  const head = headline(snap)
  const stage = STAGES[snap.stage]?.name ?? ''
  // 牌：亮出來的組、手牌、花，組和組之間空一點
  const groups = [...snap.melds, snap.hand, ...(snap.flowers.length ? [snap.flowers] : [])]
  const count = groups.reduce((s, g) => s + g.length, 0)
  const gap = 18
  const tw = Math.min(78, (W - 120 - gap * (groups.length - 1)) / count)
  const rowW = tw * count + gap * (groups.length - 1)
  let x = (W - rowW) / 2
  const ty = 820
  let tiles = ''
  let marked = false
  for (const g of groups) {
    g.forEach((k, i) => {
      const hot = !marked && g === snap.hand && k === snap.win && i === g.lastIndexOf(k)
      if (hot) marked = true
      tiles += tileSvg(k, x, ty, tw, hot)
      x += tw
    })
    x += gap
  }
  const chips = snap.items.map((s) => `${s} ${tai(s)}`).join('・')
  const rarity = rarityOf(Math.max(...snap.items.map(tai), 1))
  const style = `
    ${fontUri ? `@font-face { font-family: 'HL'; src: url(${fontUri}) format('woff2'); font-weight: 900; }` : ''}
    svg { --t-red: #ef3d5c; --t-green: #0f9e7a; --t-blue: #3565e8; --t-ink: #1d2a4a; --t-face: #fffaf0; --t-gold: #ffb020; }
    text, .tf { font-family: 'HL', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; font-weight: 900; }
  `
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>${style}</style>
  <rect width="${W}" height="${H}" fill="#ffe066"/>
  <g opacity="0.18" fill="#ffffff">
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${-400 + i * 140}" y="-100" width="46" height="${H + 200}" transform="rotate(20 ${W / 2} ${H / 2})"/>`).join('')}
  </g>
  <text x="70" y="120" font-size="78" fill="#c22442">胡了！</text>
  <text x="70" y="120" font-size="78" fill="#ef3d5c" transform="translate(-4 -5)">胡了！</text>
  <text x="${W - 70}" y="92" font-size="30" fill="#1d2a4a" text-anchor="end" opacity="0.7">${esc(snap.date)}</text>
  <text x="${W - 70}" y="130" font-size="30" fill="#1d2a4a" text-anchor="end" opacity="0.7">${esc(stage)}</text>

  <text x="${W / 2}" y="300" font-size="54" fill="#1d2a4a" text-anchor="middle">${esc(name)} ${snap.tsumo ? '自摸！' : '胡了！'}</text>
  <text x="${W / 2}" y="${head.length > 4 ? 505 : 520}" font-size="${head.length > 4 ? 150 : 190}" fill="#1d2a4a" text-anchor="middle">${esc(head)}</text>
  <text x="${W / 2}" y="630" font-size="64" fill="#ef3d5c" text-anchor="middle">${snap.tai} 台</text>
  <rect x="${W / 2 - 110}" y="668" width="220" height="56" rx="28" fill="${RARITY_COLOR[rarity]}"/>
  <text x="${W / 2}" y="708" font-size="30" fill="#ffffff" text-anchor="middle">${RARITY_NAME[rarity]}牌型</text>

  <rect x="40" y="${ty - 60}" width="${W - 80}" height="${tw * 1.37 + 120}" rx="44" fill="#33c2a0"/>
  <rect x="40" y="${ty - 60 + tw * 1.37 + 110}" width="${W - 80}" height="14" rx="7" fill="#1f8a70" opacity="0.5"/>
  ${tiles}

  <text x="${W / 2}" y="${ty + tw * 1.37 + 160}" font-size="38" fill="#1d2a4a" text-anchor="middle">${esc(chips)}</text>
  <text x="${W / 2}" y="${H - 70}" font-size="30" fill="#1d2a4a" text-anchor="middle" opacity="0.65">台灣十六張麻將・hule.leh-x.workers.dev</text>
</svg>`
}

/** 做一張炫耀卡，回傳 PNG */
export async function makeBragCard(snap: HandSnap, name: string): Promise<Blob> {
  const svg = cardSvg(snap, name, await font())
  const img = new Image()
  img.decoding = 'async'
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok()
      img.onerror = () => bad(new Error('卡片畫不出來'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('轉 PNG 失敗'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
