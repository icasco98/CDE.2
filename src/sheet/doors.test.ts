import { describe, expect, it } from 'vitest'
import {
  doorAcross,
  doorAt,
  doorBlocked,
  doorSlid,
  doorSpot,
  doorStanding,
  drawnDoors,
  doorInTheWay,
  zoneForDoor,
  standingAt,
  walkTest,
} from './doors'
import { sheetOf, type Door, type Zone, type Sheet } from './model'
import { r2, toWorld } from './geometry'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
  cat: 'shared',
  target: 10,
  x: 6,
  y: 6,
  w: 2.6,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

/** A door out of the zone through its north edge, at its middle. */
const door = (over: Partial<Door> = {}): Door => ({
  id: 'd1',
  connection: 'e1',
  to: 'EXTERIOR',
  type: 'door',
  w: 0.9,
  at: [1.3, 0],
  flip: false,
  hinge: false,
  ...over,
})

/** A door from A into B, halfway along the edge the two share. */
const between = (over: Partial<Door> = {}): Door => ({
  id: 'd2',
  connection: 'e2',
  to: 'b',
  type: 'door',
  w: 0.9,
  along: 0.5,
  flip: false,
  hinge: false,
  ...over,
})

/** Where a door of zone `id` is drawn, in plot metres, or null when it is not drawn. */
const drawnAt = (sheet: Sheet, id: string): [number, number] | null => {
  const r = sheet.zones.find((o) => o.id === id)!
  const pl = doorSpot(sheet, 0, r, r.doors![0]!)
  return pl ? (toWorld(r, pl.p[0], pl.p[1]).map(r2) as [number, number]) : null
}

