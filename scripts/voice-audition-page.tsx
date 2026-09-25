// 產生語音試聽頁（單一 HTML，聲音檔 base64 內嵌），用遊戲裡同一套頭像和牌面。
//   npx tsx scripts/voice-audition-page.tsx  →  dist-voices/voices.html

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { CHARACTERS } from '../src/engine/characters'
import { Avatar } from '../src/ui/Avatar'
import { TileFace } from '../src/ui/TileFace'

interface CastEntry {
  id: string
  name: string
  voice: { voice: string; rate: string; pitch: string; fx: string[] }
}

const cast: CastEntry[] = JSON.parse(readFileSync('voice/audition/cast.json', 'utf8'))
const lines: Record<string, { who: string; text: string }> = JSON.parse(readFileSync('voice/audition/audition.lines.json', 'utf8'))
const manifest: Record<string, { file: string }> = JSON.parse(readFileSync('voice-audition/manifest.json', 'utf8'))

const VOICE_NAME: Record<string, string> = {
  'zh-TW-HsiaoChenNeural': '曉臻',
  'zh-TW-HsiaoYuNeural': '曉雨',
  'zh-TW-YunJheNeural': '雲哲',
}
const FX_NAME: Record<string, string> = {
  bright: '明亮',
  warm: '溫暖',
  elder: '老人的顫音',
  gruff: '粗聲',
  hearty: '豪爽',
  loud: '大聲',
  drunk: '醉醺醺',
  tremble: '發抖',
}

function describe(v: CastEntry['voice']): string {
  const rate = Number(v.rate.replace('%', ''))
  const pitch = Number(v.pitch.replace('Hz', ''))
  const bits = [`${VOICE_NAME[v.voice]}的聲音`]
  if (rate >= 8) bits.push('講快一點')
  else if (rate <= -8) bits.push('講慢一點')
  if (pitch <= -12) bits.push('壓低很多')
  else if (pitch <= -4) bits.push('壓低一點')
  else if (pitch >= 2) bits.push('稍微拉高')
  bits.push(...v.fx.map((f) => FX_NAME[f] ?? f))
  return bits.join('、')
}

const clips: Record<string, string> = {}
for (const [id, m] of Object.entries(manifest)) {
  clips[id] = readFileSync(`voice-audition/${m.file}`).toString('base64')
}

const chars = [...new Set(cast.map((c) => c.id.split('-')[0]))]
const TILE_ORDER = ['m1', 'p5', 's7', 'm9', 'z1', 'z5', 'z6', 'z7']
const CALLS: [string, string][] = [
  ['chi', '吃'],
  ['pon', '碰'],
  ['kong', '槓'],
  ['hu', '胡'],
  ['tsumo', '自摸'],
]

const svg = (el: React.ReactElement) => renderToStaticMarkup(el)

function candidate(charId: string, v: 'A' | 'B') {
  const who = `${charId}-${v}`
  const c = cast.find((x) => x.id === who)!
  const tiles = TILE_ORDER.map(
    (k) => `<button class="tile" data-clip="${who}.tile.${k}" aria-label="${lines[`${who}.tile.${k}`].text}">${svg(<TileFace kind={k} />)}</button>`,
  ).join('')
  const calls = CALLS.map(([k, label]) => `<button class="call c-${k}" data-clip="${who}.call.${k}" title="${lines[`${who}.call.${k}`].text}">${label}</button>`).join('')
  const talk = ['hello', 'ting', 'dealIn']
    .map((k) => `<button class="line" data-clip="${who}.line.${k}"><span class="play" aria-hidden="true"></span>${lines[`${who}.line.${k}`].text}</button>`)
    .join('')
  return `
  <article class="cand" data-who="${who}">
    <header class="cand-head">
      <span class="badge">${v}</span>
      <p>${describe(c.voice)}</p>
    </header>
    <div class="group"><span class="lbl">報牌</span><div class="tiles">${tiles}</div></div>
    <div class="group"><span class="lbl">喊牌</span><div class="calls">${calls}</div></div>
    <div class="group"><span class="lbl">台詞</span><div class="lines">${talk}</div></div>
    <button class="all" data-all="${who}">全部聽一次</button>
  </article>`
}

const sections = chars
  .map((id) => {
    const ch = CHARACTERS[id]
    return `
  <section class="char" id="${id}">
    <div class="who">
      <span class="face">${svg(<Avatar look={ch.look} size={64} />)}</span>
      <div>
        <h2>${ch.name}</h2>
        <p>${ch.bio}</p>
      </div>
      <div class="pick" role="radiogroup" aria-label="${ch.name}要用哪個聲音">
        <button role="radio" aria-checked="true" data-pick="${id}" data-v="A">用 A</button>
        <button role="radio" aria-checked="false" data-pick="${id}" data-v="B">用 B</button>
      </div>
    </div>
    <div class="cands">${candidate(id, 'A')}${candidate(id, 'B')}</div>
  </section>`
  })
  .join('')

