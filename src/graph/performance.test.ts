import { expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { graphChecks } from './checks'
import type { CheckConnection, CheckZone } from './types'

/*
 * The budget: the checks are read again on every edit, so forty zones on three storeys with a
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

const zones: readonly CheckZone[] = Array.from({ length: 40 }, (_, i) => ({
  id: `zone${i}`,
  name: `Zone ${i}`,
  tier: tiers[i % tiers.length]!,
  storey: i === 0 ? 0 : i % 3,
  storeysSpanned: i === 0 ? 3 : 1,
}))

const connections: readonly CheckConnection[] = [
  { a: EXTERIOR, b: 'zone1', kind: 'main-door', storey: 1 },
  ...zones.slice(1).map((each, i) => ({
    a: zones[i]!.id,
    b: each.id,
    kind: 'door' as const,
    storey: each.storey,
  })),
]

const apart = Array.from({ length: 12 }, (_, i) => ({ a: `zone${i}`, b: `zone${39 - i}` }))

it('reads every check on forty zones in under 16 ms', () => {
  const took = milliseconds(() => graphChecks({ zones, connections, apart, storeys: 3 }))
  console.info(`graph checks, 40 zones: ${took.toFixed(3)} ms`)
  expect(took).toBeLessThan(16)
})
