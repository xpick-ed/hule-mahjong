// 所有會改變遊戲狀態的動作都在這裡。
// 每個動作拿舊的 RunState、回傳新的一份（不改舊的），不合法就丟 GameError。

import { BOSS_LIST, BOSSES, FINAL_BOSS } from './bosses'
import { GOD_LIST, GODS, MAX_GODS, type Rarity } from './gods'
import { checkTargets, ITEMS, MANUALS, MAX_ITEMS, TALISMANS, type ItemOps } from './items'
import { canPlayAny, classify, fits, isComplete, MELD_NAME } from './melds'
import { hashSeed, pick, rand, randInt, shuffle } from './rng'
import { scoreHand } from './scoring'
import { FLOWERS, HONORS, isFlower, SUITS, sortTiles, starterKinds, type Tile } from './tiles'
import type { Cashout, RoundState, RunState, ShopSlot } from './types'

export class GameError extends Error {}

const fail = (msg: string): never => {
  throw new GameError(msg)
}

// ---------- 數值 ----------

export const BASE_HAND_SIZE = 12
export const BASE_DISCARDS = 4
export const MAX_DISCARD_TILES = 5
export const START_COINS = 4
const WIND_BASE = [300, 1200, 5000, 20000]
const ROUND_MULT = [1, 1.5, 2, 2.5]
const ROUND_REWARD = [3, 3, 4, 5]
const REROLL_BASE = 3

export const WIND_NAME = ['東', '南', '西', '北']
export const ROUND_NAME = ['一', '二', '三', '四']

export function roundTitle(wind: number, no: number): string {
  const lap = Math.floor(wind / 4)
  return `${lap ? `第${lap + 1}將 ` : ''}${WIND_NAME[wind % 4]}${ROUND_NAME[no]}局`
}

export function baseTarget(wind: number, no: number): number {
  const base = wind < 4 ? WIND_BASE[wind] : WIND_BASE[3] * 3 ** (wind - 3)
  return Math.round((base * ROUND_MULT[no]) / 10) * 10
}

export function targetFor(run: RunState, wind: number, no: number): number {
  const boss = no === 3 ? BOSSES[bossFor(run, wind)] : null
  return Math.round((baseTarget(wind, no) * (boss?.targetMult ?? 1)) / 10) * 10
}

export function bossFor(run: RunState, wind: number): string {
  return run.bosses[wind] ?? FINAL_BOSS.id
}

// ---------- 工具 ----------

function edit(run: RunState, fn: (r: RunState) => void): RunState {
  const r = structuredClone(run)
  fn(r)
  return r
}

function needRound(r: RunState): RoundState {
  if (r.phase !== 'round' || !r.round) fail('現在不是牌局')
  return r.round!
}

function needPlaying(r: RunState): RoundState {
  const round = needRound(r)
  if (round.status !== 'play') fail('正在計分')
  return round
}

function takeFromHand(round: RoundState, ids: readonly number[]): Tile[] {
  if (new Set(ids).size !== ids.length) fail('同一張牌選了兩次')
  const tiles = ids.map((id) => round.hand.find((t) => t.id === id) ?? fail('手上沒有這張牌'))
  round.hand = round.hand.filter((t) => !ids.includes(t.id))
  return tiles
}

/** 補牌到手牌上限；摸到花牌自動亮出再補 */
function drawUp(round: RoundState) {
  while (round.hand.length < round.handSize && round.pile.length > 0) {
    const t = round.pile.pop()!
    if (isFlower(t.kind)) round.flowers.push(t)
    else round.hand.push(t)
  }
  sortTiles(round.hand)
}

function freeDiscard(r: RunState, round: RoundState): boolean {
  return !round.freeDiscardUsed && r.gods.some((g) => GODS[g.id].freeFirstDiscard)
}

export function canDiscard(r: RunState, round: RoundState): boolean {
  return round.pile.length > 0 && (round.discardsLeft > 0 || freeDiscard(r, round))
}

/** 卡住了（出不了牌也不能換牌）就流局 */
function checkStuck(r: RunState, round: RoundState) {
  if (round.status !== 'play') return
  if (canPlayAny(round.hand, round.table)) return
  if (canDiscard(r, round)) return
  round.status = 'draw'
  round.score = scoreHand(r, round, 'draw')
}

// ---------- 開局 ----------

