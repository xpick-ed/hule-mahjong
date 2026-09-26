// 角色：好感度、故事、專屬台詞、新衣服。沒遇過的角色先藏起來。

import { useEffect, type CSSProperties } from 'react'
import { CHARACTERS } from '../engine/characters'
import { STAGES } from '../engine/stages'
import * as P from '../progress'
import { lookFor, useUI } from '../store'
import { LEVEL_UNLOCKS, STORIES } from '../stories'
import { preloadVoices, speak } from '../voice'
import { Avatar } from './Avatar'
import { cls } from './bits'
import { Sheet } from './Overlays'

const ORDER = STAGES.flatMap((s) => s.opponents)
const STYLE_NAMES: [keyof (typeof CHARACTERS)[string]['style'], string][] = [
  ['speed', '愛吃碰'],
  ['defense', '防守'],
  ['greed', '做大牌'],
]

export function People() {
  const id = useUI((s) => s.people)
  const setPeople = useUI((s) => s.setPeople)
  if (!id) return null
  return (
    <Sheet open onClose={() => setPeople(null)} label="角色">
      {id === 'list' || !CHARACTERS[id] ? <List /> : <Detail id={id} />}
    </Sheet>
  )
}

function Hearts({ lv }: { lv: number }) {
  return (
    <span className="hearts" aria-label={`好感度 ${lv} 級`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={cls(i <= lv && 'on')} />
      ))}
    </span>
  )
}

function List() {
  const p = useUI((s) => s.progress)
  const setPeople = useUI((s) => s.setPeople)
  return (
    <>
      <h3>角色</h3>
      <p className="help-lead">一起打牌會增加好感度：解鎖他們的故事、專屬台詞，滿級還有新衣服。</p>
      <ul className="people">
        {ORDER.map((id) => {
          const met = !!p.vs[id]
          const lv = P.affinityLevel(p.affinity[id] ?? 0).lv
          const stage = STAGES.find((s) => s.opponents.includes(id))!
          return (
            <li key={id}>
              <button type="button" className={cls('person', !met && 'unmet')} onClick={() => met && setPeople(id)} disabled={!met}>
                <Avatar look={lookFor(p, id)} size={40} />
                <b>{met ? CHARACTERS[id].name : '？？？'}</b>
                {met ? <Hearts lv={lv} /> : <small>在「{stage.name}」遇到</small>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="sheet-actions">
        <button type="button" className="btn primary" onClick={() => setPeople(null)}>
          關閉
        </button>
      </div>
    </>
  )
}

function Detail({ id }: { id: string }) {
  const p = useUI((s) => s.progress)
  const setPeople = useUI((s) => s.setPeople)
  const setOutfit = useUI((s) => s.setOutfit)
  const ch = CHARACTERS[id]
  const st = STORIES[id]
  const aff = P.affinityLevel(p.affinity[id] ?? 0)
  const vs = p.vs[id]
  const friend = ch.lines.friend ?? []
  useEffect(() => preloadVoices([id]), [id])
  return (
    <div className="person-detail">
      <header className="pd-head">
        <Avatar look={lookFor(p, id)} size={64} />
        <div>
          <h3>{ch.name}</h3>
          <p>{ch.bio}</p>
          <span className="pd-style">
            {STYLE_NAMES.map(([k, name]) => (
              <span key={k}>
                {name}
                <i style={{ '--v': `${Math.round(ch.style[k] * 100)}%` } as CSSProperties} />
              </span>
            ))}
            {ch.skill && <em>絕招：{({ swap: '換牌', peek: '偷看', lucky: '好運' } as const)[ch.skill.id]}</em>}
          </span>
        </div>
      </header>
      <div className="pd-aff">
        <Hearts lv={aff.lv} />
        <span className="aff-bar" aria-hidden="true">
          <i style={{ width: `${aff.next ? (aff.into / aff.span) * 100 : 100}%` }} />
        </span>
        <small>{aff.next ? `下一級（${LEVEL_UNLOCKS[aff.lv + 1]}）還要 ${aff.next - aff.pts}` : '好感度滿級'}</small>
        {vs && (
          <small className="pd-vs">
            一起打過 {vs.played} 場，名次比他高 {vs.above} 場
          </small>
        )}
      </div>
      <div className="pd-stories">
        {st.stories.map((s, i) => {
          const need = i === 0 ? 2 : 4
          const open = aff.lv >= need
          return (
            <article key={i} className={cls('story', !open && 'locked')}>
              <h4>{open ? s.title : `故事〈${i === 0 ? '一' : '二'}〉`}</h4>
              <p>{open ? s.text : `好感度 Lv${need} 解鎖`}</p>
            </article>
          )
        })}
        <article className={cls('story', aff.lv < 3 && 'locked')}>
          <h4>專屬台詞</h4>
          {aff.lv >= 3 ? (
            <ul className="friend-lines">
              {friend.map((t, i) => (
                <li key={i}>
                  <button type="button" className="play-line" onClick={() => speak(id, `line.friend.${i}`)} aria-label="播放">
                    ▶
                  </button>
                  「{t}」
                </li>
              ))}
            </ul>
          ) : (
            <p>好感度 Lv3 解鎖（開場會跟你打招呼）</p>
          )}
        </article>
        <article className={cls('story', aff.lv < 5 && 'locked')}>
          <h4>新衣服：{aff.lv >= 5 ? st.outfit.name : '？？？'}</h4>
          {aff.lv >= 5 ? (
            <button type="button" className="toggle" aria-pressed={!!p.outfit[id]} onClick={() => setOutfit(id, !p.outfit[id])}>
              {p.outfit[id] ? '穿著' : '換上'}
            </button>
          ) : (
            <p>好感度 Lv5 解鎖</p>
          )}
        </article>
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => setPeople('list')}>
          全部角色
        </button>
        <button type="button" className="btn primary" onClick={() => setPeople(null)}>
          關閉
        </button>
      </div>
    </div>
  )
}
