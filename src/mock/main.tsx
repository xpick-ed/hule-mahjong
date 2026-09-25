import { createRoot } from 'react-dom/client'
import { MockTable } from './Mock'
import './mock.css'

// mock.html?theme=pop|neon|brutal&zoom=2（截圖用）；不帶參數就三個一起列出來
const q = new URLSearchParams(location.search)
const theme = q.get('theme')
const zoom = Number(q.get('zoom') ?? 1)
document.body.style.zoom = String(zoom)

createRoot(document.getElementById('root')!).render(
  <>
    {(theme ? [theme] : ['pop', 'neon', 'brutal']).map((t) => (
      <MockTable key={t} theme={t} />
    ))}
  </>,
)