export function newRun(seed: string): RunState {
  const r: RunState = {
    version: 1,
    seed,
    rng: hashSeed(seed),
    deck: [],
    nextId: 1,
    gods: [],
    items: [],
    levels: {},
    coins: START_COINS,
    wind: 0,
    no: 0,
    bosses: [],
    phase: 'round',
    round: null,
    cashout: null,
    shop: null,
    stats: { bestHand: 0, hus: 0, rounds: 0 },
    endless: false,
  }
  r.deck = starterKinds().map((kind) => ({ id: r.nextId++, kind }))
  const pool = shuffle(r, BOSS_LIST.map((b) => b.id))
  r.bosses = [pool[0], pool[1], pool[2], FINAL_BOSS.id]
  startRound(r)
  return r
}

function startRound(r: RunState) {
  // 無盡模式：每一圈補一個新魔王
  while (r.bosses.length <= r.wind) r.bosses.push(pick(r, BOSS_LIST).id)
  const bossId = r.no === 3 ? bossFor(r, r.wind) : null
  const boss = bossId ? BOSSES[bossId] : null
  const gods = r.gods.map((g) => GODS[g.id])
  const handSize = BASE_HAND_SIZE + gods.reduce((s, g) => s + (g.handSize ?? 0), 0) + (boss?.handSize ?? 0)
  const discards = BASE_DISCARDS + gods.reduce((s, g) => s + (g.discards ?? 0), 0) + (boss?.discards ?? 0)
  const round: RoundState = {
    wind: r.wind,
    no: r.no,
    target: targetFor(r, r.wind, r.no),
    boss: bossId,
    pile: shuffle(r, structuredClone(r.deck)),
    hand: [],
    table: { melds: [], eye: null },
    flowers: [],
    handSize: Math.max(4, handSize),
    discardsLeft: Math.max(0, discards),
    discardsUsed: 0,
    discardsThisHand: 0,
    freeDiscardUsed: false,
    total: 0,
    hands: 0,
    lastWasKong: false,
    status: 'play',
    score: null,
  }
  r.phase = 'round'
  r.round = round
  r.cashout = null
  r.shop = null
  drawUp(round)
  checkStuck(r, round)
}

// ---------- 牌局中的動作 ----------

/** 出牌：選的牌組成一組放上桌面 */
export function playMeld(run: RunState, ids: readonly number[]): RunState {
  return edit(run, (r) => {
    const round = needPlaying(r)
    const preview = ids.map((id) => round.hand.find((t) => t.id === id) ?? fail('手上沒有這張牌'))
    const type = classify(preview) ?? fail('這幾張組不成面子')
    if (!fits(type, round.table)) fail(type === 'pair' ? '雀頭已經有了' : '面子已經滿了')
    const tiles = sortTiles(takeFromHand(round, ids))
    if (type === 'pair') round.table.eye = { type, tiles }
    else round.table.melds.push({ type, tiles })
    round.lastWasKong = type === 'kong'

    if (isComplete(round.table)) {
      round.status = 'hu'
      round.score = scoreHand(r, round, 'hu')
      return
    }
    drawUp(round)
    checkStuck(r, round)
  })
}

/** 換牌：丟掉選的牌，重摸 */
export function discard(run: RunState, ids: readonly number[]): RunState {
  return edit(run, (r) => {
    const round = needPlaying(r)
    if (ids.length < 1 || ids.length > MAX_DISCARD_TILES) fail(`一次換 1–${MAX_DISCARD_TILES} 張`)
    if (round.pile.length === 0) fail('牌山摸完了')
    if (!canDiscard(r, round)) fail('沒有換牌次數了')
    takeFromHand(round, ids)
    if (freeDiscard(r, round)) round.freeDiscardUsed = true
    else round.discardsLeft--
    round.discardsUsed++
    round.discardsThisHand++
    drawUp(round)
    checkStuck(r, round)
  })
}

/** 計分動畫播完：把分數加進本局，決定過關、繼續下一手、或結束 */
export function resolveScore(run: RunState): RunState {
  return edit(run, (r) => {
    const round = needRound(r)
    const score = round.score ?? fail('沒有要結算的分數')
    round.total += score.score
    r.coins += score.coins
    r.stats.bestHand = Math.max(r.stats.bestHand, score.score)
    round.score = null

    if (round.status === 'hu') {
      r.stats.hus++
      round.hands++
      round.table = { melds: [], eye: null }
      round.flowers = []
      round.discardsThisHand = 0
      round.lastWasKong = false
    }
    const drew = round.status === 'draw'
    round.status = 'play'

    if (round.total >= round.target) return winRound(r, round)
    if (drew) {
      r.phase = 'gameover'
      return
    }
    drawUp(round)
    checkStuck(r, round)
  })
}

