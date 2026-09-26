// 引導局：第一次玩的時候，在對的時機跳出一句說明（每種只講一次）。
// 說明出現時電腦先停下來等你看完。

import { useMemo } from 'react'
import { shanten, toCounts } from '../engine/analysis'
import * as M from '../engine/match'
import { canTsumo, need } from '../engine/table'
import { publicThreats } from '../review'
import { useUI } from '../store'
import { cls } from './bits'

export interface GuideStep {
  id: string
  title: string
  text: string
  /** 說明框放哪裡：畫面中間、手牌上面、右下（吃碰按鈕旁邊） */
  at: 'center' | 'hand' | 'actions'
}

const STEPS: Record<string, Omit<GuideStep, 'id'>> = {
  welcome: {
    title: '歡迎來打牌！',
    text: '台灣麻將一人 16 張。湊成「5 組＋1 對」就胡了：一組是三張連號（順子，例如一二三萬）或三張一樣（刻子）。這一場對手會放水、也不計時，慢慢來。',
    at: 'center',
  },
  discard: {
    title: '輪到你打牌',
    text: '每次摸一張、打一張。點一張牌把它選起來，再點一次就打出去。上面有紅點的是教練建議打的牌。',
    at: 'hand',
  },
  pon: {
    title: '可以「碰」',
    text: '別人打出你有一對的牌，按「碰」就能拿來湊成三張一樣，然後換你打一張。不想要就按「過」。',
    at: 'actions',
  },
  chi: {
    title: '可以「吃」',
    text: '上家（左邊）打的牌能跟你手上兩張連成順子，按「吃」拿來。吃碰會讓牌變快，但少了「門清」的台數。',
    at: 'actions',
  },
  ting: {
    title: '你聽牌了！',
    text: '只差一張就胡。下面顯示你在等哪些牌、外面還剩幾張。等到了會出現「胡」的按鈕。',
    at: 'hand',
  },
  hu: {
    title: '可以胡了！',
    text: '按「胡」（自己摸到的叫「自摸」）。胡牌的台數越多，大家付你越多。',
    at: 'actions',
  },
  danger: {
    title: '有人快胡了',
    text: '牌上標「危」的很可能放槍，標「安」的比較安全。還差很多步的時候，先打安全牌。',
    at: 'hand',
  },
  skills: {
    title: '絕招',
    text: '上面的「換牌、偷看、好運」每場有次數，關鍵時刻再用。局結束時可以按「教練覆盤」，看看哪幾張能打得更好。',
    at: 'center',
  },
}

/** 現在要不要跳說明、跳哪一個 */
export function useGuideStep(m: M.MatchState): GuideStep | null {
  const seen = useUI((s) => s.guideSeen)
  const heardTing = useUI((s) => s.heardTing)
  const dangerOn = useUI((s) => s.settings.danger)
  return useMemo(() => {
    if (!m.tutorial || m.phase !== 'play') return null
    const h = m.hand
    const mine = M.waitingForYou(m)
    const want: string[] = ['welcome']
    if (m.handNo >= 2) want.push('skills')
    if (mine && h.phase === 'claim') {
      const o = h.options[0]!
      if (o.hu) want.push('hu')
      else if (o.pon) want.push('pon')
      else if (o.chi.length) want.push('chi')
    }
    if (mine && h.phase === 'discard') {
      if (canTsumo(h, 0)) want.push('hu')
      want.push('discard')
      if (dangerOn && publicThreats(h, heardTing).length) want.push('danger')
    }
    if (!mine && h.phase !== 'over' && shanten(toCounts(h.seats[0].hand), need(h, 0)) === 0) want.push('ting')
    const id = want.find((x) => !seen.includes(x))
    return id ? { id, ...STEPS[id] } : null
  }, [m, seen, heardTing, dangerOn])
}

export function Guide({ step }: { step: GuideStep }) {
  const seeGuide = useUI((s) => s.seeGuide)
  const skip = useUI((s) => s.skipTutorial)
  return (
    <div className={cls('guide', `at-${step.at}`)} role="dialog" aria-label={step.title}>
      <b>{step.title}</b>
      <p>{step.text}</p>
      <div className="guide-actions">
        <button type="button" className="guide-skip" onClick={skip}>
          不用教了
        </button>
        <button type="button" className="btn small primary" onClick={() => seeGuide(step.id)} autoFocus>
          知道了
        </button>
      </div>
    </div>
  )
}
