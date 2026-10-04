import { describe, expect, it } from 'vitest'
import { arrange, type ArrangeConnection, type ArrangeZone } from './arrange'
import { crossings } from './order'

const zone = (id: string, tier: string): ArrangeZone => ({
  id,
  tier,
  storey: 0,
  targetArea: 16,
  storeysSpanned: 1,
})

const connection = (a: string, b: string): ArrangeConnection => ({ a, b, storey: 0 })

/**
 * The crossings of straight lines between the circles' centres, as the diagram draws them, with the
 * zones where an arrangement given `placedBy` connections puts them: none leaves the program's order.
 */
function crossed(
  zones: readonly ArrangeZone[],
  connections: readonly ArrangeConnection[],
  placedBy: readonly ArrangeConnection[] = connections,
): number {
  const { spots } = arrange(zones, placedBy, 1)
  const at = (id: string) => spots.find((spot) => spot.id === id)!
  return crossings(connections.map((connection) => [at(connection.a), at(connection.b)] as const))
}

const orderOf = (
  zones: readonly ArrangeZone[],
  connections: readonly ArrangeConnection[],
  tier: string,
) =>
  arrange(zones, connections, 1)
    .spots.filter((spot) => zones.find((each) => each.id === spot.id)?.tier === tier)
    .sort((one, other) => one.x - other.x)
    .map((spot) => spot.id)

describe('counting crossings', () => {
  it('counts two lines that cross once, and none that only meet at an end or run side by side', () => {
    const p = (x: number, y: number) => ({ x, y })
    expect(
      crossings([
        [p(0, 0), p(10, 10)],
        [p(0, 10), p(10, 0)],
      ]),
    ).toBe(1)
    expect(
      crossings([
        [p(0, 0), p(10, 10)],
        [p(10, 10), p(20, 0)],
      ]),
    ).toBe(0)
    expect(
      crossings([
        [p(0, 0), p(10, 0)],
        [p(0, 5), p(10, 5)],
      ]),
    ).toBe(0)
  })
})

describe('the rows ordered so fewer lines cross', () => {
  // Three bedrooms over three living rooms, each joined to the one across the diagonal: in program
  // order all three lines pass through the middle, three crossings; reordered, none.
  const zones = [
    zone('bed-a', 'private'),
    zone('bed-b', 'private'),
    zone('bed-c', 'private'),
    zone('liv-d', 'semi-public'),
    zone('liv-e', 'semi-public'),
    zone('liv-f', 'semi-public'),
  ]
  const connections = [
    connection('bed-a', 'liv-f'),
    connection('bed-b', 'liv-e'),
    connection('bed-c', 'liv-d'),
  ]

  it('takes the reference graph from three crossings to none', () => {
    expect(crossed(zones, connections, [])).toBe(3)
    expect(crossed(zones, connections)).toBe(0)
    // The first sweep reads the rows from the top, so the bedrooms turn round over the living rooms.
    expect(orderOf(zones, connections, 'private')).toEqual(['bed-c', 'bed-b', 'bed-a'])
    expect(orderOf(zones, connections, 'semi-public')).toEqual(['liv-d', 'liv-e', 'liv-f'])
  })

  it('keeps the program order where no order crosses fewer', () => {
    // Every bedroom joined to every living room: one crossing whatever the order.
    const square = [zone('a', 'private'), zone('b', 'private')]
    const below = [zone('c', 'semi-public'), zone('d', 'semi-public')]
    const all = [
      connection('a', 'c'),
      connection('a', 'd'),
      connection('b', 'c'),
      connection('b', 'd'),
    ]
    expect(crossed([...square, ...below], all, [])).toBe(1)
    expect(crossed([...square, ...below], all)).toBe(1)
    expect(orderOf([...square, ...below], all, 'private')).toEqual(['a', 'b'])
    expect(orderOf([...square, ...below], all, 'semi-public')).toEqual(['c', 'd'])
  })

  it('orders the same program the same way twice', () => {
    expect(arrange(zones, connections, 1)).toEqual(arrange(zones, connections, 1))
  })
})
