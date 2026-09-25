import { BOSSES } from './bosses'
import { GODS, type Effect } from './gods'
import { meldBase } from './items'
import type { Meld } from './melds'
import { detectPatterns, patternMult } from './patterns'
import { faceChips, WINDS } from './tiles'
import type { RoundState, RunState, ScoreResult, Step } from './types'

/** 本圈風牌：東圈 z1、南圈 z2…（無盡模式循環） */
export function roundWind(wind: number): string {
  return WINDS[wind % 4]
}

export function level(run: RunState, key: keyof RunState['levels']): number {
  return run.levels[key] ?? 1
}

/**
 * 算這一手的分。kind = 'hu' 胡牌；'draw' 流局（只算已出的面子，台數固定 1）。
 * 會修改會成長的神明（例如太上老君），所以只能在引擎的動作裡呼叫。
 */
export function scoreHand(run: RunState, round: RoundState, kind: 'hu' | 'draw'): ScoreResult {
  const boss = round.boss ? BOSSES[round.boss] : null
  const gods = run.gods.map((inst) => ({ inst, def: GODS[inst.id] }))
  const steps: Step[] = []
  let chips = 0
  let mult = 1
  let coins = 0

  const groups: { meld: Meld; i: number }[] = round.table.melds.map((meld, i) => ({ meld, i }))
  if (round.table.eye) groups.push({ meld: round.table.eye, i: 4 })

  const applyGod = (uid: number, e: Effect, tileId?: number) => {
    if (e.chips) chips += e.chips
    if (e.mult) mult += e.mult
    if (e.xmult) mult *= e.xmult
    if (e.coins) coins += e.coins
    steps.push({ t: 'god', uid, tileId, ...e, c: chips, m: mult })
  }

  for (const { meld, i } of groups) {
    const meldOff = boss?.debuffMeld?.(meld.type) ?? false
    const base = meldOff ? 0 : meldBase(meld.type, level(run, meld.type))
    chips += base
    steps.push({ t: 'meld', i, chips: base, debuff: meldOff || undefined, c: chips, m: mult })

    for (const tile of meld.tiles) {
      if (meldOff || boss?.debuffTile?.(tile)) {
        steps.push({ t: 'tile', id: tile.id, chips: 0, debuff: true, c: chips, m: mult })
        continue
      }
      const fc = faceChips(tile.kind)
      chips += fc
      const jade = tile.enh === 'jade' ? 2 : 0
      mult += jade
      steps.push({ t: 'tile', id: tile.id, chips: fc, mult: jade || undefined, c: chips, m: mult })
      for (const g of gods) {
        const e = g.def.onTile?.(tile)
        if (e) applyGod(g.inst.uid, e, tile.id)
      }
    }
  }

  const patterns: ScoreResult['patterns'] = []
  if (kind === 'hu' && round.table.eye) {
    const hits = detectPatterns({
      melds: round.table.melds,
      eye: round.table.eye,
      flowers: round.flowers.length,
      roundWind: roundWind(round.wind),
      lastWasKong: round.lastWasKong,
      discardsThisHand: round.discardsThisHand,
    })
    for (const h of hits) {
      const add = patternMult(h.id, level(run, h.id)) * h.count
      mult += add
      patterns.push({ id: h.id, count: h.count, mult: add })
      steps.push({ t: 'pattern', id: h.id, count: h.count, mult: add, c: chips, m: mult })
    }
    const ctx = { run, round, melds: round.table.melds, eye: round.table.eye, patterns: hits }
    for (const g of gods) {
      const e = g.def.onHand?.(ctx, g.inst)
      if (e) applyGod(g.inst.uid, e)
    }
  }

  return { kind, steps, chips, mult, score: Math.floor(chips * mult), patterns, coins }
}
