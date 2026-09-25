import { expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { arrange, type ArrangeEdge, type ArrangeRoom } from './arrange'

/*
 * The budget: the diagram is arranged again on every edit and every frame of a nudge, so forty
 * rooms over three storeys must arrange inside one 16 ms frame.
 */

function milliseconds(work: () => void): number {
  for (let i = 0; i < 5; i++) work()
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

const tiers = ['public', 'semi-public', 'private', 'exempt']

const rooms: readonly ArrangeRoom[] = Array.from({ length: 40 }, (_, i) => ({
  id: `room${i}`,
  tier: tiers[i % tiers.length]!,
  storey: i % 3,
  storeysSpanned: i === 0 ? 3 : 1,
  targetArea: 8 + (i % 7) * 5,
}))

const edges: readonly ArrangeEdge[] = [
  { a: EXTERIOR, b: 'room1', storey: 1 },
  ...rooms.slice(1).map((each, i) => ({ a: rooms[i]!.id, b: each.id, storey: each.storey })),
  ...rooms.slice(3).map((each, i) => ({ a: rooms[i]!.id, b: each.id, storey: each.storey })),
]

it('arranges forty rooms on three storeys in under 16 ms', () => {
  const took = milliseconds(() => arrange(rooms, edges, 3))
  console.info(`arrange, 40 rooms: ${took.toFixed(3)} ms`)
  expect(took).toBeLessThan(16)
})
