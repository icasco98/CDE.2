import { describe, expect, it } from 'vitest'
import {
  alongAt,
  doorAcross,
  doorAt,
  doorBlocked,
  doorSlid,
  doorSpot,
  doorStanding,
  drawnDoors,
  roomForDoor,
  walkTest,
} from './doors'
import { sheetOf, type Door, type Room, type Sheet } from './model'
import { r2, toWorld } from './geometry'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
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

/** A door out of the room through its north wall, at its middle. */
const door = (over: Partial<Door> = {}): Door => ({
  id: 'd1',
  edge: 'e1',
  to: 'EXTERIOR',
  type: 'door',
  w: 0.9,
  at: [1.3, 0],
  flip: false,
  hinge: false,
  ...over,
})

/** A door from A into B, halfway along the wall the two share. */
const between = (over: Partial<Door> = {}): Door => ({
  id: 'd2',
  edge: 'e2',
  to: 'b',
  type: 'door',
  w: 0.9,
  along: 0.5,
  flip: false,
  hinge: false,
  ...over,
})

/** Where a door of room `id` is drawn, in plot metres, or null when it is not drawn. */
const drawnAt = (sheet: Sheet, id: string): [number, number] | null => {
  const r = sheet.rooms.find((o) => o.id === id)!
  const pl = doorSpot(sheet, 0, r, r.doors![0]!)
  return pl ? (toWorld(r, pl.p[0], pl.p[1]).map(r2) as [number, number]) : null
}

describe('where a door sits', () => {
  /** The jamb is 0.15 m by default: the leaf's near edge lands there, so its middle is at 0.6. */
  it('a 0.9 m door on a 2.6 m wall clicked 0.4 from the corner sits 0.15 m from it', () => {
    const sheet = sheetOf([room()])
    const hit = doorAt(6.4, 6, 0.9, sheet, 0)!
    expect(hit.why).toBeNull()
    expect(hit.pl.snapped).toBe('jamb')
    expect(r2(hit.pl.t)).toBe(0.6)
    expect(r2(hit.pl.t - 0.45)).toBe(0.15)
  })

  /**
   * A wall must hold the leaf and 10 cm more, so 1 m is the very limit for a 0.9 m door and a wall
   * any shorter is refused. The parent brief calls a wall of exactly 1 m refused; the mock's own
   * test is `L >= w + 0.1`, which 1 m passes, so the refusal starts just under it.
   */
  it('a 0.9 m door on a 0.95 m wall is refused: “That wall is too short for this door.”', () => {
    const sheet = sheetOf([room({ w: 0.95, h: 3 })])
    const hit = doorAt(6.475, 6, 0.9, sheet, 0)!
    expect(hit.why).toBe('That wall is too short for this door.')
    expect(doorAt(6.5, 6, 0.9, sheetOf([room({ w: 1, h: 3 })]), 0)!.why).toBeNull()
  })

  it('takes no door on a wall that stands on the plot boundary', () => {
    const sheet = sheetOf([room({ x: 0, y: 6, w: 3, h: 3 })])
    expect(doorAt(0, 7.5, 0.9, sheet, 0)!.why).toBe('A wall on the boundary takes no door.')
  })

  it('snaps to the middle of the wall when that is nearer', () => {
    const sheet = sheetOf([room({ w: 4, h: 3 })])
    expect(doorAt(8, 6, 0.9, sheet, 0)!.pl.snapped).toBe('middle')
  })

  it('finds nothing where there is no wall', () => {
    expect(doorAt(1, 1, 0.9, sheetOf([room()]), 0)).toBeNull()
  })

  it('names the room across the wall, and nothing outside', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 3 })
    const b = room({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    const sheet = sheetOf([a, b])
    expect(doorAcross(a, doorAt(9, 7.5, 0.9, sheet, 0)!.pl, sheet, 0)?.name).toBe('B')
    expect(doorAcross(a, doorAt(6, 7.5, 0.9, sheet, 0)!.pl, sheet, 0)).toBeNull()
  })
})

describe('a door is the drawing of its edge', () => {
  /*
   * A is 3 × 3 at (6, 6) and B 3 × 3 at (9, 7): they share the wall x = 9 from y 7 to 9, 2 m, so a
   * door halfway along it stands at (9, 8).
   */
  const pair = (bAt: { x: number; y: number }) =>
    sheetOf([
      room({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      room({ id: 'b', name: 'B', ...bAt, w: 3, h: 3 }),
    ])

  it('stands halfway along the wall the two rooms share', () => {
    expect(drawnAt(pair({ x: 9, y: 7 }), 'a')).toEqual([9, 8])
  })

  it('is not drawn when the rooms move apart, and comes back where it was when they meet', () => {
    expect(drawnAt(pair({ x: 12, y: 7 }), 'a')).toBeNull()
    expect(drawnDoors(pair({ x: 12, y: 7 }), 0)).toEqual([])
    expect(drawnAt(pair({ x: 9, y: 7 }), 'a')).toEqual([9, 8])
  })

  it('follows the wall when the rooms meet on another side', () => {
    // B under A: they share the wall y = 9 from x 7 to 9, so halfway is (8, 9).
    expect(drawnAt(pair({ x: 7, y: 9 }), 'a')).toEqual([8, 9])
  })

  it('is not drawn where the shared wall is shorter than the door', () => {
    expect(drawnAt(pair({ x: 9, y: 8.5 }), 'a')).toBeNull()
  })

  it('counts along the wall from its western, then northern, end, whichever room holds it', () => {
    const sheet = pair({ x: 9, y: 7 })
    const a = sheet.rooms[0]!
    a.doors = [between({ along: 0.25 })]
    // The 2 m from y 7 to 9, a quarter of the way from the north end, held a door's half from it.
    expect(drawnAt(sheet, 'a')).toEqual([9, 7.5])
    expect(alongAt(a, sheet.rooms[1]!, [3, 1.5])).toBe(0.25)
  })

  it('draws a door to the outside on its own wall while that wall faces outside', () => {
    const out = sheetOf([room({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [1.5, 0] })] })])
    expect(drawnAt(out, 'a')).toEqual([7.5, 6])
    const covered = sheetOf([
      room({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [1.5, 0] })] }),
      room({ id: 'b', name: 'B', x: 6, y: 3, w: 3, h: 3 }),
    ])
    expect(drawnAt(covered, 'a')).toBeNull()
  })

  it('stands where the hand put it on the shared wall, and refuses a wall the two do not share', () => {
    const sheet = pair({ x: 9, y: 7 })
    const a = sheet.rooms[0]!
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
    expect('why' in off && off.why).toBe('A and B share no wall there.')
    expect(a.doors).toHaveLength(1)
  })
})

