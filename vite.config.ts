import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './'：build 出來的檔案放在任何路徑都能跑（Cloudflare Pages 根目錄或子路徑）
export default defineConfig({
  plugins: [react()],
  base: './',
  // 開發時 /api 轉給 wrangler pages dev（排行榜）：npx wrangler pages dev dist --port 8788
  server: { host: true, proxy: { '/api': 'http://localhost:8788' } },
})
