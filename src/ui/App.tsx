import { useEffect } from 'react'
import { useUI } from '../store'
import { Stage } from './bits'
import { Home } from './Home'
import { MatchView } from './MatchView'
import { Learn } from './Learn'
import { Menu, Missions, NameSheet, Shop, Toast } from './Overlays'
import { BragSheet, ShareCardSheet } from './Brag'
import { OnlineSheet, RoomView } from './Online'
import { People } from './People'
import { PreMatch } from './PreMatch'
import { Records } from './Records'
import { WardrobeSheet } from './Wardrobe'
import { Calc } from './Calc'

export function App() {
  const screen = useUI((s) => s.screen)
  // 點邀請連結進來、或重新整理前在房間裡：連回房間
  useEffect(() => useUI.getState().bootOnline(), [])
  return (
    <Stage>
      {screen === 'home' ? <Home /> : screen === 'room' ? <RoomView /> : <MatchView />}
      <PreMatch />
      <Menu />
      <Learn />
      <Missions />
      <Shop />
      <Records />
      <People />
      <WardrobeSheet />
      <Calc />
      <NameSheet />
      <OnlineSheet />
      <BragSheet />
      <ShareCardSheet />
      <Toast />
    </Stage>
  )
}
