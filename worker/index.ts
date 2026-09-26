// Cloudflare Worker：網站本身是 dist/ 的靜態檔（wrangler.toml 的 [assets]，找得到檔案就直接給、不經過這裡），
// 找不到的請求才進來：/api/daily 是每日挑戰排行榜，其他回 404。

import { onRequestGet, onRequestPost, type Env } from './daily'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/daily') {
      if (request.method === 'GET') return onRequestGet({ request, env })
      if (request.method === 'POST') return onRequestPost({ request, env })
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, POST' } })
    }
    return env.ASSETS.fetch(request)
  },
}
