import { neededKinds } from '../src/engine/coach'
import { CHAPTERS, LESSON_COUNT } from '../src/ui/lessons'
import { tileName } from '../src/engine/tiles'
let bad = 0
for (const ch of CHAPTERS) for (const l of ch.lessons) for (const e of l.examples) {
  if (e.waits !== true) continue
  const kinds = e.ks.split(/[\s|]+/).filter(Boolean)
  const w = neededKinds(kinds)
  if (!w.length) bad++
  console.log(`${w.length ? '✓' : '✗'} [${ch.name}] ${l.title}｜${e.label}：${kinds.map(tileName).join('')} → ${w.map(tileName).join('、') || '（算不出來）'}`)
}
console.log(`共 ${LESSON_COUNT} 課，算不出來的例子 ${bad} 個`)
