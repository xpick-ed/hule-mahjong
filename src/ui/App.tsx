import { useUI } from '../store'
import { Stage } from './bits'
import { Home } from './Home'
import { MatchView } from './MatchView'
import { Help, Menu, Missions, Shop, Toast } from './Overlays'

export function App() {
  const screen = useUI((s) => s.screen)
  return (
    <Stage>
      {screen === 'home' ? <Home /> : <MatchView />}
      <Menu />
      <Help />
      <Missions />
      <Shop />
      <Toast />
    </Stage>
  )
}
