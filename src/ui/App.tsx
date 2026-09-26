import { useUI } from '../store'
import { Stage } from './bits'
import { Home } from './Home'
import { MatchView } from './MatchView'
import { Learn } from './Learn'
import { Menu, Missions, NameSheet, Shop, Toast } from './Overlays'
import { People } from './People'
import { PreMatch } from './PreMatch'
import { Records } from './Records'

export function App() {
  const screen = useUI((s) => s.screen)
  return (
    <Stage>
      {screen === 'home' ? <Home /> : <MatchView />}
      <PreMatch />
      <Menu />
      <Learn />
      <Missions />
      <Shop />
      <Records />
      <People />
      <NameSheet />
      <Toast />
    </Stage>
  )
}