function winRound(r: RunState, round: RoundState) {
  r.stats.rounds++
  const lines: Cashout['lines'] = [{ label: `過關（${roundTitle(round.wind, round.no)}）`, coins: ROUND_REWARD[round.no] }]
  if (round.discardsLeft > 0) {
    const per = 1 + r.gods.reduce((s, g) => s + (GODS[g.id].cashoutPerDiscard ?? 0), 0)
    lines.push({ label: `剩 ${round.discardsLeft} 次換牌`, coins: round.discardsLeft * per })
  }
  const gold = round.hand.filter((t) => t.enh === 'gold').length
  if (gold) lines.push({ label: `手上的金牌 ×${gold}`, coins: gold * 3 })
  const interest = Math.min(5, Math.floor(r.coins / 5))
  if (interest) lines.push({ label: '利息（每 5 枚 +1）', coins: interest })
  r.cashout = { lines, total: lines.reduce((s, l) => s + l.coins, 0) }
  r.phase = 'cashout'
}

// ---------- 結算與廟口 ----------

export function collect(run: RunState): RunState {
  return edit(run, (r) => {
    if (r.phase !== 'cashout' || !r.cashout) fail('現在不能領錢')
    r.coins += r.cashout!.total
    r.cashout = null
    r.round = null
    r.phase = 'shop'
    r.shop = { slots: [], rerollCost: REROLL_BASE }
    fillShop(r)
  })
}

function rollRarity(r: RunState): Rarity {
  const x = rand(r)
  return x < 0.7 ? 1 : x < 0.95 ? 2 : 3
}

function genSlot(r: RunState, taken: Set<string>): ShopSlot {
  const x = rand(r)
  if (x < 0.5) {
    const owned = new Set(r.gods.map((g) => g.id))
    const free = (g: (typeof GOD_LIST)[number]) => !owned.has(g.id) && !taken.has(g.id)
    const rarity = rollRarity(r)
    const pool = GOD_LIST.filter((g) => g.rarity === rarity && free(g))
    const fallback = GOD_LIST.filter(free)
    if (pool.length || fallback.length) {
      const g = pick(r, pool.length ? pool : fallback)
      taken.add(g.id)
      return { kind: 'god', id: g.id, price: g.price }
    }
  }
  if (x < 0.72) {
    const t = pick(r, TALISMANS)
    return { kind: 'item', id: t.id, price: t.price }
  }
  if (x < 0.9) {
    const m = pick(r, MANUALS)
    return { kind: 'item', id: m.id, price: m.price }
  }
  const y = rand(r)
  if (y < 0.5) return { kind: 'tile', tile: { kind: pick(r, HONORS) }, price: 3 }
  if (y < 0.8) return { kind: 'tile', tile: { kind: pick(r, FLOWERS) }, price: 4 }
  const kind = `${pick(r, SUITS)}${1 + randInt(r, 9)}`
  return { kind: 'tile', tile: { kind, enh: rand(r) < 0.5 ? 'gold' : 'jade' }, price: 4 }
}

function fillShop(r: RunState) {
  const taken = new Set<string>()
  r.shop!.slots = [0, 1, 2].map(() => genSlot(r, taken))
}

function needShop(r: RunState) {
  if (r.phase !== 'shop' || !r.shop) fail('不在廟口')
  return r.shop!
}

export function buy(run: RunState, index: number): RunState {
  return edit(run, (r) => {
    const shop = needShop(r)
    const slot = shop.slots[index] ?? fail('沒有這個商品')
    if (slot.sold) fail('賣完了')
    if (r.coins < slot.price) fail('銅錢不夠')
    if (slot.kind === 'god') {
      if (r.gods.length >= MAX_GODS) fail('神龕滿了（最多 5 位）')
      r.gods.push({ uid: r.nextId++, id: slot.id })
    } else if (slot.kind === 'item') {
      if (r.items.length >= MAX_ITEMS) fail('符袋滿了（最多 2 張）')
      r.items.push({ uid: r.nextId++, id: slot.id })
    } else {
      r.deck.push({ id: r.nextId++, ...slot.tile })
    }
    r.coins -= slot.price
    slot.sold = true
  })
}

