import { expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { graphChecks } from './checks'
import type { CheckEdge, CheckRoom } from './types'

/*
 * The budget: the checks are read again on every edit, so forty rooms on three storeys with a
 * dozen keep-apart pairs must be read inside one 16 ms frame.
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

const rooms: readonly CheckRoom[] = Array.from({ length: 40 }, (_, i) => ({
  id: `room${i}`,
  name: `Room ${i}`,
  tier: tiers[i % tiers.length]!,
  storey: i === 0 ? 0 : i % 3,
  storeysSpanned: i === 0 ? 3 : 1,
}))

const edges: readonly CheckEdge[] = [
  { a: EXTERIOR, b: 'room1', kind: 'main-door', storey: 1 },
  ...rooms.slice(1).map((each, i) => ({
    a: rooms[i]!.id,
    b: each.id,
    kind: 'door' as const,
    storey: each.storey,
  })),
]

const apart = Array.from({ length: 12 }, (_, i) => ({ a: `room${i}`, b: `room${39 - i}` }))

it('reads every check on forty rooms in under 16 ms', () => {
  const took = milliseconds(() => graphChecks({ rooms, edges, apart, storeys: 3 }))
  console.info(`graph checks, 40 rooms: ${took.toFixed(3)} ms`)
  expect(took).toBeLessThan(16)
})
