// 離線用的 Service Worker：打開過一次之後，沒網路也能玩。
//   網頁本身（index.html）：先問網路，沒網路用快取
//   assets/、fonts/、voice/*.mp3：檔名帶雜湊不會變，有快取就用快取
//   /api/（排行榜）：只走網路
// 改了這個檔要把 VERSION 加一，舊的快取會清掉。

const VERSION = 2
const CACHE = `hule-v${VERSION}`
const CORE = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './voice/index.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(CORE)
      // 把首頁用到的 JS、CSS、字型也先存起來
      const html = await (await fetch('./', { cache: 'no-store' })).text()
      const assets = [...html.matchAll(/(?:src|href)="\.?\/?((?:assets|fonts)\/[^"]+)"/g)].map((m) => `./${m[1]}`)
      await cache.addAll(assets)
      // CSS 裡用到的字型
      for (const css of assets.filter((a) => a.endsWith('.css'))) {
        const text = await (await cache.match(css)).text()
        const dir = css.slice(0, css.lastIndexOf('/') + 1)
        const fonts = [...text.matchAll(/url\((?:\.\/)?([^)]+\.woff2)\)/g)].map((m) => dir + m[1])
        await cache.addAll(fonts)
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
      // 配音（全部約 4.5 MB）背景慢慢存，存到哪算哪；沒存到的第一次播的時候也會存
      try {
        const cache = await caches.open(CACHE)
        const idx = await (await fetch('./voice/index.json')).json()
        for (const v of Object.values(idx.voices)) {
          const url = `./voice/${v.file}`
          if (!(await cache.match(url))) await cache.add(url).catch(() => {})
        }
      } catch {
        // 沒網路就下次再說
      }
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return

  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(CACHE)
          await cache.put('./', res.clone())
          return res
        } catch {
          return (await caches.match('./')) ?? Response.error()
        }
      })(),
    )
    return
  }

  const immutable = /\/(assets|fonts)\/|\/voice\/.+\.mp3$/.test(url.pathname)
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit && immutable) return hit
      const net = fetch(req)
        .then((res) => {
          if (res.ok) void cache.put(req, res.clone())
          return res
        })
        .catch(() => null)
      // 其他檔案：先給快取、背景更新
      return hit ?? (await net) ?? Response.error()
    })(),
  )
})
