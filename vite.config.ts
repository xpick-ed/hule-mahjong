import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './'：build 出來的檔案放在任何路徑都能跑（Cloudflare Pages 根目錄或子路徑）
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true },
})
