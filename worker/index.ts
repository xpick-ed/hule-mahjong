// Cloudflare Worker：網站本身是 dist/ 的靜態檔（wrangler.toml 的 [assets]，找得到檔案就直接給、不經過這裡），
// 找不到的請求才進來：
//   /api/daily               每日挑戰排行榜（D1）
//   /api/save                存檔轉移碼（D1）
//   /api/room/<房號>/ws       連線對打的房間（Durable Object，WebSocket）
// 其他回 404。

import { onRequestGet, onRequestPost, type Env } from './daily'
import { ROOM_RE } from '../src/engine/online'
import { saveGet, savePost } from './save'

export { Room } from './room'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/daily') {
      if (request.method === 'GET') return onRequestGet({ request, env })
      if (request.method === 'POST') return onRequestPost({ request, env })
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, POST' } })
    }
    if (url.pathname === '/api/save') {
      if (request.method === 'GET') return saveGet(request, env)
      if (request.method === 'POST') return savePost(request, env)
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, POST' } })
    }
    const room = url.pathname.match(/^\/api\/room\/([^/]+)\/ws$/)
    if (room) {
      if (!ROOM_RE.test(room[1])) return new Response('bad room code', { status: 400 })
      if (!env.ROOM) return new Response('rooms not configured', { status: 503 })
      return env.ROOM.get(env.ROOM.idFromName(room[1])).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
}