const css = `
:root {
  --bg: #ffe066; --ink: #1d2a4a; --muted: rgba(29,42,74,.66); --card: #fff; --soft: #fff7d6;
  --red: #ef3d5c; --red-edge: #c22442; --orange: #ffb020; --orange-edge: #d98a00;
  --blue: #3a6df0; --blue-edge: #2651c4; --purple: #8b5cf6; --purple-edge: #6a3fd6;
  --t-red: #ef3d5c; --t-green: #0f9e7a; --t-blue: #3565e8; --t-ink: #1d2a4a; --t-face: #fffaf0; --t-gold: #ffb020;
  --ui: 'Chiron GoRound TC', 'PingFang TC', 'Noto Sans TC', system-ui, sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body { background: var(--bg); color: var(--ink); font-family: var(--ui); }
body { margin: 0; padding-inline: 16px; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1040px; margin: 0 auto; padding-block: 28px 56px; display: flex; flex-direction: column; gap: 22px; }
.top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
h1 { margin: 0; font-size: clamp(34px, 6vw, 52px); font-weight: 900; line-height: 1; color: var(--red); text-shadow: 0 4px 0 var(--ink); text-wrap: balance; }
.intro { margin: 10px 0 0; max-width: 60ch; font-size: 15px; font-weight: 700; line-height: 1.6; color: var(--muted); }
.demo { display: inline-flex; align-items: center; gap: 10px; min-height: 52px; padding: 10px 22px; border: 0; border-radius: 999px; background: var(--red); color: #fff; font: 900 17px var(--ui); box-shadow: 0 5px 0 var(--red-edge); cursor: pointer; }
.demo:active { translate: 0 3px; box-shadow: 0 2px 0 var(--red-edge); }
.demo .play { border-left-color: #fff; }
.char { background: var(--card); border-radius: 24px; padding: 18px; box-shadow: 0 5px 0 rgba(29,42,74,.14); display: flex; flex-direction: column; gap: 14px; }
.char.speaking { box-shadow: 0 0 0 4px var(--red), 0 5px 0 rgba(29,42,74,.14); }
.who { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.face svg { display: block; border-radius: 50%; }
.who h2 { margin: 0; font-size: 24px; font-weight: 900; }
.who p { margin: 2px 0 0; font-size: 14px; font-weight: 700; color: var(--muted); }
.pick { margin-left: auto; display: flex; gap: 6px; padding: 4px; border-radius: 999px; background: #eef1f7; }
.pick button { min-height: 40px; min-width: 64px; border: 0; border-radius: 999px; background: none; font: 900 15px var(--ui); color: var(--muted); cursor: pointer; }
.pick button[aria-checked="true"] { background: var(--ink); color: var(--bg); }
.cands { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.cand { background: var(--soft); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.cand.chosen { outline: 3px solid var(--ink); outline-offset: -3px; }
.cand-head { display: flex; align-items: flex-start; gap: 10px; }
.badge { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--ink); color: var(--bg); font: 900 17px var(--ui); }
.cand-head p { margin: 5px 0 0; font-size: 14px; font-weight: 700; line-height: 1.5; }
.group { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-size: 12px; font-weight: 900; color: var(--muted); letter-spacing: .05em; }
.tiles { display: flex; flex-wrap: wrap; gap: 5px; }
.tile { width: 40px; height: 58px; padding: 3px 3px 7px; border: 0; border-radius: 8px; background: #fffaf0; box-shadow: 0 4px 0 #ff8fa3, 0 5px 6px rgba(29,42,74,.25); cursor: pointer; }
.tile svg { display: block; width: 100%; height: 100%; }
.tile .tf { font-family: var(--ui); font-weight: 900; }
.tile:active, .tile.on { translate: 0 -5px; box-shadow: 0 0 0 3px var(--blue), 0 4px 0 #ff8fa3; }
.calls { display: flex; flex-wrap: wrap; gap: 8px; }
.call { min-width: 48px; height: 48px; padding: 0 12px; border: 0; border-radius: 999px; color: #fff; font: 900 18px var(--ui); cursor: pointer; }
.c-chi { background: var(--orange); box-shadow: 0 4px 0 var(--orange-edge); }
.c-pon { background: var(--blue); box-shadow: 0 4px 0 var(--blue-edge); }
.c-kong { background: var(--purple); box-shadow: 0 4px 0 var(--purple-edge); }
.c-hu, .c-tsumo { background: var(--red); box-shadow: 0 4px 0 var(--red-edge); }
.call:active, .call.on { translate: 0 3px; box-shadow: none; }
.lines { display: flex; flex-direction: column; gap: 6px; }
.line { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 14px; background: #fff; font: 700 15px var(--ui); color: var(--ink); text-align: left; box-shadow: 0 3px 0 rgba(29,42,74,.12); cursor: pointer; }
.line.on { box-shadow: 0 0 0 3px var(--blue); }
.play { flex: none; width: 0; height: 0; border-style: solid; border-width: 7px 0 7px 11px; border-color: transparent transparent transparent var(--red); }
.all { align-self: flex-start; min-height: 44px; padding: 8px 18px; border: 0; border-radius: 999px; background: #fff; font: 900 14px var(--ui); color: var(--ink); box-shadow: 0 4px 0 #c9d2e3; cursor: pointer; }
.summary { position: sticky; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); align-self: center; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 999px; background: var(--ink); color: var(--bg); font: 900 14px var(--ui); box-shadow: 0 6px 18px rgba(29,42,74,.35); }
.summary button { min-height: 36px; padding: 4px 14px; border: 0; border-radius: 999px; background: var(--bg); color: var(--ink); font: 900 13px var(--ui); cursor: pointer; }
button:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
@media (max-width: 520px) { .pick { margin-left: 0; } .char { padding: 14px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`

