import { LayoutGroup, MotionConfig } from 'motion/react'
import { useUI } from '../store'
import { RunScreen } from './RunScreen'
import { Title } from './Screens'
import { HelpSheet, InfoSheet, MenuSheet, Toast } from './Sheets'

export function App() {
  const screen = useUI((s) => s.screen)
  return (
    <MotionConfig reducedMotion="user">
    <LayoutGroup>
      <div className="app">{screen === 'title' ? <Title /> : <RunScreen />}</div>
      <InfoSheet />
      <HelpSheet />
      <MenuSheet />
      <Toast />
    </LayoutGroup>
    </MotionConfig>
  )
}