describe('where a door sits', () => {
  /** The jamb is 0.15 m by default: the leaf's near edge lands there, so its middle is at 0.6. */
  it('a 0.9 m door on a 2.6 m edge clicked 0.4 from the corner sits 0.15 m from it', () => {
    const sheet = sheetOf([zone()])
    const hit = doorAt(6.4, 6, 0.9, sheet, 0)!
    expect(hit.why).toBeNull()
    expect(hit.pl.snapped).toBe('jamb')
    expect(r2(hit.pl.t)).toBe(0.6)
    expect(r2(hit.pl.t - 0.45)).toBe(0.15)
  })

  /**
   * An edge must hold the leaf and 10 cm more, so 1 m is the very limit for a 0.9 m door and an edge
   * any shorter is refused. The parent brief calls an edge of exactly 1 m refused; the mock's own
   * test is `L >= w + 0.1`, which 1 m passes, so the refusal starts just under it.
   */
  it('a 0.9 m door on a 0.95 m edge is refused: “That edge is too short for this door.”', () => {
    const sheet = sheetOf([zone({ w: 0.95, h: 3 })])
    const hit = doorAt(6.475, 6, 0.9, sheet, 0)!
    expect(hit.why).toBe('That edge is too short for this door.')
    expect(doorAt(6.5, 6, 0.9, sheetOf([zone({ w: 1, h: 3 })]), 0)!.why).toBeNull()
  })

  it('takes no door on an edge that stands on the plot boundary', () => {
    const sheet = sheetOf([zone({ x: 0, y: 6, w: 3, h: 3 })])
    expect(doorAt(0, 7.5, 0.9, sheet, 0)!.why).toBe('An edge on the boundary takes no door.')
  })

  it('snaps to the middle of the edge when that is nearer', () => {
    const sheet = sheetOf([zone({ w: 4, h: 3 })])
    expect(doorAt(8, 6, 0.9, sheet, 0)!.pl.snapped).toBe('middle')
  })

  it('finds nothing where there is no edge', () => {
    expect(doorAt(1, 1, 0.9, sheetOf([zone()]), 0)).toBeNull()
  })

  it('names the zone across the edge, and nothing outside', () => {
    const a = zone({ x: 6, y: 6, w: 3, h: 3 })
    const b = zone({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    const sheet = sheetOf([a, b])
    expect(doorAcross(a, doorAt(9, 7.5, 0.9, sheet, 0)!.pl, sheet, 0)?.name).toBe('B')
    expect(doorAcross(a, doorAt(6, 7.5, 0.9, sheet, 0)!.pl, sheet, 0)).toBeNull()
  })
})

describe('a door is the drawing of its connection', () => {
  /*
   * A is 3 × 3 at (6, 6) and B 3 × 3 at (9, 7): they share the edge x = 9 from y 7 to 9, 2 m, so a
   * door halfway along it stands at (9, 8).
   */
  const pair = (bAt: { x: number; y: number }) =>
    sheetOf([
      zone({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      zone({ id: 'b', name: 'B', ...bAt, w: 3, h: 3 }),
    ])

  it('stands halfway along the edge the two zones share', () => {
    expect(drawnAt(pair({ x: 9, y: 7 }), 'a')).toEqual([9, 8])
  })

  it('is not drawn when the zones move apart, and comes back where it was when they meet', () => {
    expect(drawnAt(pair({ x: 12, y: 7 }), 'a')).toBeNull()
    expect(drawnDoors(pair({ x: 12, y: 7 }), 0)).toEqual([])
    expect(drawnAt(pair({ x: 9, y: 7 }), 'a')).toEqual([9, 8])
  })

  it('follows the edge when the zones meet on another side', () => {
    // B under A: they share the edge y = 9 from x 7 to 9, so halfway is (8, 9).
    expect(drawnAt(pair({ x: 7, y: 9 }), 'a')).toEqual([8, 9])
  })

  it('is not drawn where the shared edge is shorter than the door', () => {
    expect(drawnAt(pair({ x: 9, y: 8.5 }), 'a')).toBeNull()
  })

  it('counts along the edge from its western, then northern, end, whichever zone holds it', () => {
    const sheet = pair({ x: 9, y: 7 })
    const a = sheet.zones[0]!
    a.doors = [between({ along: 0.25 })]
    // The 2 m from y 7 to 9, a quarter of the way from the north end, held a door's half from it.
    expect(drawnAt(sheet, 'a')).toEqual([9, 7.5])
    expect(standingAt(a, sheet.zones[1]!, [3, 1.5])).toEqual({ side: 'east', along: 0.25 })
  })

  it('draws a door to the outside on its own edge while that edge faces outside', () => {
    const out = sheetOf([zone({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [1.5, 0] })] })])
    expect(drawnAt(out, 'a')).toEqual([7.5, 6])
    const covered = sheetOf([
      zone({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [1.5, 0] })] }),
      zone({ id: 'b', name: 'B', x: 6, y: 3, w: 3, h: 3 }),
    ])
    expect(drawnAt(covered, 'a')).toBeNull()
  })

  it('stands where the hand put it on the shared edge, and refuses an edge the two do not share', () => {
    const sheet = pair({ x: 9, y: 7 })
    const a = sheet.zones[0]!
    const on = doorStanding(sheet, 0, doorAt(9, 7.6, 0.9, sheet, 0)!, {
      type: 'door',
      w: 0.9,
      to: 'b',
    })
    expect('why' in on ? on.why : r2(on.standing.along ?? -1)).toBe(0.25)
    const off = doorStanding(sheet, 0, doorAt(7.5, 6, 0.9, sheet, 0)!, {
      type: 'door',
      w: 0.9,
      to: 'b',
    })
    expect('why' in off && off.why).toBe('A and B share no edge there.')
    expect(a.doors).toHaveLength(1)
  })
})

