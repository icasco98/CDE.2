import { expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { arrange, type ArrangeConnection, type ArrangeZone } from './arrange'
import { cloudsOf } from './clouds'
import { milliseconds } from '../../tests/milliseconds'

/*
 * The budget: the diagram is arranged again on every edit and every frame of a nudge, rows ordered
 * to uncross included, so forty zones over three storeys must arrange inside one 16 ms frame, and
 * the category clouds drawn round them, remade as often, inside 4 ms.
 */

const tiers = ['public', 'semi-public', 'private', 'exempt']

const zones: readonly ArrangeZone[] = Array.from({ length: 40 }, (_, i) => ({
  id: `zone${i}`,
  tier: tiers[i % tiers.length]!,
  storey: i % 3,
  storeysSpanned: i === 0 ? 3 : 1,
  targetArea: 8 + (i % 7) * 5,
}))

const connections: readonly ArrangeConnection[] = [
  { a: EXTERIOR, b: 'zone1', storey: 1 },
  ...zones.slice(1).map((each, i) => ({ a: zones[i]!.id, b: each.id, storey: each.storey })),
  ...zones.slice(3).map((each, i) => ({ a: zones[i]!.id, b: each.id, storey: each.storey })),
]

it('arranges forty zones on three storeys in under 16 ms', () => {
  const took = milliseconds(() => arrange(zones, connections, 3))
  console.info(`arrange, 40 zones: ${took.toFixed(3)} ms`)
  expect(took).toBeLessThan(16)
})

it('draws the category clouds round forty zones in under 4 ms', () => {
  const { spots } = arrange(zones, connections, 3)
  const categories = ['reception', 'shared', 'private', 'service', 'open']
  const categoryOf = (id: string) => categories[Number(id.slice(4)) % categories.length]
  const took = milliseconds(() => cloudsOf(spots, categoryOf))
  console.info(`clouds, 40 zones: ${took.toFixed(3)} ms`)
  expect(took).toBeLessThan(4)
})
