import { describe, expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { arrange, type ArrangeEdge, type ArrangeRoom } from './arrange'

const room = (
  id: string,
  tier: string,
  storey = 0,
  targetArea = 16,
  storeysSpanned = 1,
): ArrangeRoom => ({ id, tier, storey, targetArea, storeysSpanned })

/**
 * A two-storey house small enough to work out by hand: every place below is counted on paper. The
 * 64 m² diwaniya sets the scale at 52 / √64 = 6.5 a root square metre, so every radius is round.
 */
const rooms: readonly ArrangeRoom[] = [
  room('entry', 'public', 0, 9),
  room('diwaniya', 'public', 0, 64),
  room('wc', 'exempt', 0, 4),
  room('dining', 'semi-public'),
  room('stair', 'semi-public', 0, 16, 2),
  room('kitchen', 'private'),
  room('bedroom', 'private', 1),
]

const edges: readonly ArrangeEdge[] = [
  { a: EXTERIOR, b: 'entry', storey: 0 },
  { a: 'diwaniya', b: 'wc', storey: 0 },
]

const at = (arranged: ReturnType<typeof arrange>, id: string, storey = 0) => {
  const spot = arranged.spots.find((each) => each.id === id && each.storey === storey)
  return spot ? [spot.x, spot.y] : null
}

describe('the bubble diagram arranged by storey and by tier', () => {
  it('stands every room where the reference case puts it', () => {
    const arranged = arrange(rooms, edges, 2)
    // The private and semi-public rows are 12 + 2 × 26 + 60 = 124 deep, the public row, round the
    // diwaniya's 52, 12 + 104 + 60 = 176; a row's circles stand 12 plus its largest radius down.
    // Ground: the public band at the bottom holds three, the WC behind the diwaniya it serves.
    expect(at(arranged, 'entry')).toEqual([120, 372])
    expect(at(arranged, 'diwaniya')).toEqual([240, 372])
    expect(at(arranged, 'wc')).toEqual([360, 372])
    expect(at(arranged, 'dining')).toEqual([180, 222])
    expect(at(arranged, 'stair')).toEqual([300, 222])
    expect(at(arranged, 'kitchen')).toEqual([240, 98])
    // First: its column starts after the ground's three cells and a gap.
    expect(at(arranged, 'stair', 1)).toEqual([600, 222])
    expect(at(arranged, 'bedroom', 1)).toEqual([600, 98])
    // √9, √64, √4 and √16 times 6.5; the WC's 13 is also the least radius drawn.
    const radii = arranged.spots.filter((spot) => spot.storey === 0).map((s) => [s.id, s.r])
    expect(Object.fromEntries(radii)).toEqual({
      entry: 19.5,
      diwaniya: 52,
      wc: 13,
      dining: 26,
      stair: 26,
      kitchen: 26,
    })
    expect(arranged.columns).toEqual([
      { storey: 0, x: 60, width: 360 },
      { storey: 1, x: 480, width: 240 },
    ])
    expect(arranged.outside).toEqual([{ id: EXTERIOR, storey: 0, x: 240, y: 539, r: 18 }])
    expect([arranged.width, arranged.height]).toEqual([780, 624])
  })

  it('draws a stair once in every column it spans and nowhere else', () => {
    const arranged = arrange(rooms, edges, 2)
    expect(arranged.spots.filter((spot) => spot.id === 'stair').map((spot) => spot.storey)).toEqual(
      [0, 1],
    )
    expect(arranged.spots.filter((spot) => spot.id === 'bedroom')).toHaveLength(1)
  })

  it('stands a stair at the right of the ground row and the left of the row above', () => {
    const first = [
      room('stair', 'semi-public', 0, 12, 2),
      room('dining', 'semi-public'),
      room('landing', 'semi-public', 1),
    ]
    const arranged = arrange(first, [], 2)
    // Ground: two cells of 120 from x 60, the stair in the second. First: from x 360, stair first.
    // The empty private row is 110 deep; the 16 m² rooms set the radius at 52, so 170 + 12 + 52.
    expect(at(arranged, 'dining')).toEqual([120, 234])
    expect(at(arranged, 'stair')).toEqual([240, 234])
    expect(at(arranged, 'stair', 1)).toEqual([420, 234])
    expect(at(arranged, 'landing', 1)).toEqual([540, 234])
  })

  it('moves a nudged room by its nudge and nothing else', () => {
    const nudged = rooms.map((each) =>
      each.id === 'diwaniya' ? { ...each, bubble: { x: 10, y: -5 } } : each,
    )
    const plain = arrange(rooms, edges, 2)
    const moved = arrange(nudged, edges, 2)
    expect(at(moved, 'diwaniya')).toEqual([250, 367])
    const others = (arranged: typeof plain) =>
      arranged.spots.filter((spot) => spot.id !== 'diwaniya')
    expect(others(moved)).toEqual(others(plain))
  })

  it('is the same diagram twice for the same program', () => {
    expect(arrange(rooms, edges, 2)).toEqual(arrange(rooms, edges, 2))
  })

  it('wraps a busy band onto a second line and deepens it on every column', () => {
    const many = Array.from({ length: 5 }, (_, i) => room(`bed${i}`, 'private'))
    const arranged = arrange(many, [], 2)
    // Two lines of 12 + 104 + 60 = 176, the fifth bedroom alone in the middle of the upper one.
    expect(arranged.bands.find((band) => band.tier === 'private')?.height).toBe(352)
    expect(at(arranged, 'bed4')).toEqual([300, 124])
  })
})
