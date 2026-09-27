import { describe, expect, it } from 'vitest'
import { arrange, type ArrangeEdge, type ArrangeRoom } from './arrange'
import { crossings } from './order'

const room = (id: string, tier: string): ArrangeRoom => ({
  id,
  tier,
  storey: 0,
  targetArea: 16,
  storeysSpanned: 1,
})

const link = (a: string, b: string): ArrangeEdge => ({ a, b, storey: 0 })

/**
 * The crossings of straight lines between the circles' centres, as the diagram draws them, with the
 * rooms where an arrangement given `placedBy` edges puts them: none leaves the program's order.
 */
function crossed(
  rooms: readonly ArrangeRoom[],
  edges: readonly ArrangeEdge[],
  placedBy: readonly ArrangeEdge[] = edges,
): number {
  const { spots } = arrange(rooms, placedBy, 1)
  const at = (id: string) => spots.find((spot) => spot.id === id)!
  return crossings(edges.map((edge) => [at(edge.a), at(edge.b)] as const))
}

const orderOf = (rooms: readonly ArrangeRoom[], edges: readonly ArrangeEdge[], tier: string) =>
  arrange(rooms, edges, 1)
    .spots.filter((spot) => rooms.find((each) => each.id === spot.id)?.tier === tier)
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
  const rooms = [
    room('bed-a', 'private'),
    room('bed-b', 'private'),
    room('bed-c', 'private'),
    room('liv-d', 'semi-public'),
    room('liv-e', 'semi-public'),
    room('liv-f', 'semi-public'),
  ]
  const edges = [link('bed-a', 'liv-f'), link('bed-b', 'liv-e'), link('bed-c', 'liv-d')]

  it('takes the reference graph from three crossings to none', () => {
    expect(crossed(rooms, edges, [])).toBe(3)
    expect(crossed(rooms, edges)).toBe(0)
    // The first sweep reads the rows from the top, so the bedrooms turn round over the living rooms.
    expect(orderOf(rooms, edges, 'private')).toEqual(['bed-c', 'bed-b', 'bed-a'])
    expect(orderOf(rooms, edges, 'semi-public')).toEqual(['liv-d', 'liv-e', 'liv-f'])
  })

  it('keeps the program order where no order crosses fewer', () => {
    // Every bedroom joined to every living room: one crossing whatever the order.
    const square = [room('a', 'private'), room('b', 'private')]
    const below = [room('c', 'semi-public'), room('d', 'semi-public')]
    const all = [link('a', 'c'), link('a', 'd'), link('b', 'c'), link('b', 'd')]
    expect(crossed([...square, ...below], all, [])).toBe(1)
    expect(crossed([...square, ...below], all)).toBe(1)
    expect(orderOf([...square, ...below], all, 'private')).toEqual(['a', 'b'])
    expect(orderOf([...square, ...below], all, 'semi-public')).toEqual(['c', 'd'])
  })

  it('orders the same program the same way twice', () => {
    expect(arrange(rooms, edges, 1)).toEqual(arrange(rooms, edges, 1))
  })
})