describe('a door on one of two edges the zones share', () => {
  /*
   * A is 3 × 3 at (6, 6). B is an L in a 6 × 4 frame at (6, 6): a 3 × 4 block east of A (x 9 to 12)
   * and a 2 × 1 strip under A (x 7 to 9, y 9 to 10). They share A's east edge, 3 m, and 2 m of its
   * south edge.
   */
  const east: [number, number][] = [
    [3, 0],
    [6, 0],
    [6, 4],
    [3, 4],
  ]
  const strip: [number, number][] = [
    [1, 3],
    [3, 3],
    [3, 4],
    [1, 4],
  ]
  const twoEdges = (pieces: [number, number][][], doors: Door[] = [], aY = 6) =>
    sheetOf(
      [
        zone({ x: 6, y: aY, w: 3, h: 3, doors }),
        zone({ id: 'b', name: 'B', x: 6, y: 6, w: 6, h: 4, pieces }),
      ],
      { snapDist: 0, grid: 0 },
    )

  it('stands on the shorter edge when that is the one clicked', () => {
    const sheet = twoEdges([east, strip])
    const a = sheet.zones[0]!
    const on = doorStanding(sheet, 0, doorAt(8, 9, 0.9, sheet, 0, a)!, {
      type: 'door',
      w: 0.9,
      to: 'b',
    })
    if ('why' in on) throw new Error(on.why)
    expect(on.standing).toEqual({ side: 'south', along: 0.5 })
    const placed = twoEdges([east, strip], [between({ ...on.standing })])
    expect(drawnAt(placed, 'a')).toEqual([8, 9])
  })

  it('stands on the longest edge when its own side is gone, and on its own again when it is back', () => {
    const door = between({ side: 'south', along: 0.5 })
    expect(drawnAt(twoEdges([east], [door]), 'a')).toEqual([9, 7.5])
    // A moved a metre north: its south edge leaves the strip and it shares y 6 to 8 of B's west edge.
    expect(drawnAt(twoEdges([east, strip], [door], 5), 'a')).toEqual([9, 7])
    expect(drawnAt(twoEdges([east, strip], [door]), 'a')).toEqual([8, 9])
  })

  it('stands on the longest edge when it records no side, as a door saved before sides did', () => {
    expect(drawnAt(twoEdges([east, strip], [between({ along: 0.5 })]), 'a')).toEqual([9, 7.5])
  })
})

describe('several doors on one connection', () => {
  /** A and B share the edge x = 9 from y 6 to 9. */
  const pair = (doors: Door[]) =>
    sheetOf(
      [
        zone({ x: 6, y: 6, w: 3, h: 3, doors }),
        zone({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 }),
      ],
      { snapDist: 0, grid: 0 },
    )

  it('draws both doors of a connection on the one edge', () => {
    const sheet = pair([between({ id: 'd2', along: 0.2 }), between({ id: 'd3', along: 0.8 })])
    expect(drawnDoors(sheet, 0).map((each) => each.door.id)).toEqual(['d2', 'd3'])
  })

  it('finds the door a new one would overlap on the same edge, from either zone', () => {
    const sheet = pair([between({ id: 'd2', along: 0.2 })])
    const b = sheet.zones[1]!
    // d2 is held a door's half from the north end, y 6.15 to 7.05 on x = 9, B's west edge too.
    const at = (y: number) => doorAt(9, y, 0.9, sheet, 0, b)!.pl
    expect(doorInTheWay(sheet, 0, b, at(7.2), 0.9)?.door.id).toBe('d2')
    expect(doorInTheWay(sheet, 0, b, at(8.4), 0.9)).toBeNull()
  })
})

