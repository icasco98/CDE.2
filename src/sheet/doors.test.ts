import { describe, expect, it } from 'vitest'
import {
  doorAcross,
  doorAt,
  doorBlocked,
  doorPlace,
  openWall,
  setDoorWidth,
  slideDoor,
  walkTest,
} from './doors'
import { sheetOf, type Door, type Room } from './model'
import { r2 } from './geometry'
import { sampleSheet } from './sample'

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

const door = (over: Partial<Door> = {}): Door => ({
  id: 'd1',
  type: 'door',
  w: 0.9,
  at: [1.3, 0],
  flip: false,
  hinge: false,
  ...over,
})

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

  it('places the door on the nearest wall of its room, and loses it when the wall goes', () => {
    const r = room()
    expect(doorPlace(r, door())!.n).toEqual([0, -1])
    expect(doorPlace(r, door({ at: [1.3, 9] }))).toBeNull()
  })

  it('names the room across the wall, and nothing outside', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 3 })
    const b = room({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    const sheet = sheetOf([a, b])
    const east = doorPlace(a, door({ at: [3, 1.5] }))!
    expect(doorAcross(a, east, sheet, 0)?.name).toBe('B')
    const west = doorPlace(a, door({ at: [0, 1.5] }))!
    expect(doorAcross(a, west, sheet, 0)).toBeNull()
  })
})

describe('adjusting a door', () => {
  it('widens it only as far as the wall allows', () => {
    const r = room()
    expect(setDoorWidth(r, door(), 1.2).door!.w).toBe(1.2)
    expect(setDoorWidth(r, door(), 2.6).why).toBe('That wall is too short for a door that wide.')
  })

  it('keeps a width between 0.6 and 3 m', () => {
    const r = room({ w: 6 })
    expect(setDoorWidth(r, door(), 0.1).door!.w).toBe(0.6)
    expect(setDoorWidth(r, door(), 9).door!.w).toBe(3)
  })

  it('slides it along its wall, a jamb from the corners', () => {
    const r = room()
    const slid = slideDoor(r, door({ at: [0.45, 0] }), -1)!
    expect(r2(slid.at[0])).toBe(0.45)
    expect(r2(slideDoor(r, door(), 0.25)!.at[0])).toBe(1.55)
  })
})

describe('opening a wall', () => {
  it('takes out only the stretch two rooms share, five centimetres inside each end', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 4 })
    const b = room({ id: 'b', name: 'B', x: 9, y: 7, w: 3, h: 2 })
    const sheet = sheetOf([a, b])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    const out = openWall(hit, sheet, 0, () => 'o1')
    expect(out.why).toBeNull()
    expect(out.added.length).toBe(1)
    expect(out.added[0]!.w).toBe(1.9)
    expect(out.added[0]!.type).toBe('open')
  })

  it('refuses a wall that meets no room', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 4 })
    const sheet = sheetOf([a])
    const hit = doorAt(9, 8, 0.6, sheet, 0)!
    expect(openWall(hit, sheet, 0, () => 'o1').why).toBe(
      'That wall meets no room. Only a wall shared with a neighbour can be opened.',
    )
  })

  it('gives a wall meeting two neighbours two openings', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 8 })
    const b = room({ id: 'b', name: 'B', x: 9, y: 6, w: 3, h: 3 })
    const c = room({ id: 'c', name: 'C', x: 9, y: 10, w: 3, h: 3 })
    const sheet = sheetOf([a, b, c])
    const hit = doorAt(9, 7, 0.6, sheet, 0)!
    expect(openWall(hit, sheet, 0, () => 'o' + Math.random()).added.length).toBe(2)
  })
})

describe('whether a leaf can open', () => {
  it('opens into its own room, and is blocked when the swing leaves it', () => {
    const r = room({ x: 6, y: 6, w: 3, h: 3 })
    const pl = doorPlace(r, door({ at: [1.5, 0] }))!
    expect(doorBlocked(r, door({ at: [1.5, 0] }), pl, null)).toBe(false)
    const thin = room({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl2 = doorPlace(thin, door({ at: [1.5, 0] }))!
    expect(doorBlocked(thin, door({ at: [1.5, 0] }), pl2, null)).toBe(true)
  })

  it('has nothing in the way when it swings out to the open, or does not swing', () => {
    const thin = room({ x: 6, y: 6, w: 3, h: 0.5 })
    const pl = doorPlace(thin, door({ at: [1.5, 0] }))!
    expect(doorBlocked(thin, door({ at: [1.5, 0], flip: true }), pl, null)).toBe(false)
    expect(doorBlocked(thin, door({ at: [1.5, 0], type: 'opening' }), pl, null)).toBe(false)
  })
})

describe('the walk test', () => {
  it('reaches every room of the embedded sheet from outside', () => {
    const walk = walkTest(sampleSheet(), 0)!
    expect(walk.unreached).toEqual([])
    expect(walk.reached.length).toBe(17)
    expect(walk.depth.get('r0')).toBe(1)
    expect(walk.street.size).toBeGreaterThan(0)
  })

  it('is nothing at all until a door exists', () => {
    expect(walkTest(sheetOf([room()]), 0)).toBeNull()
  })

  it('leaves a room with no door unreached', () => {
    const a = room({ x: 6, y: 6, w: 3, h: 3, doors: [door({ at: [0, 1.5] })] })
    const b = room({ id: 'b', name: 'B', x: 12, y: 12, w: 3, h: 3 })
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
