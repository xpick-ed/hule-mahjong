import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { unlockAudio } from './sfx'
import { useUI } from './store'
import { App } from './ui/App'
import './styles.css'

// iOS：聲音要等第一次觸控才能開
window.addEventListener('pointerdown', unlockAudio, { once: true })

// 開發用：在主控台可以用 __ui 看狀態（Playwright 測試也靠它）
;(window as unknown as { __ui: typeof useUI }).__ui = useUI

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
