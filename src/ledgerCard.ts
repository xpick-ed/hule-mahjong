// 家庭牌局戰報圖（1080×1350）：名次、輸贏、誰給誰多少、趣味稱號。傳到家族群組用。

import { cardStyle, CARD_H, CARD_W, esc, font, svgToPng } from './brag'
import { settleUp, titles, totals, type Ledger } from './ledger'

const GREEN = '#0f9e7a'
const RED = '#ef3d5c'
const INK = '#1d2a4a'

const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}`

function ledgerSvg(l: Ledger, fontUri: string | null): string {
  const W = CARD_W
  const H = CARD_H
  const t = totals(l)
  const order = [0, 1, 2, 3].sort((a, b) => t[b] - t[a])
  const rows = order
    .map((s, k) => {
      const y = 330 + k * 128
      const top = k === 0 && t[s] > 0
      return `
      <rect x="60" y="${y}" width="${W - 120}" height="108" rx="30" fill="${top ? '#ffffff' : 'rgba(255,255,255,0.6)'}"/>
      <circle cx="122" cy="${y + 54}" r="34" fill="${top ? RED : INK}"/>
      <text x="122" y="${y + 68}" font-size="40" fill="#fff" text-anchor="middle">${k + 1}</text>
      <text x="184" y="${y + 72}" font-size="52" fill="${INK}">${esc(l.names[s])}</text>
      <text x="${W - 96}" y="${y + 76}" font-size="62" fill="${t[s] > 0 ? GREEN : t[s] < 0 ? RED : INK}" text-anchor="end">${money(t[s])}</text>`
    })
    .join('')
  const tr = settleUp(t).slice(0, 4)
  const payY = 870
  const pays = tr
    .map((x, k) => `<text x="${W / 2}" y="${payY + 60 + k * 56}" font-size="40" fill="${INK}" text-anchor="middle">${esc(l.names[x.from])} → ${esc(l.names[x.to])}　${x.amount.toLocaleString('en-US')}</text>`)
    .join('')
  const ts = titles(l).slice(0, 4)
  const chipY = payY + 90 + Math.max(1, tr.length) * 56
  const chips = ts
    .map((x, k) => {
      const col = k % 2
      const row = Math.floor(k / 2)
      const cx = W / 2 + (col ? 240 : -240)
      const cy = chipY + row * 76
      return `<rect x="${cx - 225}" y="${cy - 44}" width="450" height="62" rx="31" fill="${INK}"/>
      <text x="${cx}" y="${cy - 2}" font-size="30" fill="#ffe066" text-anchor="middle">${x.title}：${esc(l.names[x.who])}（${esc(x.note)}）</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>${cardStyle(fontUri)}</style>
  <rect width="${W}" height="${H}" fill="#ffe066"/>
  <g opacity="0.18" fill="#ffffff">
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${-400 + i * 140}" y="-100" width="46" height="${H + 200}" transform="rotate(20 ${W / 2} ${H / 2})"/>`).join('')}
  </g>
  <text x="70" y="120" font-size="78" fill="#c22442">胡了！</text>
  <text x="70" y="120" font-size="78" fill="${RED}" transform="translate(-4 -5)">胡了！</text>
  <text x="${W - 70}" y="92" font-size="30" fill="${INK}" text-anchor="end" opacity="0.7">${esc(l.date)}</text>
  <text x="${W - 70}" y="130" font-size="30" fill="${INK}" text-anchor="end" opacity="0.7">底 ${l.base}／台 ${l.perTai}・${l.hands.length} 手</text>
  <text x="${W / 2}" y="250" font-size="84" fill="${INK}" text-anchor="middle">家庭牌局戰報</text>
  ${rows}
  <text x="${W / 2}" y="${payY}" font-size="36" fill="${INK}" text-anchor="middle" opacity="0.65">${tr.length ? '結帳' : '大家打平'}</text>
  ${pays}
  ${chips}
  <text x="${W / 2}" y="${H - 60}" font-size="30" fill="${INK}" text-anchor="middle" opacity="0.65">台灣十六張麻將・hule.leh-x.workers.dev</text>
</svg>`
}

export async function makeLedgerCard(l: Ledger): Promise<Blob> {
  return svgToPng(ledgerSvg(l, await font()))
}
