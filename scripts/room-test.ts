// 連線對打的房間伺服器測試：開 N 個機器人玩家連進同一個房間，打完一整場。
//   先跑 npm run api（本機的 Worker，port 8788），再：
//   npx tsx scripts/room-test.ts [人數 2] [網址 http://localhost:8788] [--drop]
// --drop：打到一半讓第二個人斷線 5 秒再連回來，檢查電腦代打和接手。

import * as M from '../src/engine/match'
import { newRoomCode, type ClientMsg, type ServerMsg } from '../src/engine/online'
import { canTsumo } from '../src/engine/table'

const N = Number(process.argv[2] ?? 2)
const BASE = (process.argv[3] ?? 'http://localhost:8788').replace(/^http/, 'ws')
const DROP = process.argv.includes('--drop')
const code = newRoomCode(Math.random)
const pid = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

interface Bot {
  name: string
  pid: string
  ws: WebSocket | null
  last: M.MatchState | null
  moves: number
  errors: string[]
  done: boolean
}

function connect(b: Bot, create: boolean, room = code): Promise<void> {
  let acted = ''
  return new Promise((ok, bad) => {
    const ws = new WebSocket(`${BASE}/api/room/${room}/ws?pid=${b.pid}&name=${encodeURIComponent(b.name)}&voice=f${create ? '&create=1' : ''}`)
    b.ws = ws
    const send = (m: ClientMsg) => ws.send(JSON.stringify(m))
    ws.onopen = () => ok()
    ws.onerror = (e) => bad(e)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMsg
      if (msg.t === 'error') b.errors.push(msg.msg)
      if (msg.t !== 'state') return
      const m = msg.m
      b.last = m
      if (m.phase === 'end') {
        b.done = true
        return
      }
      if (m.phase === 'handEnd') {
        if (!msg.ready.includes(0)) setTimeout(() => send({ t: 'next' }), 50)
        return
      }
      if (!M.waitingForYou(m)) return
      const h = m.hand
      // 同一個時機只出手一次（等別人的時候會收到好幾次一樣的畫面）
      const key = `${m.handNo}:${h.eventN}:${h.phase}`
      if (key === acted) return
      acted = key
      // 故意慢一點，像真人
      setTimeout(() => {
        b.moves++
        if (h.phase === 'claim') send({ t: 'move', move: ['c', h.options[0]!.hu ? { type: 'hu' } : { type: 'pass' }] })
        else if (canTsumo(h, 0)) send({ t: 'move', move: ['t'] })
        else send({ t: 'move', move: ['d', h.seats[0].hand[h.seats[0].hand.length - 1].id] })
      }, 30)
    }
  })
}

const bots: Bot[] = Array.from({ length: N }, (_, i) => ({ name: `機器人${i + 1}`, pid: pid(), ws: null, last: null, moves: 0, errors: [], done: false }))
const t0 = Date.now()
await connect(bots[0], true)
for (const b of bots.slice(1)) await connect(b, false)
// 打錯房號要被擋
const wrong: Bot = { name: '走錯', pid: pid(), ws: null, last: null, moves: 0, errors: [], done: false }
await connect(wrong, false, code === 'ZZZZZ' ? 'YYYYY' : 'ZZZZZ').catch(() => {})
await new Promise((r) => setTimeout(r, 300))
console.log(`房號 ${code}，${N} 個人；打錯房號的人收到：${wrong.errors[0] ?? '（沒收到錯誤！）'}`)
bots[0].ws!.send(JSON.stringify({ t: 'settings', settings: { stage: 1, turnTime: 10 } } satisfies ClientMsg))
bots[0].ws!.send(JSON.stringify({ t: 'start' } satisfies ClientMsg))

if (DROP && bots[1]) {
  setTimeout(() => {
    console.log('第二個人斷線…')
    bots[1].ws!.close()
    setTimeout(async () => {
      await connect(bots[1], false)
      console.log('第二個人連回來了')
    }, 5000)
  }, 8000)
}

// 伺服器用一般速度出牌，一場大概要幾分鐘
while (!bots.every((b) => b.done) && Date.now() - t0 < 20 * 60 * 1000) await new Promise((r) => setTimeout(r, 500))
const m = bots[0].last!
console.log(`結束：${bots.every((b) => b.done) ? '打完了' : '超時！'}，${m.handNo} 局，${((Date.now() - t0) / 1000).toFixed(0)} 秒`)
for (const b of bots) {
  const v = b.last!
  console.log(`  ${b.name}：自己 ${v.points[0]} 分，出手 ${b.moves} 次，錯誤 ${b.errors.length}${b.errors.length ? '：' + b.errors.slice(0, 3).join('／') : ''}`)
}
const total = m.points.reduce((s, x) => s + x, 0)
console.log(`分數總和 ${total}（應該是 ${M.stageOf(m).startPoints * 4}）`)
// 每個人看到的名次要一致：用名字對照
const standings = bots.map((b) => M.ranking(b.last!).map((s) => b.last!.players![s].name).join(' > '))
console.log(`名次一致：${standings.every((x) => x === standings[0]) ? '是' : '否！'} ${standings[0]}`)
for (const b of bots) b.ws?.close()
process.exit(0)