export function reroll(run: RunState): RunState {
  return edit(run, (r) => {
    const shop = needShop(r)
    if (r.coins < shop.rerollCost) fail('銅錢不夠')
    r.coins -= shop.rerollCost
    shop.rerollCost++
    fillShop(r)
  })
}

export function sellValue(price: number): number {
  return Math.max(1, Math.floor(price / 2))
}

export function sellGod(run: RunState, uid: number): RunState {
  return edit(run, (r) => {
    if (r.phase === 'round' && r.round?.status !== 'play') fail('正在計分')
    const g = r.gods.find((x) => x.uid === uid) ?? fail('沒有這位神明')
    r.gods = r.gods.filter((x) => x.uid !== uid)
    r.coins += sellValue(GODS[g.id].price)
  })
}

export function sellItem(run: RunState, uid: number): RunState {
  return edit(run, (r) => {
    const it = r.items.find((x) => x.uid === uid) ?? fail('沒有這張符')
    r.items = r.items.filter((x) => x.uid !== uid)
    r.coins += sellValue(ITEMS[it.id].price)
  })
}

/** 神明往左（-1）或往右（+1）移，會影響計分順序 */
export function moveGod(run: RunState, uid: number, dir: -1 | 1): RunState {
  return edit(run, (r) => {
    const i = r.gods.findIndex((g) => g.uid === uid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= r.gods.length) return
    ;[r.gods[i], r.gods[j]] = [r.gods[j], r.gods[i]]
  })
}

export function nextRound(run: RunState): RunState {
  return edit(run, (r) => {
    needShop(r)
    r.no++
    if (r.no > 3) {
      r.no = 0
      r.wind++
    }
    if (r.wind === 4 && !r.endless) {
      r.phase = 'victory'
      r.shop = null
      return
    }
    startRound(r)
  })
}

export function continueEndless(run: RunState): RunState {
  return edit(run, (r) => {
    if (r.phase !== 'victory') fail('還沒通關')
    r.endless = true
    startRound(r)
  })
}

// ---------- 道具 ----------

/** 用符或牌譜。需要選牌的符只能在牌局中用，targetIds 依選取順序 */
export function useItem(run: RunState, uid: number, targetIds: readonly number[]): RunState {
  return edit(run, (r) => {
    const inst = r.items.find((x) => x.uid === uid) ?? fail('沒有這張符')
    const def = ITEMS[inst.id]
    let targets: Tile[] = []
    if (def.min !== undefined) {
      const round = needPlaying(r)
      targets = targetIds.map((id) => round.hand.find((t) => t.id === id) ?? fail('手上沒有這張牌'))
      const why = checkTargets(def, targets)
      if (why) fail(why)
    }
    const ops: ItemOps = {
      coins: r.coins,
      targets,
      setTile(id, patch) {
        for (const list of [r.deck, r.round?.hand ?? []]) {
          const t = list.find((x) => x.id === id)
          if (t) Object.assign(t, patch)
        }
        if (r.round) sortTiles(r.round.hand)
      },
      removeTile(id) {
        r.deck = r.deck.filter((t) => t.id !== id)
        if (r.round) r.round.hand = r.round.hand.filter((t) => t.id !== id)
      },
      addCoins(n) {
        r.coins += n
      },
      summonGod() {
        if (r.gods.length >= MAX_GODS) return false
        const owned = new Set(r.gods.map((g) => g.id))
        const pool = GOD_LIST.filter((g) => g.rarity === 1 && !owned.has(g.id))
        if (!pool.length) return false
        r.gods.push({ uid: r.nextId++, id: pick(r, pool).id })
        return true
      },
      levelUp(key) {
        r.levels[key] = (r.levels[key] ?? 1) + 1
      },
    }
    const err = def.apply(ops)
    if (err) fail(err)
    r.items = r.items.filter((x) => x.uid !== uid)
    // 斷捨符之類會讓手牌變少，可能因此卡住
    if (r.round && r.round.status === 'play') checkStuck(r, r.round)
  })
}

/** 介面用：選的牌組成什麼、能不能放 */
export function describeSelection(round: RoundState, ids: readonly number[]) {
  const tiles = ids.map((id) => round.hand.find((t) => t.id === id)).filter((t): t is Tile => !!t)
  const type = classify(tiles)
  return {
    type,
    name: type ? (type === 'pair' ? '雀頭' : MELD_NAME[type]) : null,
    fits: type ? fits(type, round.table) : false,
  }
}
