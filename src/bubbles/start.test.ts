import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../geometry'
import { startingSite, type Plot } from '../model'
import { CORRIDOR_R, corridorHalf, endsOf } from './capsule'
import { groundOf } from './ground'
import { createState, restBetween, settle, step, type SimulationRoom } from './simulation'
import { canonicalStart } from './start'

const plot: Plot = {
  on: true,
  polygon: [
    [0, 0],
    [20, 0],
    [20, 25],
    [0, 25],
  ],
  north: 0,
  street: [2],
}
const ground = groundOf(plot, startingSite)

/** The kerb line the setbacks leave: two metres in from the street, at the bottom of the sheet. */
const KERB_Y = 23

function room(
  id: string,
  kind: string,
  targetArea: number,
  extra: Partial<SimulationRoom> = {},
): SimulationRoom {
  return { id, storey: 0, storeysSpanned: 1, targetArea, pinned: false, kind, ...extra }
}

/** A villa's ground floor as the program lists it, in the order a rebuild writes it down. */
const villa: SimulationRoom[] = [
  room('entry', 'entry-foyer', 8),
  room('hall', 'hallway', 12),
  room('diwaniya', 'diwaniya', 52.5),
  room('wc', 'diwaniya-wc', 5),
  room('formal', 'formal-living', 35),
  room('family', 'family-living', 38.5, { tier: 'private' }),
  room('kitchen', 'kitchen', 20, { tier: 'private' }),
  room('bay1', 'garage', 18),
  room('bay2', 'garage', 18),
]

const links = [
  { a: 'diwaniya', b: 'wc', storey: 0 },
  { a: 'entry', b: 'hall', storey: 0 },
  { a: 'entry', b: 'formal', storey: 0 },
  { a: 'entry', b: 'family', storey: 0 },
]

describe('the first arrangement, derived from the program', () => {
  it('puts the walled rooms on the kerb in order, from the diwaniya’s side', () => {
    const places = canonicalStart(villa, links, ground)
    const at = (id: string) => places.get(id) ?? { x: 0, y: 0 }
    // The service side runs from the east end of the plot to the west, so the diwaniya opens at
    // the east, the entry at the middle of the frontage and the bays against the west boundary.
    expect(at('diwaniya').x).toBeGreaterThan(at('entry').x)
    expect(at('entry').x).toBeGreaterThan(at('bay1').x)
    expect(at('bay1').x).toBeGreaterThan(at('bay2').x)
    for (const id of ['entry', 'bay1', 'bay2']) expect(at(id).y).toBeLessThan(KERB_Y)
  })

  it('opens the same way twice, because nothing in it is left to chance', () => {
    expect([...canonicalStart(villa, links, ground)]).toEqual([
      ...canonicalStart(villa, links, ground),
    ])
  })

  it('opens the corridor just inside the entry, pointing into the plot', () => {
    const places = canonicalStart(villa, links, ground)
    const entry = places.get('entry')
    const hall = places.get('hall')
    if (!entry || !hall) throw new Error('the ground floor has no entry or no corridor')
    expect(hall.y).toBeLessThan(entry.y)
    expect(Math.abs(hall.x - entry.x)).toBeLessThan(0.01)
  })

  it('keeps the kitchen off the frontage and the family living room away from it', () => {
    const places = canonicalStart(villa, links, ground)
    expect(places.get('kitchen')?.y ?? 0).toBeLessThan(12)
    expect(places.get('family')?.y ?? 0).toBeLessThan(KERB_Y - 5)
  })

  it('opens a companion on its owner’s perimeter rather than out on its own', () => {
    const places = canonicalStart(villa, links, ground)
    const owner = places.get('diwaniya')
    const companion = places.get('wc')
    if (!owner || !companion) throw new Error('the diwaniya has no WC')
    const apart = Math.hypot(owner.x - companion.x, owner.y - companion.y)
    expect(apart).toBeLessThanOrEqual(Math.sqrt(52.5 / Math.PI) + Math.sqrt(5 / Math.PI) + 0.01)
  })

  it('opens every room inside the buildable line', () => {
    for (const [, at] of canonicalStart(villa, links, ground))
      expect(pointInPolygon(ground.inside.polygon, [at.x, at.y])).toBe(true)
  })
})

describe('the walls the picture is held by', () => {
  it('holds the entry against its kerb whatever the forces ask of it', () => {
    const out = settle(createState(villa, links, ground))
    const entry = out.state.bodies.find((body) => body.id === 'entry')
    if (!entry) throw new Error('there is no entry')
    expect(entry.y + entry.radius).toBeCloseTo(KERB_Y, 6)
  })

  it('slides a walled room along the kerb rather than letting it off, hand or no hand', () => {
    const held = { ...villa[0], bubble: { x: 4, y: 4 }, pinned: true } as SimulationRoom
    const out = step(createState([held, ...villa.slice(1)], links, ground))
    const entry = out.bodies[0]
    if (!entry) throw new Error('there is no entry')
    // One frame is the whole of a wall: it is put back on the kerb line and moves along it alone.
    expect(entry.y + entry.radius).toBeCloseTo(KERB_Y, 6)
    expect(entry.x).toBeGreaterThan(ground.inside.polygon[0]?.[0] ?? 0)
  })

  it('holds the diwaniya within one room-depth of its street, wherever it is let go', () => {
    // Let go at the far back of the floor, which is where no diwaniya may stand: the band is a
    // wall, so one frame brings it back to the deepest place the owner's ruling allows.
    const back = villa.map((each) =>
      each.id === 'diwaniya' ? { ...each, bubble: { x: 10, y: 3 } } : each,
    )
    const out = step(createState(back, links, ground))
    const room = out.bodies.find((body) => body.id === 'diwaniya')
    if (!room) throw new Error('there is no diwaniya')
    // Three radii from the line is the furthest its middle may be: a near rim one diameter back.
    expect(KERB_Y - room.y).toBeLessThanOrEqual(3 * room.radius + 1e-6)
    expect(KERB_Y - room.y - room.radius).toBeLessThanOrEqual(2 * room.radius + 1e-6)
  })

  it('draws the corridor as a capsule of its area, its near end on the entry', () => {
    const out = settle(createState(villa, links, ground))
    const hall = out.state.bodies.find((body) => body.id === 'hall')
    const entry = out.state.bodies.find((body) => body.id === 'entry')
    if (!hall || !entry) throw new Error('there is no corridor')
    expect(hall.radius).toBe(CORRIDOR_R)
    expect(hall.half).toBeCloseTo(corridorHalf(12), 9)
    // Its area is the capsule's: the two round ends and the straight part between them.
    const capsule = Math.PI * hall.radius ** 2 + 4 * hall.radius * hall.half
    expect(capsule).toBeCloseTo(12, 6)
    const [near] = endsOf(hall)
    expect(Math.hypot(near[0] - entry.x, near[1] - entry.y)).toBeCloseTo(
      restBetween(entry, hall),
      6,
    )
  })
})
