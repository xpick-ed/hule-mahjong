// 學習中心：胡牌技巧（課程）、練習題（打哪張最好，用規則引擎評分）、算台規則（每種台附例子）。

import { useEffect, useMemo, useState } from 'react'
import { evaluate, makeWaitPuzzle, neededKinds } from '../engine/coach'
import { shuffle } from '../engine/rng'
import { KINDS, sortTiles, tileName, type Tile as T } from '../engine/tiles'
import { sfx } from '../sfx'
import { useUI, type LearnTab } from '../store'
import { cls, Tile } from './bits'
import { CHAPTERS } from './lessons'

/** 一排牌：「|」隔開的是不同組，hot 裡的牌會框起來 */
function Tiles({ ks, w = 24, hot = '' }: { ks: string; w?: number; hot?: string }) {
  const hots = hot.split(' ').filter(Boolean)
  return (
    <span className="learn-tiles">
      {ks.split('|').map((g, gi) => (
        <span key={gi} className="learn-group">
          {g
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((k, i) => (
              <Tile key={i} kind={k} w={w} hot={hots.includes(k)} />
            ))}
        </span>
      ))}
    </span>
  )
}

// ---------- 胡牌技巧 ----------

function Tips() {
  const [ci, setCi] = useState(0)
  const [li, setLi] = useState(0)
  const ch = CHAPTERS[ci]
  const l = ch.lessons[li]
  const go = (c: number, i: number) => {
    setCi(c)
    setLi(i)
  }
  // 最後一課按「下一課」就進下一章
  const next = () => (li + 1 < ch.lessons.length ? setLi(li + 1) : ci + 1 < CHAPTERS.length ? go(ci + 1, 0) : undefined)
  const prev = () => (li > 0 ? setLi(li - 1) : ci > 0 ? go(ci - 1, CHAPTERS[ci - 1].lessons.length - 1) : undefined)
  const first = ci === 0 && li === 0
  const last = ci === CHAPTERS.length - 1 && li === ch.lessons.length - 1
  return (
    <div className="lesson">
      <nav className="chapters" aria-label="章節">
        {CHAPTERS.map((c, k) => (
          <button key={c.id} type="button" aria-pressed={k === ci} onClick={() => go(k, 0)}>
            {c.name}
            <small>{c.lessons.length}</small>
          </button>
        ))}
      </nav>
      <header className="lesson-head">
        <span className="lesson-no">
          {ch.name} {li + 1}／{ch.lessons.length}
        </span>
        <h3>{l.title}</h3>
      </header>
      <div className="lesson-body">
        {l.body.map((p, k) => (
          <p key={k}>{p}</p>
        ))}
      </div>
      {l.examples.length > 0 && (
        <div className="lesson-examples">
          {l.examples.map((e, k) => {
            const w = e.waits === true ? neededKinds(e.ks.split(/[\s|]+/).filter(Boolean)).join(' ') : e.waits
            return (
              <div key={`${ci}-${li}-${k}`} className="example">
                <Tiles ks={e.ks} hot={e.hot} />
                {w && (
                  <span className="arrow">
                    → 等 <Tiles ks={w} w={20} />
                  </span>
                )}
                <small>{e.label}</small>
              </div>
            )
          })}
        </div>
      )}
      <div className="lesson-nav">
        <button type="button" className="btn small" disabled={first} onClick={prev}>
          上一課
        </button>
        <span className="dots" aria-hidden="true">
          {ch.lessons.map((_, k) => (
            <i key={k} className={cls(k === li && 'on')} />
          ))}
        </span>
        <button type="button" className="btn small primary" disabled={last} onClick={next}>
          {li + 1 === ch.lessons.length && !last ? `下一章：${CHAPTERS[ci + 1].name}` : '下一課'}
        </button>
      </div>
    </div>
  )
}

// ---------- 練習題 ----------

/** 出一題：17 張、打完最好是 0～2 步聽牌，而且不是每張都一樣好 */
function makePuzzle(seed: number): T[] {
  const r = { rng: seed >>> 0 || 1 }
  for (;;) {
    const deck = shuffle(
      r,
      KINDS.flatMap((k) => [k, k, k, k]),
    )
    const hand = sortTiles(deck.slice(0, 17).map((kind, id) => ({ id, kind })))
    const ev = evaluate(hand)
    const best = ev[0]
    const tied = ev.filter((x) => x.sh === best.sh && x.uke === best.uke).length
    if (best.sh <= 2 && tied < ev.length / 2) return hand
  }
}

const stepText = (sh: number) => (sh <= 0 ? '聽牌了' : `還差 ${sh} 步聽牌`)

