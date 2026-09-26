import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { playMusic } from './music'
import { unlockAudio } from './sfx'
import { currentMood, useUI } from './store'
import { App } from './ui/App'
import './fonts.css'
import './styles.css'

// iOS：聲音要等第一次觸控才能開；開了就放音樂
window.addEventListener(
  'pointerdown',
  () => {
    unlockAudio()
    playMusic(currentMood())
  },
  { once: true },
)
window.addEventListener('keydown', () => playMusic(currentMood()), { once: true })

// 開發用：在主控台可以用 __ui 看狀態（Playwright 測試也靠它）
;(window as unknown as { __ui: typeof useUI }).__ui = useUI

// 離線也能玩：正式版才註冊（開發時不要快取）；Artifact 預覽裡註冊不了，失敗就算了
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
