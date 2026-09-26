// 學習中心：胡牌技巧（課程）、練習題（打哪張最好，用規則引擎評分）、算台規則（每種台附例子）。

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { evaluate } from '../engine/coach'
import { shuffle } from '../engine/rng'
import { KINDS, sortTiles, tileName, type Tile as T } from '../engine/tiles'
import { sfx } from '../sfx'
import { useUI, type LearnTab } from '../store'
import { cls, Tile } from './bits'

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

interface Example {
  label: string
  ks: string
  hot?: string
  /** 等哪些牌（顯示在箭頭後面） */
  waits?: string
}

interface Lesson {
  title: string
  body: ReactNode[]
  examples: Example[]
}

const LESSONS: Lesson[] = [
  {
    title: '胡牌長什麼樣子',
    body: [
      '手上 16 張，摸到（或別人打出）第 17 張時，湊成「5 組面子＋1 對」就胡了。',
      '面子有兩種：順子（同花色連號，像三四五萬）和刻子（三張一樣）。四張一樣可以開槓，也算一組。',
    ],
    examples: [{ label: '5 組面子＋1 對（眼）', ks: 'm1 m2 m3 | p4 p5 p6 | s7 s8 s9 | z5 z5 z5 | m6 m7 m8 | p2 p2' }],
  },
  {
    title: '搭子：還差一張的組合',
    body: ['差一張就變成面子的兩張牌叫「搭子」。搭子不一樣，能等的牌也不一樣：'],
    examples: [
      { label: '兩面（最好）', ks: 'm4 m5', waits: 'm3 m6' },
      { label: '嵌張', ks: 'p4 p6', waits: 'p5' },
      { label: '邊張', ks: 's1 s2', waits: 's3' },
      { label: '對子', ks: 'z1 z1', waits: 'z1' },
    ],
  },
  {
    title: '先打哪張',
    body: [
      '一開始先打連不起來的牌，順序大概是：',
      '1. 孤零零的字牌（東南西北中發白）。自己的風和中發白可以晚一點打，湊成刻子就有台。',
      '2. 孤零零的 1 和 9。',
      '3. 其他跟誰都連不上的牌。搭子和對子先留著。',
    ],
    examples: [{ label: '框起來的兩張可以先打', ks: 'm2 m3 | p5 p6 | s4 s4 | z3 | m9 | p1 p2', hot: 'z3 m9' }],
  },
  {
    title: '聽牌要聽「多」的',
    body: [
      '差一張就胡叫「聽牌」。可以選的時候，選能等最多張的聽法：兩面（2 種、最多 8 張）比嵌張、邊張、單吊（1 種、最多 4 張）好。',
      '也要算外面已經出現幾張。遊戲裡的聽牌提示會幫你算「還剩幾張」。',
    ],
    examples: [
      { label: '兩面：聽二、五萬，最多 8 張', ks: 'm3 m4', waits: 'm2 m5' },
      { label: '嵌張：只聽四筒，最多 4 張', ks: 'p3 p5', waits: 'p4' },
    ],
  },
  {
    title: '吃、碰要不要',
    body: [
      '吃碰會讓你快一點聽牌，但會失去「門清」（1 台），自摸時也拿不到「門清自摸」的 3 台。',
      '手牌已經很順（差一兩步就聽）時，不一定要吃；牌很亂、想趕快胡時，吃碰很好用。',
      '中發白和自己的風，碰了就有 1 台，值得碰。',
    ],
    examples: [{ label: '碰紅中：一組就 1 台', ks: 'z5 z5 z5' }],
  },
  {
    title: '防守：不要放槍',
    body: [
      '有人亮了三組，或牌局後半段有人一直打安全牌，他可能聽牌了。這時候先打：',
      '・現物：他自己打過的牌，打了不會放他槍。',
      '・筋：他打過四萬，一萬和七萬就比較安全（他如果是兩面聽，聽不到這兩張）。',
      '・外面已經看到三張的牌、字牌。最危險的是從沒出現過的中張（三到七）。',
    ],
    examples: [{ label: '他打過四萬 → 一萬、七萬比較安全', ks: 'm4 | m1 m7', hot: 'm1 m7' }],
  },
  {
    title: '做大牌',
    body: [
      '手上某種花色特別多，就把別的花色打掉，做混一色（4 台）或清一色（8 台）。',
      '對子很多時做碰碰胡（4 台），看到對子就碰。',
      '大牌會慢一點，但胡一次抵好幾次小胡。王經理就是這樣打的。',
    ],
    examples: [{ label: '清一色：整手只有一種花色', ks: 'p1 p2 p3 | p4 p5 p6 | p7 p7 p7 | p8 p9' }],
  },
  {
    title: '花牌、莊家、連莊',
    body: [
      '摸到花牌會自動亮出來再補一張。花牌跟你的位置對上就是「正花」，每張 1 台（東：春梅、南：夏蘭、西：秋竹、北：冬菊）。',
      '莊家胡牌或付錢都多算 1 台；連莊時每連一次再多 2 台。自己當莊可以衝一點，別人當莊時要更小心放槍。',
    ],
    examples: [{ label: '春夏秋冬湊齊：花槓 2 台', ks: 'f1 f2 f3 f4' }],
  },
]

function Tips() {
  const [i, setI] = useState(0)
  const l = LESSONS[i]
  return (
    <div className="lesson">
      <header className="lesson-head">
        <span className="lesson-no">
          {i + 1}／{LESSONS.length}
        </span>
        <h3>{l.title}</h3>
      </header>
      <div className="lesson-body">
        {l.body.map((p, k) => (
          <p key={k}>{p}</p>
        ))}
      </div>
      <div className="lesson-examples">
        {l.examples.map((e, k) => (
          <div key={k} className="example">
            <Tiles ks={e.ks} hot={e.hot} />
            {e.waits && (
              <span className="arrow">
                → 等 <Tiles ks={e.waits} w={20} />
              </span>
            )}
            <small>{e.label}</small>
          </div>
        ))}
      </div>
      <div className="lesson-nav">
        <button type="button" className="btn small" disabled={i === 0} onClick={() => setI(i - 1)}>
          上一課
        </button>
        <span className="dots" aria-hidden="true">
          {LESSONS.map((_, k) => (
            <i key={k} className={cls(k === i && 'on')} />
          ))}
        </span>
        <button type="button" className="btn small primary" disabled={i === LESSONS.length - 1} onClick={() => setI(i + 1)}>
          下一課
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
    <div className="practice">
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
    </div>
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