describe('adjusting a door', () => {
  it('may be as wide as the wall it stands on leaves room for', () => {
    const out = sheetOf([room({ doors: [door()] })])
    expect(roomForDoor(out, 0, out.rooms[0]!, door())).toBe(2.5)
    const pairOf = sheetOf([
      room({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      room({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 3 }),
    ])
    expect(roomForDoor(pairOf, 0, pairOf.rooms[0]!, between())).toBe(2)
  })

  it('slides along its own wall, and refuses the hand a metre off it', () => {
    const sheet = sheetOf([
      room({ x: 6, y: 6, w: 3, h: 3, doors: [between()] }),
      room({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 3 }),
    ])
    const a = sheet.rooms[0]!
    const slid = doorSlid(sheet, 0, a, between(), 9, 8.2)!
    expect(slid.hit.why).toBeNull()
    expect(r2(slid.standing.along ?? -1)).toBe(0.6)
    // held a door's half from the end of the shared wall
    expect(r2(doorSlid(sheet, 0, a, between(), 9, 20)!.standing.along ?? -1)).toBe(0.78)
    expect(doorSlid(sheet, 0, a, between(), 11, 8)!.hit.why).toBe(
      'A door stays on the wall A and B share.',
    )
  })
})

describe('opening a wall', () => {
  it('takes out the whole stretch two rooms share, five centimetres inside each end', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 4 })
    const b = room({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 2 })
    const sheet = sheetOf([a, b])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    const out = doorStanding(sheet, 0, hit, { type: 'open', w: 0.6, to: 'b' })
    expect('why' in out ? out.why : [r2(out.w), out.standing.along]).toEqual([1.9, 0.5])
  })

  it('refuses a wall that meets no room', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 4 })
    const sheet = sheetOf([a])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    expect(doorStanding(sheet, 0, hit, { type: 'open', w: 0.6, to: 'EXTERIOR' })).toEqual({
      why: 'Only a wall shared with a neighbour can be opened.',
    })
  })
})

describe('whether a leaf can open', () => {
  it('opens into its own room, and is blocked when the swing leaves it', () => {
    const r = room({ x: 6, y: 6, w: 3, h: 3 })
    const pl = doorAt(7.5, 6, 0.9, sheetOf([r]), 0)!.pl
    expect(doorBlocked(r, door({ at: [1.5, 0] }), pl, null)).toBe(false)
    const thin = room({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl2 = doorAt(7.5, 6, 0.9, sheetOf([thin]), 0)!.pl
    expect(doorBlocked(thin, door({ at: [1.5, 0] }), pl2, null)).toBe(true)
  })

  it('has nothing in the way when it swings out to the open, or does not swing', () => {
    const thin = room({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl = doorAt(7.5, 6, 0.9, sheetOf([thin]), 0)!.pl
    expect(doorBlocked(thin, door({ at: [1.5, 0], flip: true }), pl, null)).toBe(false)
    expect(doorBlocked(thin, door({ at: [1.5, 0], type: 'opening' }), pl, null)).toBe(false)
  })
})

describe('the walk test', () => {
  it('walks in by a street door and on through the door into the next room, and no further', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 3, doors: [door({ type: 'street', at: [1.5, 0] })] })
    const b = room({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    a.doors!.push(between({ along: 0.5 }))
    // C shares a wall with B and has no door: sharing a wall joins nothing.
    const c = room({ id: 'c', name: 'C', x: 12, y: 6, w: 3, h: 3 })
    const walk = walkTest(sheetOf([a, b, c]), 0)!
    expect(walk.depth.get('a')).toBe(1)
    expect(walk.depth.get('b')).toBe(2)
    expect(walk.unreached.map((r) => r.name)).toEqual(['C'])
    expect([...walk.street]).toEqual(['a'])
  })

  it('is nothing at all until a door exists', () => {
    expect(walkTest(sheetOf([room()]), 0)).toBeNull()
  })

  it('leaves a room with no door unreached', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [0, 1.5] })] })
    const b = room({
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
    const stair = room({ id: 's', name: 'Stair', kind: 'stair', cat: 'circulation', storey: 0 })
    const up = room({ id: 'u', name: 'Up', storey: 1, x: 10, y: 10 })
    const walk = walkTest(sheetOf([stair, up]), 1)!
    expect(walk.reached.map((r) => r.name)).toEqual(['Stair'])
    expect(walk.unreached.map((r) => r.name)).toEqual(['Up'])
  })
})