describe('adjusting a door', () => {
  it('may be as wide as the edge it stands on leaves space for', () => {
    const out = sheetOf([zone({ doors: [door()] })])
    expect(zoneForDoor(out, 0, out.zones[0]!, door())).toBe(2.5)
    const pairOf = sheetOf([
      zone({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      zone({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 3 }),
    ])
    expect(zoneForDoor(pairOf, 0, pairOf.zones[0]!, between())).toBe(2)
  })

  it('slides along its own edge, and refuses the hand a metre off it', () => {
    const sheet = sheetOf([
      zone({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      zone({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 3 }),
    ])
    const a = sheet.zones[0]!
    const slid = doorSlid(sheet, 0, a, between(), 9, 8.2)!
    expect(slid.hit.why).toBeNull()
    expect(r2(slid.standing.along ?? -1)).toBe(0.6)
    // held a door's half from the end of the shared edge
    expect(r2(doorSlid(sheet, 0, a, between(), 9, 20)!.standing.along ?? -1)).toBe(0.78)
    expect(doorSlid(sheet, 0, a, between(), 11, 8)!.hit.why).toBe(
      'A door stays on the edge A and B share.',
    )
  })
})

describe('opening an edge', () => {
  it('takes out the whole stretch two zones share, five centimetres inside each end', () => {
    const a = zone({ x: 6, y: 6, w: 3, h: 4 })
    const b = zone({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 2 })
    const sheet = sheetOf([a, b])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    const out = doorStanding(sheet, 0, hit, { type: 'open', w: 0.6, to: 'b' })
    expect('why' in out ? out.why : [r2(out.w), out.standing.along]).toEqual([1.9, 0.5])
  })

  it('refuses an edge that meets no zone', () => {
    const a = zone({ x: 6, y: 6, w: 3, h: 4 })
    const sheet = sheetOf([a])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    expect(doorStanding(sheet, 0, hit, { type: 'open', w: 0.6, to: 'EXTERIOR' })).toEqual({
      why: 'Only an edge shared with a neighbour can be opened.',
    })
  })
})

describe('whether a leaf can open', () => {
  it('opens into its own zone, and is blocked when the swing leaves it', () => {
    const r = zone({ x: 6, y: 6, w: 3, h: 3 })
    const pl = doorAt(7.5, 6, 0.9, sheetOf([r]), 0)!.pl
    expect(doorBlocked(r, door({ at: [1.5, 0] }), pl, null)).toBe(false)
    const thin = zone({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl2 = doorAt(7.5, 6, 0.9, sheetOf([thin]), 0)!.pl
    expect(doorBlocked(thin, door({ at: [1.5, 0] }), pl2, null)).toBe(true)
  })

  it('has nothing in the way when it swings out to the open, or does not swing', () => {
    const thin = zone({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl = doorAt(7.5, 6, 0.9, sheetOf([thin]), 0)!.pl
    expect(doorBlocked(thin, door({ at: [1.5, 0], flip: true }), pl, null)).toBe(false)
    expect(doorBlocked(thin, door({ at: [1.5, 0], type: 'opening' }), pl, null)).toBe(false)
  })
})

describe('the walk test', () => {
  it('walks in by a street door and on through the door into the next zone, and no further', () => {
    const a = zone({ x: 6, y: 6, w: 3, h: 3, doors: [door({ type: 'street', at: [1.5, 0] })] })
    const b = zone({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    a.doors!.push(between({ along: 0.5 }))
    // C shares an edge with B and has no door: sharing an edge joins nothing.
    const c = zone({ id: 'c', name: 'C', x: 12, y: 6, w: 3, h: 3 })
    const walk = walkTest(sheetOf([a, b, c]), 0)!
    expect(walk.depth.get('a')).toBe(1)
    expect(walk.depth.get('b')).toBe(2)
    expect(walk.unreached.map((r) => r.name)).toEqual(['C'])
    expect([...walk.street]).toEqual(['a'])
  })

  it('is nothing at all until a door exists', () => {
    expect(walkTest(sheetOf([zone()]), 0)).toBeNull()
  })

  it('leaves a zone with no door unreached', () => {
    const a = zone({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [0, 1.5] })] })
    const b = zone({
      id: 'b',
      name: 'B',
      x: 12,
      y: 12,
      w: 3,
      h: 3,
      doors: [door({ id: 'd3', to: 'a', at: undefined, along: 0.5 })],
    })
    const walk = walkTest(sheetOf([a, b]), 0)!
    expect(walk.unreached.map((r) => r.name)).toEqual(['B'])
    expect(walk.count.get('a')).toBe(1)
  })

  it('starts from the stair upstairs', () => {
    const stair = zone({ id: 's', name: 'Stair', kind: 'stair', cat: 'circulation', storey: 0 })
    const up = zone({ id: 'u', name: 'Up', storey: 1, x: 10, y: 10 })
    const walk = walkTest(sheetOf([stair, up]), 1)!
    expect(walk.reached.map((r) => r.name)).toEqual(['Stair'])
    expect(walk.unreached.map((r) => r.name)).toEqual(['Up'])
  })
})
