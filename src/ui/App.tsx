import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { restoreFromUrl } from '../backup'
import { useUI } from '../store'
import { Stage } from './bits'
import { Home } from './Home'
import { MatchView } from './MatchView'
import { Menu, Missions, NameSheet, Shop, Toast } from './Overlays'
import { OnlineSheet, RoomView } from './Online'
import { PreMatch } from './PreMatch'

// 不常開的畫面分開下載（打開首頁比較快）；首頁出來幾秒後趁空檔先下載好，離線也能開
const load = {
  learn: () => import('./Learn'),
  calc: () => import('./Calc'),
  records: () => import('./Records'),
  people: () => import('./People'),
  wardrobe: () => import('./Wardrobe'),
  brag: () => import('./Brag'),
  replay: () => import('./Replay'),
  news: () => import('./News'),
}
const Learn = lazy(() => load.learn().then((m) => ({ default: m.Learn })))
const Calc = lazy(() => load.calc().then((m) => ({ default: m.Calc })))
const Records = lazy(() => load.records().then((m) => ({ default: m.Records })))
const People = lazy(() => load.people().then((m) => ({ default: m.People })))
const WardrobeSheet = lazy(() => load.wardrobe().then((m) => ({ default: m.WardrobeSheet })))
const BragSheet = lazy(() => load.brag().then((m) => ({ default: m.BragSheet })))
const ShareCardSheet = lazy(() => load.brag().then((m) => ({ default: m.ShareCardSheet })))
const News = lazy(() => load.news().then((m) => ({ default: m.News })))

/** 開的時候才下載、才畫 */
function Later({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <Suspense fallback={null}>{children}</Suspense> : null
}

function warmUp() {
  for (const f of Object.values(load)) void f().catch(() => {})
}

export function App() {
  const screen = useUI((s) => s.screen)
  const learn = useUI((s) => s.learn !== null)
  const calc = useUI((s) => s.calc)
  const records = useUI((s) => s.records)
  const people = useUI((s) => s.people !== null)
  const look = useUI((s) => s.lookSheet)
  const brag = useUI((s) => s.bragSnap !== null)
  const card = useUI((s) => s.shareCard !== null)
  const news = useUI((s) => s.news)
  // 點邀請連結進來、或重新整理前在房間裡：連回房間
  useEffect(() => useUI.getState().bootOnline(), [])
  // 點存檔轉移連結進來：打開設定的「存檔」，轉移碼先填好
  useEffect(() => {
    const code = restoreFromUrl()
    if (code) useUI.setState({ menu: true, menuTab: 'save', restoreCode: code, news: false, nameSheet: false })
  }, [])
  useEffect(() => {
    const id = window.setTimeout(() => ('requestIdleCallback' in window ? window.requestIdleCallback(warmUp) : warmUp()), 3000)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <Stage>
      {screen === 'home' ? (
        <Home />
      ) : screen === 'room' ? (
        <RoomView />
      ) : (
        <MatchView />
      )}
      <PreMatch />
      <Menu />
      <Later on={learn}>
        <Learn />
      </Later>
      <Missions />
      <Shop />
      <Later on={records}>
        <Records />
      </Later>
      <Later on={people}>
        <People />
      </Later>
      <Later on={look}>
        <WardrobeSheet />
      </Later>
      <Later on={calc}>
        <Calc />
      </Later>
      <NameSheet />
      <OnlineSheet />
      <Later on={brag}>
        <BragSheet />
      </Later>
      <Later on={card}>
        <ShareCardSheet />
      </Later>
      <Later on={news}>
        <News />
      </Later>
      <Toast />
    </Stage>
  )
}