const js = `
const CLIPS = ${JSON.stringify(clips)};
const cache = {};
let current = null;
function audio(id) {
  if (!cache[id]) cache[id] = new Audio('data:audio/mpeg;base64,' + CLIPS[id]);
  return cache[id];
}
function play(id, el) {
  return new Promise((resolve) => {
    if (!CLIPS[id]) return resolve();
    if (current) { current.pause(); current.currentTime = 0; }
    const a = audio(id);
    current = a;
    a.currentTime = 0;
    if (el) el.classList.add('on');
    const done = () => { if (el) el.classList.remove('on'); a.onended = null; resolve(); };
    a.onended = done;
    a.play().catch(done);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let token = 0;
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.clip) { token++; play(b.dataset.clip, b); return; }
  if (b.dataset.all) {
    const my = ++token;
    for (const el of document.querySelectorAll('[data-who="' + b.dataset.all + '"] [data-clip]')) {
      if (my !== token) return;
      await play(el.dataset.clip, el);
      await wait(250);
    }
    return;
  }
  if (b.dataset.pick) {
    const id = b.dataset.pick, v = b.dataset.v;
    choice[id] = v;
    document.querySelectorAll('[data-pick="' + id + '"]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.v === v)));
    document.querySelectorAll('#' + id + ' .cand').forEach((x) => x.classList.toggle('chosen', x.dataset.who === id + '-' + v));
    summary();
    return;
  }
  if (b.id === 'demo') { runDemo(); return; }
  if (b.id === 'copy') {
    const text = summaryText();
    try { await navigator.clipboard.writeText(text); b.textContent = '複製好了'; } catch { b.textContent = text; }
    setTimeout(() => (b.textContent = '複製'), 1600);
  }
});
const NAMES = ${JSON.stringify(Object.fromEntries(chars.map((id) => [id, CHARACTERS[id].name])))};
const choice = ${JSON.stringify(Object.fromEntries(chars.map((id) => [id, 'A'])))};
function summaryText() { return Object.keys(choice).map((id) => NAMES[id] + ' ' + choice[id]).join('、'); }
function summary() { document.getElementById('picked').textContent = '你選的：' + summaryText(); }
// 一段牌局：大家輪流報牌，中間有人碰、有人吃，最後有人胡
const SCRIPT = [
  ['meiling', 'tile.z1'], ['lin', 'tile.s7'], ['erjiu', 'tile.m1'], ['ama', 'tile.z7'],
  ['meiling', 'tile.p5'], ['lin', 'call.pon'], ['lin', 'tile.m9'], ['erjiu', 'tile.z6'],
  ['ama', 'tile.s7'], ['meiling', 'call.chi'], ['meiling', 'tile.z5'], ['erjiu', 'line.ting'],
  ['lin', 'tile.p5'], ['ama', 'call.hu'], ['lin', 'line.dealIn'],
];
async function runDemo() {
  const my = ++token;
  for (const [id, clip] of SCRIPT) {
    if (my !== token) break;
    const sec = document.getElementById(id);
    sec.classList.add('speaking');
    await play(id + '-' + choice[id] + '.' + clip);
    sec.classList.remove('speaking');
    await wait(clip.startsWith('call') ? 350 : 600);
  }
}
summary();
document.querySelectorAll('.cand').forEach((x) => x.classList.toggle('chosen', x.dataset.who.endsWith('-A')));
`

const html = `<title>胡了！配音試聽</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@700;900&display=swap">
<style>${css}</style>
<main class="wrap">
  <div class="top">
    <div>
      <h1>配音試聽</h1>
      <p class="intro">四個角色，每人兩種聲音。點牌聽「報牌」，點彩色按鈕聽吃碰槓胡，點台詞聽他們講話。每個人挑 A 或 B，按「聽一段牌局」聽四個人輪流打牌的感覺。</p>
    </div>
    <button class="demo" id="demo"><span class="play" aria-hidden="true"></span>聽一段牌局</button>
  </div>
  ${sections}
  <div class="summary" role="status"><span id="picked"></span><button id="copy">複製</button></div>
</main>
<script>${js}</script>
`

mkdirSync('dist-voices', { recursive: true })
writeFileSync('dist-voices/voices.html', html)
console.log(`dist-voices/voices.html ${(html.length / 1024).toFixed(0)} KB`)
