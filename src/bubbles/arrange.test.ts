import { describe, expect, it } from 'vitest'
import { EXTERIOR } from '../model'
import { arrange, radiusFor, type ArrangeEdge, type ArrangeRoom } from './arrange'

const room = (
  id: string,
  tier: string,
  storey = 0,
  targetArea = 16,
  storeysSpanned = 1,
): ArrangeRoom => ({ id, tier, storey, targetArea, storeysSpanned })

/** A two-storey house small enough to work out by hand: every place below is counted on paper. */
const rooms: readonly ArrangeRoom[] = [
  room('entry', 'public', 0, 8),
  room('diwaniya', 'public', 0, 45),
  room('wc', 'exempt', 0, 4),
  room('dining', 'semi-public'),
  room('stair', 'semi-public', 0, 12, 2),
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
    // Ground: the public band at the bottom holds three, the WC behind the diwaniya it serves.
    expect(at(arranged, 'entry')).toEqual([120, 335])
    expect(at(arranged, 'diwaniya')).toEqual([240, 335])
    expect(at(arranged, 'wc')).toEqual([360, 335])
    expect(at(arranged, 'dining')).toEqual([180, 225])
    expect(at(arranged, 'stair')).toEqual([300, 225])
    expect(at(arranged, 'kitchen')).toEqual([240, 115])
    // First: its column starts after the ground's three cells and a gap.
    expect(at(arranged, 'stair', 1)).toEqual([600, 225])
    expect(at(arranged, 'bedroom', 1)).toEqual([600, 115])
    expect(arranged.columns).toEqual([
      { storey: 0, x: 60, width: 360 },
      { storey: 1, x: 480, width: 240 },
    ])
    expect(arranged.outside).toEqual([{ id: EXTERIOR, storey: 0, x: 240, y: 445, r: 18 }])
    expect([arranged.width, arranged.height]).toEqual([780, 530])
  })

  it('draws a stair once in every column it spans and nowhere else', () => {
    const arranged = arrange(rooms, edges, 2)
    expect(arranged.spots.filter((spot) => spot.id === 'stair').map((spot) => spot.storey)).toEqual(
      [0, 1],
    )
    expect(arranged.spots.filter((spot) => spot.id === 'bedroom')).toHaveLength(1)
  })

  it('moves a nudged room by its nudge and nothing else', () => {
    const nudged = rooms.map((each) =>
      each.id === 'diwaniya' ? { ...each, bubble: { x: 10, y: -5 } } : each,
    )
    const plain = arrange(rooms, edges, 2)
    const moved = arrange(nudged, edges, 2)
    expect(at(moved, 'diwaniya')).toEqual([250, 330])
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
    expect(arranged.bands.find((band) => band.tier === 'private')?.height).toBe(220)
    // Four cells wide, the fifth bedroom alone in the middle of the upper line.
    expect(at(arranged, 'bed4')).toEqual([300, 115])
  })

  it('hints at the area with the radius, held between 18 and 40', () => {
    expect(radiusFor(1)).toBe(18)
    expect(radiusFor(16)).toBeCloseTo(22.4, 9)
    expect(radiusFor(400)).toBe(40)
  })
})