function Practice() {
  const [mode, setMode] = useState<'discard' | 'waits'>('discard')
  return (
    <div className="practice">
      <div className="seg practice-mode" role="group" aria-label="練習題種類">
        <button type="button" aria-pressed={mode === 'discard'} onClick={() => setMode('discard')}>
          打哪張
        </button>
        <button type="button" aria-pressed={mode === 'waits'} onClick={() => setMode('waits')}>
          聽哪些
        </button>
      </div>
      {mode === 'discard' ? <DiscardPractice /> : <WaitPractice />}
    </div>
  )
}

/** 聽哪些：給一組同花色的牌（剛好聽牌），把聽的牌全部選出來 */
function WaitPractice() {
  const [size, setSize] = useState<7 | 10 | 13>(7)
  const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0)
  const puzzle = useMemo(() => makeWaitPuzzle(seed, size), [seed, size])
  const [picked, setPicked] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const suit = puzzle.kinds[0][0]
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${suit}${r}`)
  const correct = new Set(puzzle.waits)
  const ok = done && picked.length === correct.size && picked.every((k) => correct.has(k))
  const toggle = (k: string) => {
    if (done) return
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  }
  const submit = () => {
    setDone(true)
    const good = picked.length === correct.size && picked.every((k) => correct.has(k))
    setScore((s) => ({ right: s.right + (good ? 1 : 0), total: s.total + 1 }))
    if (good) sfx.win()
    else sfx.error()
  }
  const nextQ = (sz = size) => {
    setSize(sz)
    setSeed((Math.random() * 1e9) | 0)
    setPicked([])
    setDone(false)
  }
  return (
    <>
      <header className="practice-head">
        <h3>這手聽哪些牌？</h3>
        <div className="seg size-pick" role="group" aria-label="張數">
          {([7, 10, 13] as const).map((n) => (
            <button key={n} type="button" aria-pressed={size === n} onClick={() => nextQ(n)}>
              {n} 張
            </button>
          ))}
        </div>
        <span className="score">
          答對 {score.right}／{score.total}
        </span>
      </header>
      <p className="practice-lead">這些牌剛好聽牌。把會胡的牌全部點起來，再按「對答案」。</p>
      <div className="practice-hand">
        {puzzle.kinds.map((k, i) => (
          <Tile key={i} kind={k} w={28} />
        ))}
      </div>
      <div className="wait-picks" role="group" aria-label="選聽的牌">
        {all.map((k) => (
          <Tile
            key={k}
            kind={k}
            w={28}
            selected={picked.includes(k)}
            hot={done && correct.has(k)}
            dim={done && picked.includes(k) && !correct.has(k)}
            onClick={done ? undefined : () => toggle(k)}
          />
        ))}
      </div>
      {done ? (
        <div className={cls('verdict', ok ? 'good' : 'bad')}>
          <p>
            <b>{ok ? '全對！' : '差一點！'}</b>聽 {puzzle.waits.map(tileName).join('、')}，共 {puzzle.waits.length} 種。
            {!ok && picked.some((k) => !correct.has(k)) && ` 灰掉的是不會胡的。`}
          </p>
          <button type="button" className="btn small primary" onClick={() => nextQ()}>
            下一題
          </button>
        </div>
      ) : (
        <button type="button" className="btn small primary check" disabled={!picked.length} onClick={submit}>
          對答案
        </button>
      )}
    </>
  )
}

function DiscardPractice() {
  const [seed, setSeed] = useState(() => (Math.random() * 1e9) | 0)
  const hand = useMemo(() => makePuzzle(seed), [seed])
  const ev = useMemo(() => evaluate(hand), [hand])
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const best = ev[0]
  const isBest = (k: string) => {
    const e = ev.find((x) => x.kind === k)!
    return e.sh === best.sh && e.uke === best.uke
  }
  const pick = (k: string) => {
    if (picked) return
    setPicked(k)
    const ok = isBest(k)
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }))
    if (ok) sfx.win()
    else sfx.error()
  }
  const mine = picked ? ev.find((x) => x.kind === picked)! : null
  const bests = ev.filter((x) => isBest(x.kind))

  return (
    <>
      <header className="practice-head">
        <h3>這手該打哪張？</h3>
        <span className="score">
          答對 {score.right}／{score.total}
        </span>
      </header>
      <p className="practice-lead">手上 17 張，要打一張出去。選一張讓你最接近聽牌、之後能進的牌最多的。</p>
      <div className="practice-hand">
        {hand.map((t) => (
          <Tile
            key={t.id}
            kind={t.kind}
            w={30}
            selected={picked === t.kind && hand.find((x) => x.kind === t.kind)!.id === t.id}
            hot={!!picked && isBest(t.kind)}
            onClick={picked ? undefined : () => pick(t.kind)}
          />
        ))}
      </div>
      {mine ? (
        <div className={cls('verdict', isBest(mine.kind) ? 'good' : 'bad')}>
          <p>
            <b>{isBest(mine.kind) ? '答對了！' : '可惜！'}</b>打{tileName(mine.kind)}：{stepText(mine.sh)}，有 {mine.uke} 張牌能讓你更進一步。
          </p>
          {!isBest(mine.kind) && (
            <p>
              最好打 {bests.map((b) => tileName(b.kind)).join('或')}：{stepText(best.sh)}，有 {best.uke} 張牌能讓你更進一步。
            </p>
          )}
          <p className="good-tiles">
            {best.sh === 0 ? '打掉之後聽：' : '打掉之後，摸到這些會更好：'}
            <Tiles ks={best.good.join(' ')} w={18} />
          </p>
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              setSeed((Math.random() * 1e9) | 0)
              setPicked(null)
            }}
          >
            下一題
          </button>
        </div>
      ) : (
        <p className="practice-tip">提示：先找連不起來的孤張。框起來的是正解，選完才會出現。</p>
      )}
    </>
  )
}

// ---------- 算台規則 ----------

interface TaiRule {
  name: string
  tai: string
  when: string
  ks?: string
}

const TAI_RULES: { tai: string; items: TaiRule[] }[] = [
  {
    tai: '1 台',
    items: [
      { name: '莊家', tai: '1', when: '莊家胡牌，或莊家付錢給你' },
      { name: '門清', tai: '1', when: '沒吃、沒碰（暗槓可以），胡別人打的牌' },
      { name: '自摸', tai: '1', when: '自己摸到胡的牌' },
      { name: '正花', tai: '每張 1', when: '花牌對上你的位置（東：春梅、南：夏蘭、西：秋竹、北：冬菊）', ks: 'f1 f5' },
      { name: '三元牌', tai: '每組 1', when: '中、發、白的刻子', ks: 'z5 z5 z5' },
      { name: '圈風', tai: '1', when: '這一圈的風牌刻子（東風圈就是東）', ks: 'z1 z1 z1' },
      { name: '門風', tai: '1', when: '自己位置的風牌刻子（南家就是南）', ks: 'z2 z2 z2' },
      { name: '獨聽', tai: '1', when: '只聽一種牌：嵌張、邊張、單吊', ks: 'p3 p5' },
      { name: '槓上開花', tai: '1', when: '開槓補的那張剛好自摸' },
      { name: '海底撈月', tai: '1', when: '摸最後一張牌自摸' },
      { name: '河底撈魚', tai: '1', when: '胡最後一張打出來的牌' },
    ],
  },
  {
    tai: '2 台',
    items: [
      { name: '連莊', tai: '每連 2', when: '莊家連 1 次多 2 台（連 1 拉 1），連 2 次多 4 台…' },
      { name: '平胡', tai: '2', when: '五組都是順子、沒有字和花、聽兩面、胡別人打的牌', ks: 'm1 m2 m3 | p4 p5 p6 | s7 s8 s9 | m4 m5 m6 | p7 p8 p9 | s2 s2' },
      { name: '全求人', tai: '2', when: '五組全部吃碰亮出來，單吊胡別人打的牌' },
      { name: '三暗刻', tai: '2', when: '手上藏著三組刻子（放槍湊成的那組不算）', ks: 'm2 m2 m2 | p5 p5 p5 | s8 s8 s8' },
      { name: '花槓', tai: '2', when: '春夏秋冬或梅蘭竹菊湊齊一組', ks: 'f1 f2 f3 f4' },
    ],
  },
  {
    tai: '3 台',
    items: [{ name: '門清自摸', tai: '3', when: '沒吃沒碰又自摸（取代門清 1 台＋自摸 1 台）' }],
  },
  {
    tai: '4 台',
    items: [
      { name: '碰碰胡', tai: '4', when: '五組都是刻子', ks: 'm1 m1 m1 | p9 p9 p9 | s5 s5 s5 | z6 z6 z6 | m7 m7 m7 | z1 z1' },
      { name: '混一色', tai: '4', when: '只有一種花色，加上字牌', ks: 'm1 m2 m3 | m5 m6 m7 | z3 z3 z3 | m9 m9' },
      { name: '小三元', tai: '4', when: '中發白其中兩組刻子，第三種當眼', ks: 'z5 z5 z5 | z6 z6 z6 | z7 z7' },
    ],
  },
  {
    tai: '5 台',
    items: [{ name: '四暗刻', tai: '5', when: '手上藏著四組刻子' }],
  },
  {
    tai: '8 台',
    items: [
      { name: '清一色', tai: '8', when: '整手只有一種花色，沒有字', ks: 'p1 p2 p3 | p4 p5 p6 | p2 p3 p4 | p9 p9' },
      { name: '大三元', tai: '8', when: '中發白三組刻子都有', ks: 'z5 z5 z5 | z6 z6 z6 | z7 z7 z7' },
      { name: '小四喜', tai: '8', when: '三組風牌刻子，第四種風當眼', ks: 'z1 z1 z1 | z2 z2 z2 | z3 z3 z3 | z4 z4' },
      { name: '五暗刻', tai: '8', when: '手上藏著五組刻子' },
      { name: '嚦咕嚦咕', tai: '8', when: '七對加一組刻子，沒吃沒碰', ks: 'm1 m1 | m4 m4 | p2 p2 | p6 p6 | s3 s3 | s8 s8 | z2 z2 | z5 z5 z5' },
      { name: '八仙過海', tai: '8', when: '八張花全部到手，直接胡', ks: 'f1 f2 f3 f4 f5 f6 f7 f8' },
    ],
  },
  {
    tai: '16 台',
    items: [
      { name: '字一色', tai: '16', when: '整手都是字牌', ks: 'z1 z1 z1 | z2 z2 z2 | z5 z5 z5 | z6 z6 z6 | z7 z7' },
      { name: '大四喜', tai: '16', when: '四種風牌刻子都有', ks: 'z1 z1 z1 | z2 z2 z2 | z3 z3 z3 | z4 z4 z4' },
      { name: '天胡', tai: '16', when: '莊家開局拿到 17 張就胡了' },
      { name: '地胡', tai: '16', when: '閒家第一次摸牌就自摸，之前沒人吃碰' },
    ],
  },
]

function Rules() {
  return (
    <div className="rules-page">
      <section className="money">
        <h3>怎麼算錢</h3>
        <p className="formula">
          一筆錢 ＝ 底 ＋ 台數 × 每台
        </p>
        <ul>
          <li>別人打出來的牌讓你胡（放槍）：只有打那張的人付。</li>
          <li>自己摸到胡（自摸）：三家都付。</li>
          <li>跟莊家有關的那一筆（莊家胡、或莊家付錢），多算莊家 1 台；莊家連莊每連一次再多 2 台。</li>
        </ul>
        <div className="worked">
          <b>例子：巷口麻將，底 300、每台 100</b>
          <span>你胡林伯打的牌，3 台（林伯不是莊）：林伯付 300 ＋ 3 × 100 ＝ 600</span>
          <span>你自摸 3 台：三家各付 600，你收 1,800</span>
          <span>你自摸 3 台，美玲姐是莊家、連 1：美玲姐付 300 ＋（3＋1＋2）× 100 ＝ 900，另外兩家各付 600</span>
        </div>
        <p className="note">幾種牌型可以一起算。小三元、大三元取代個別的中發白；小四喜、大四喜取代圈風和門風。同一手牌有好幾種拆法時，算台最多的那種。</p>
      </section>
      {TAI_RULES.map((g) => (
        <section key={g.tai} className="tai-group">
          <h4>{g.tai}</h4>
          <ul>
            {g.items.map((it) => (
              <li key={it.name}>
                <div className="rule-text">
                  <b>{it.name}</b>
                  <span className="rule-tai">{it.tai} 台</span>
                  <p>{it.when}</p>
                </div>
                {it.ks && <Tiles ks={it.ks} w={16} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ---------- 外框 ----------

const TABS: { id: LearnTab; name: string }[] = [
  { id: 'tips', name: '胡牌技巧' },
  { id: 'practice', name: '練習題' },
  { id: 'rules', name: '台數規則' },
]

export function Learn() {
  const tab = useUI((s) => s.learn)
  const setLearn = useUI((s) => s.setLearn)
  useEffect(() => {
    if (!tab) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setLearn(null)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [tab, setLearn])
  if (!tab) return null
  return (
    <div className="overlay dim" onClick={() => setLearn(null)}>
      <div className="panel learn" role="dialog" aria-label="教學與規則" onClick={(e) => e.stopPropagation()}>
        <nav className="learn-tabs" aria-label="分頁">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setLearn(t.id)}>
              {t.name}
            </button>
          ))}
          <button type="button" className="btn small learn-close" onClick={() => setLearn(null)}>
            關閉
          </button>
        </nav>
        <div className="learn-content" key={tab}>
          {tab === 'tips' && <Tips />}
          {tab === 'practice' && <Practice />}
          {tab === 'rules' && <Rules />}
        </div>
      </div>
    </div>
  )
}

