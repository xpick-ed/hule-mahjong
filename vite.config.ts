import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './'：build 出來的檔案放在任何路徑都能跑（Cloudflare Pages 根目錄或子路徑）
// mode artifact（npm run artifact）：不分檔，全部包成一個 JS，才能內嵌進單一 HTML 給 claude.ai 預覽
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: mode === 'artifact' ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  // 開發時 /api 轉給本機的 Worker（排行榜）：npm run api（npx wrangler dev --port 8788）
  server: { host: true, proxy: { '/api': { target: 'http://localhost:8788', ws: true } } },
}))
