import { describe, expect, it } from 'vitest'
import {
  GRID_M,
  area,
  boundingBox,
  outlineOf,
  rectangleToPolygon,
  sharedArea,
  sharedWalls,
  WALL_TOLERANCE,
  type Footprint,
  type Handle,
  type Point,
  type Polygon,
  type SharedWall,
} from '../../geometry'
import { createIdGenerator, createStore, type Project } from '../../model'
import {
  angleTo,
  carveRefusal,
  carveWith,
  droppedAt,
  landOver,
  moveFootprint,
  movedTo,
  moveSharedWall,
  normaliseAngle,
  resizeFootprint,
  restoredTo,
  rotateFootprint,
  sheetOf,
  snapAngle,
  wallNormal,
  type Attempt,
  type Neighbour,
  type Sheet,
  type WallShift,
} from './gestures'
import type { RoomSizes } from './defaults'

const plot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

function box(left: number, top: number, width: number, depth: number, rotation = 0): Footprint {
  return { polygon: rectangleToPolygon({ left, top, width, depth }), rotation }
}

const anySize: RoomSizes = { proportion: 1.25 }

function neighbour(
  id: string,
  footprint: Footprint,
  pinned = false,
  sizes: RoomSizes = anySize,
): Neighbour {
  return { id, name: id, footprint, pinned, sizes }
}

function alone(boundary: Polygon = []): Sheet {
  return sheetOf([], boundary)
}

function settled(attempt: { ok: boolean; value?: Footprint; reason?: string }): Footprint {
  if (!attempt.ok || !attempt.value) throw new Error(attempt.reason ?? 'refused')
  return attempt.value
}

describe('moving a room', () => {
  it('lands the moved outline on the grid', () => {
    const moved = settled(moveFootprint(box(0, 0, 4, 3), [1.13, 2.07], alone()))
    const bounds = boundingBox(outlineOf(moved))
    expect(bounds.left).toBeCloseTo(1.25, 9)
    expect(bounds.top).toBeCloseTo(2, 9)
  })

  it('brings a corner onto a neighbour`s corner within half a metre', () => {
    const sheet = sheetOf([neighbour('a', box(10, 10, 4, 3))], [])
    const moved = settled(moveFootprint(box(0, 0, 4, 3), [6.1, 10.2], sheet))
    const bounds = boundingBox(outlineOf(moved))
    expect(bounds.left).toBeCloseTo(6, 9)
    expect(bounds.top).toBeCloseTo(10, 9)
  })

  it('refuses a move that would lie over another room, and names it', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(10, 10, 4, 3))], [])
    const attempt = moveFootprint(box(0, 0, 4, 3), [10, 10], sheet)
    expect(attempt.ok).toBe(false)
    expect(attempt.ok ? '' : attempt.reason).toContain('Kitchen')
  })

  it('names the room a move was let go over rather than refusing it out of hand', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(10, 10, 4, 3))], [])
    const landing = landOver(movedTo(box(0, 0, 4, 3), [10, 10]), sheet)
    expect(landing.over.map((other) => other.id)).toEqual(['Kitchen'])
  })

  it('leaves a room let go over another where the hand put it, not flush with the wall it cuts', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(10, 10, 4, 3))], [])
    const cut = landOver(movedTo(box(0, 0, 4, 3), [9.75, 12]), sheet)
    expect(boundingBox(outlineOf(cut.footprint)).left).toBeCloseTo(9.75, 9)
    const moved = settled(moveFootprint(box(0, 0, 4, 3), [5.75, 12], sheet))
    expect(boundingBox(outlineOf(moved)).left + 4).toBeCloseTo(10, 9)
  })

  it('holds the room inside the plot where the plot binds', () => {
    const moved = settled(moveFootprint(box(0, 0, 4, 3), [30, 0], alone(plot)))
    const bounds = boundingBox(outlineOf(moved))
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(20 + 1e-6)
  })

  it('leaves a room outside a plot that does not bind', () => {
    const moved = settled(moveFootprint(box(0, 0, 4, 3), [30, 0], alone()))
    expect(boundingBox(outlineOf(moved)).left).toBeCloseTo(30, 9)
  })
})

describe('turning a room', () => {
  it('keeps the area a quarter turn takes it through', () => {
    const before = box(2, 3, 5.5, 4.5)
    const after = settled(rotateFootprint(before, 90, alone()))
    expect(after.rotation).toBe(90)
    expect(area(outlineOf(after))).toBeCloseTo(area(outlineOf(before)), 6)
    expect(Math.abs(area(outlineOf(after)) - 24.75)).toBeLessThan(1e-6)
  })

  it('reads an angle from the centre up, clockwise on the sheet', () => {
    expect(angleTo([0, 0], [0, -1])).toBe(0)
    expect(angleTo([0, 0], [1, 0])).toBe(90)
    expect(angleTo([0, 0], [0, 1])).toBe(180)
    expect(angleTo([0, 0], [-1, 0])).toBe(270)
  })

  it('snaps a free turn to fifteen degrees unless the hand asks otherwise', () => {
    expect(snapAngle(37, false)).toBe(30)
    expect(snapAngle(38, false)).toBe(45)
    expect(snapAngle(37.4, true)).toBe(37.4)
    expect(normaliseAngle(-90)).toBe(270)
    expect(normaliseAngle(360)).toBe(0)
  })

  it('refuses a turn into a neighbour', () => {
    const sheet = sheetOf([neighbour('Stair', box(6, 0, 3, 8))], [])
    expect(rotateFootprint(box(0, 0, 8, 2), 90, sheet).ok).toBe(true)
    expect(rotateFootprint(box(2, 3, 8, 2), 90, sheet).ok).toBe(false)
  })
})

describe('resizing a room', () => {
  it('holds the opposite side where it is and snaps the size to the grid', () => {
    const resized = settled(resizeFootprint(box(2, 2, 4, 3), 1, 1, [8.1, 6.1], alone()))
    const bounds = boundingBox(outlineOf(resized))
    expect(bounds.left).toBeCloseTo(2, 9)
    expect(bounds.top).toBeCloseTo(2, 9)
    expect(bounds.width).toBeCloseTo(6, 9)
    expect(bounds.depth).toBeCloseTo(4, 9)
  })

  it('changes one side only from a wall handle', () => {
    const resized = settled(resizeFootprint(box(2, 2, 4, 3), 1, 0, [9, 40], alone()))
    const bounds = boundingBox(outlineOf(resized))
    expect(bounds.width).toBeCloseTo(7, 9)
    expect(bounds.depth).toBeCloseTo(3, 9)
  })

  it('never shrinks a side below one grid step', () => {
    const resized = settled(resizeFootprint(box(2, 2, 4, 3), 1, 1, [2.05, 2.05], alone()))
    const bounds = boundingBox(outlineOf(resized))
    expect(bounds.width).toBeCloseTo(GRID_M, 9)
    expect(bounds.depth).toBeCloseTo(GRID_M, 9)
  })

  it('resizes a turned room along its own axes', () => {
    const resized = settled(resizeFootprint(box(2, 2, 4, 4, 90), 1, 0, [4, 8], alone()))
    expect(area(resized.polygon)).toBeGreaterThan(16)
  })

  it('stops a resize at the plot wall', () => {
    const resized = settled(resizeFootprint(box(14, 2, 4, 3), 1, 0, [40, 3.5], alone(plot)))
    const bounds = boundingBox(outlineOf(resized))
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(20 + 1e-3)
  })

  it('refuses a resize into a neighbour', () => {
    const sheet = sheetOf([neighbour('Bathroom', box(8, 2, 4, 3))], [])
    expect(resizeFootprint(box(2, 2, 4, 3), 1, 0, [10, 3.5], sheet).ok).toBe(false)
  })
})

describe('dropping a room', () => {
  it('centres the rectangle on the drop point and snaps it to the grid', () => {
    const dropped = landOver(droppedAt([10.1, 10.1], { width: 5.5, depth: 4.5 }), alone())
    const bounds = boundingBox(outlineOf(dropped.footprint))
    expect(bounds.left).toBeCloseTo(7.25, 9)
    expect(bounds.top).toBeCloseTo(7.75, 9)
    expect(dropped.footprint.rotation).toBe(0)
    expect(dropped.over).toEqual([])
  })

  it('names the room a drop landed over instead of refusing the drop', () => {
    const sheet = sheetOf([neighbour('Diwaniya', box(8, 8, 5, 5))], [])
    const dropped = landOver(droppedAt([10, 10], { width: 4, depth: 4 }), sheet)
    expect(dropped.over.map((other) => other.id)).toEqual(['Diwaniya'])
  })

  it('shifts a drop at the plot edge back inside', () => {
    const dropped = landOver(droppedAt([19, 3], { width: 6, depth: 4 }), alone(plot))
    const bounds = boundingBox(outlineOf(dropped.footprint))
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(20 + 1e-6)
  })
})

describe('carving with a room', () => {
  it('leaves 14 m² where a 2 by 2 bites the edge of a 4 by 4', () => {
    const sheet = sheetOf([neighbour('Bedroom', box(0, 0, 4, 4))], [])
    const carved = carveWith(box(1, -1, 2, 2), sheet)
    expect(carved.ok).toBe(true)
    const left = carved.ok ? carved.value[0] : undefined
    expect(left?.id).toBe('Bedroom')
    expect(area(left?.footprint.polygon ?? [])).toBeCloseTo(14, 9)
  })

  it('leaves a room the cutter misses alone', () => {
    const sheet = sheetOf([neighbour('Bedroom', box(0, 0, 4, 4))], [])
    const carved = carveWith(box(10, 10, 2, 2), sheet)
    expect(carved.ok && carved.value).toEqual([])
  })

  it('refuses to cut a room in two', () => {
    const sheet = sheetOf([neighbour('Bedroom', box(0, 0, 4, 4))], [])
    const carved = carveWith(box(1, -1, 2, 6), sheet)
    expect(carved.ok).toBe(false)
    expect(carved.ok ? '' : carved.reason).toContain('cut in two')
  })

  it('refuses to cut a room away altogether', () => {
    const sheet = sheetOf([neighbour('Bedroom', box(0, 0, 4, 4))], [])
    const carved = carveWith(box(-1, -1, 6, 6), sheet)
    expect(carved.ok).toBe(false)
    expect(carved.ok ? '' : carved.reason).toContain('cut away')
  })

  it('refuses to cut a pinned room', () => {
    const sheet = sheetOf([neighbour('Bedroom', box(0, 0, 4, 4), true)], [])
    const carved = carveWith(box(1, -1, 2, 2), sheet)
    expect(carved.ok).toBe(false)
    expect(carved.ok ? '' : carved.reason).toContain('pinned')
  })
})

/** xorshift32, so the same run of gestures comes back every time this test is read. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

const HANDLES: readonly (readonly [Handle, Handle])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [1, 0],
  [0, 1],
]

/** Twelve rooms on a three-by-four grid of bays, each standing clear of the next. */
function twelveRooms(): Map<string, Footprint> {
  const rooms = new Map<string, Footprint>()
  for (let i = 0; i < 12; i++) {
    rooms.set(`room-${i}`, box((i % 3) * 6 + 0.5, Math.floor(i / 3) * 6 + 0.5, 4, 4))
  }
  return rooms
}

function sheetWithout(rooms: ReadonlyMap<string, Footprint>, skip: string, plotOn: boolean): Sheet {
  const others: Neighbour[] = []
  for (const [id, footprint] of rooms) if (id !== skip) others.push(neighbour(id, footprint))
  return sheetOf(others, plotOn ? plot : [])
}

/**
 * Rooms are held apart to the 2 mm the overlap test works to, so the most an accepted gesture can
 * leave between two of them is a sliver of that width along a wall, well under a hundredth of a
 * square metre. The worst this run leaves is 0.00047 m², a tenth of a millimetre along one wall.
 */
const SLIVER_M2 = 0.01

/** Read against the polygon booleans, not the cheap test the gestures refuse by, so the invariant is the real one. */
function anyOverlap(rooms: ReadonlyMap<string, Footprint>): string | null {
  const entries = [...rooms.entries()]
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]
      if (!a || !b) continue
      let shared: number
      try {
        shared = sharedArea(a[1], b[1])
      } catch {
        return `${a[0]} and ${b[0]} cannot be resolved`
      }
      if (shared > SLIVER_M2) return `${a[0]} and ${b[0]} share ${shared} m²`
    }
  }
  return null
}

/** A pair of rooms that meet along a wall, looked for from a different room each time. */
function aSharedWall(
  rooms: ReadonlyMap<string, Footprint>,
  random: () => number,
): { a: Neighbour; b: Neighbour; wall: SharedWall } | null {
  const entries = [...rooms.entries()]
  const start = Math.floor(random() * entries.length)
  for (let i = 0; i < entries.length; i++) {
    const first = entries[(start + i) % entries.length]
    if (!first) continue
    for (const second of entries) {
      if (second[0] === first[0]) continue
      const wall = sharedWalls(outlineOf(first[1]), outlineOf(second[1]), WALL_TOLERANCE)[0]
      if (wall) {
        return { a: neighbour(first[0], first[1]), b: neighbour(second[0], second[1]), wall }
      }
    }
  }
  return null
}

describe('what a run of gestures leaves behind', () => {
  it('never leaves two footprints on one storey overlapping, over a thousand gestures', () => {
    const random = seeded(20260911)
    const rooms = twelveRooms()
    const ids = [...rooms.keys()]
    let accepted = 0
    let carves = 0
    let putBacks = 0
    let walls = 0
    for (let turn = 0; turn < 1000; turn++) {
      const id = ids[Math.floor(random() * ids.length)] ?? 'room-0'
      const from = rooms.get(id)
      if (!from) continue
      const sheet = sheetWithout(rooms, id, turn % 3 === 0)
      const pick = random()
      if (pick < 0.4) {
        const delta: Point = [(random() - 0.5) * 14, (random() - 0.5) * 14]
        const attempt = moveFootprint(from, delta, sheet)
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else if (pick < 0.6) {
        const attempt = rotateFootprint(from, random() * 360, sheet)
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else if (pick < 0.8) {
        const handle = HANDLES[Math.floor(random() * HANDLES.length)] ?? HANDLES[0]
        const at: Point = [random() * 20, random() * 25]
        const attempt = handle
          ? resizeFootprint(from, handle[0], handle[1], at, sheet)
          : { ok: false as const, reason: 'no handle' }
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else if (pick < 0.92) {
        // A room off the tray let go over its neighbours: the prompt is answered with the carve
        // where one is offered, and with Put back, which changes nothing, where it is not.
        const at: Point = [random() * 20, random() * 25]
        const landing = landOver(droppedAt(at, { width: 2, depth: 3 }), sheet)
        if (landing.over.length === 0) {
          rooms.set(id, landing.footprint)
          accepted++
        } else {
          const carved = carveWith(landing.footprint, sheet)
          if (carved.ok) {
            rooms.set(id, landing.footprint)
            for (const piece of carved.value) rooms.set(piece.id, piece.footprint)
            carves++
          } else {
            putBacks++
          }
        }
      } else {
        const pair = aSharedWall(rooms, random)
        const attempt = pair
          ? moveSharedWall(pair.a, pair.b, pair.wall, (random() - 0.5) * 6)
          : { ok: false as const, reason: 'no wall' }
        if (attempt.ok && attempt.value.distance !== 0) {
          rooms.set(attempt.value.a.id, attempt.value.a.footprint)
          rooms.set(attempt.value.b.id, attempt.value.b.footprint)
          walls++
        }
      }
      expect(anyOverlap(rooms)).toBeNull()
    }
    expect(accepted).toBeGreaterThan(250)
    expect(carves).toBeGreaterThan(0)
    expect(putBacks).toBeGreaterThan(0)
    expect(walls).toBeGreaterThan(0)
  })
})

function projectWithTwoRooms(): { store: ReturnType<typeof createStore>; a: string; b: string } {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  const a = store.actions.addRoom({ type: 'bedroom', name: 'Bedroom', targetArea: 18 })
  const b = store.actions.addRoom({ type: 'kitchen', name: 'Kitchen', targetArea: 20 })
  if (!a.ok || !b.ok) throw new Error('the rooms were refused')
  store.actions.place(a.value, box(0.5, 0.5, 4, 4))
  store.actions.place(b.value, box(6, 0.5, 4, 4))
  store.actions.connect({ a: a.value, b: b.value, kind: 'door', storey: 0 })
  store.actions.connect({ a: 'EXTERIOR', b: a.value, kind: 'main-door', storey: 0 })
  return { store, a: a.value, b: b.value }
}

function footprintOf(project: Project, id: string): Footprint {
  const found = project.rooms.find((room) => room.id === id)?.footprint
  if (!found) throw new Error(`${id} is not placed`)
  return found
}

describe('the graph under a run of gestures', () => {
  it('leaves every edge exactly as it was through move, rotate, resize and carve', () => {
    const { store, a, b } = projectWithTwoRooms()
    const before = store.getState().edges
    const sheetFor = (id: string): Sheet => {
      const project = store.getState()
      return sheetOf(
        project.rooms
          .filter((room) => room.id !== id && room.footprint !== undefined)
          .map((room) => neighbour(room.id, room.footprint as Footprint, room.pinned)),
        project.plot.polygon,
      )
    }

    const moved = moveFootprint(footprintOf(store.getState(), a), [0.4, 0.6], sheetFor(a))
    expect(moved.ok).toBe(true)
    if (moved.ok) store.actions.place(a, moved.value, 'commit')

    const turned = rotateFootprint(footprintOf(store.getState(), a), 90, sheetFor(a))
    expect(turned.ok).toBe(true)
    if (turned.ok) store.actions.place(a, turned.value, 'commit')

    const resized = resizeFootprint(footprintOf(store.getState(), b), 1, 1, [11, 5], sheetFor(b))
    expect(resized.ok).toBe(true)
    if (resized.ok) store.actions.place(b, resized.value, 'commit')

    const cutter = box(5.5, 0.5, 1, 2)
    const carved = carveWith(cutter, sheetFor(a))
    expect(carved.ok).toBe(true)
    if (carved.ok) for (const piece of carved.value) store.actions.place(piece.id, piece.footprint)

    expect(store.getState().edges).toEqual(before)
    expect(store.getState().edges).toHaveLength(2)
  })

  it('puts the footprint back on undo after a move', () => {
    const { store, a } = projectWithTwoRooms()
    const before = footprintOf(store.getState(), a)
    const sheet = sheetOf([], store.getState().plot.polygon)
    const moved = moveFootprint(before, [2, 2], sheet)
    expect(moved.ok).toBe(true)
    if (moved.ok) {
      store.actions.place(a, moved.value, 'preview')
      store.actions.place(a, moved.value, 'commit')
    }
    expect(footprintOf(store.getState(), a)).not.toEqual(before)
    expect(store.undo()).toBe(true)
    expect(footprintOf(store.getState(), a)).toEqual(before)
  })
})

function shifted(attempt: Attempt<WallShift>): WallShift {
  if (!attempt.ok) throw new Error(attempt.reason)
  return attempt.value
}

function wallBetween(a: Footprint, b: Footprint): SharedWall {
  const wall = sharedWalls(outlineOf(a), outlineOf(b), WALL_TOLERANCE)[0]
  if (!wall) throw new Error('these two rooms share no wall')
  return wall
}

describe('moving the wall two rooms share', () => {
  const left = neighbour('Kitchen', box(0, 0, 4, 4))
  const right = neighbour('Dining Room', box(4, 0, 4, 4))
  const wall = wallBetween(left.footprint, right.footprint)

  it('reads the normal from the first room across the wall into the second', () => {
    const into = wallNormal(wall, left.footprint, right.footprint)
    const back = wallNormal(wall, right.footprint, left.footprint)
    expect(into[0]).toBeCloseTo(1, 9)
    expect(into[1]).toBeCloseTo(0, 9)
    expect(back[0]).toBeCloseTo(-1, 9)
    expect(back[1]).toBeCloseTo(0, 9)
  })

  it('adds a strip to one room, takes the same strip off the other, and conserves the area', () => {
    const shift = shifted(moveSharedWall(left, right, wall, 0.5))
    expect(shift.distance).toBeCloseTo(0.5, 9)
    expect(shift.a.area).toBeCloseTo(18, 6)
    expect(shift.b.area).toBeCloseTo(14, 6)
    expect(Math.abs(shift.a.area + shift.b.area - 32)).toBeLessThan(1e-6)
    expect(boundingBox(outlineOf(shift.a.footprint)).width).toBeCloseTo(4.5, 9)
    expect(boundingBox(outlineOf(shift.b.footprint)).left).toBeCloseTo(4.5, 9)
  })

  it('takes from the first room when the wall is pushed the other way', () => {
    const shift = shifted(moveSharedWall(left, right, wall, -0.75))
    expect(shift.a.area).toBeCloseTo(13, 6)
    expect(shift.b.area).toBeCloseTo(19, 6)
    expect(Math.abs(shift.a.area + shift.b.area - 32)).toBeLessThan(1e-6)
  })

  it('travels in whole grid steps, so a wall on the grid stays on it', () => {
    expect(shifted(moveSharedWall(left, right, wall, 0.31)).distance).toBeCloseTo(0.25, 9)
    expect(shifted(moveSharedWall(left, right, wall, 0.04)).distance).toBe(0)
  })

  it('keeps both rotations and moves the wall a turned pair share', () => {
    const north: Neighbour = neighbour('Kitchen', box(0, 0, 4, 2, 90))
    const south: Neighbour = neighbour('Dining Room', box(0, 4, 4, 2, 90))
    const between = wallBetween(north.footprint, south.footprint)
    const shift = shifted(moveSharedWall(north, south, between, 0.25))
    expect(shift.a.footprint.rotation).toBe(90)
    expect(shift.b.footprint.rotation).toBe(90)
    expect(shift.a.area).toBeCloseTo(8.5, 6)
    expect(shift.b.area).toBeCloseTo(7.5, 6)
    const grown = boundingBox(outlineOf(shift.a.footprint))
    expect(grown.depth).toBeCloseTo(4.25, 9)
    expect(grown.width).toBeCloseTo(2, 9)
  })

  it('stops where the room it moves into would go under the smallest its kind admits', () => {
    const small = neighbour('Dining Room', box(4, 0, 4, 4), false, { proportion: 1, minArea: 12 })
    expect(shifted(moveSharedWall(left, small, wall, 2)).distance).toBeCloseTo(1, 9)
    const narrow = neighbour('Dining Room', box(4, 0, 4, 4), false, { proportion: 1, minWidth: 3 })
    expect(shifted(moveSharedWall(left, narrow, wall, 2)).distance).toBeCloseTo(1, 9)
  })

  it('stops before it takes the last of a room, and before it comes off the wall', () => {
    const shift = shifted(moveSharedWall(left, right, wall, 6))
    expect(shift.distance).toBeCloseTo(3.75, 9)
    expect(shift.b.area).toBeCloseTo(1, 6)
  })

  it('stops where the strip would run out past the room it is moving into', () => {
    const short = neighbour('Dining Room', box(4, 0, 4, 1))
    const between = wallBetween(left.footprint, short.footprint)
    // Their wall is one metre of the kitchen's four, and the strip may only take what is there.
    expect(shifted(moveSharedWall(left, short, between, 0.5)).distance).toBeCloseTo(0.5, 9)
    expect(shifted(moveSharedWall(left, short, between, -0.5)).distance).toBeCloseTo(-0.5, 9)
  })

  it('refuses to cut a room in two rather than stopping short', () => {
    const hall = neighbour('Hallway', box(0, -2, 4, 2))
    const bedroom = neighbour('Bedroom', {
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [2.5, 3],
        [2.5, 1],
        [1.5, 1],
        [1.5, 3],
        [0, 3],
      ],
      rotation: 0,
    })
    const between = wallBetween(hall.footprint, bedroom.footprint)
    const attempt = moveSharedWall(hall, bedroom, between, 1.5)
    expect(attempt.ok).toBe(false)
    expect(attempt.ok ? '' : attempt.reason).toContain('cut in two')
  })

  it('refuses to move a wall a pinned room stands on', () => {
    const held = neighbour('Dining Room', box(4, 0, 4, 4), true)
    const attempt = moveSharedWall(left, held, wall, 0.5)
    expect(attempt.ok).toBe(false)
    expect(attempt.ok ? '' : attempt.reason).toContain('pinned')
  })
})

describe('restoring a room to the rectangle its kind opens at', () => {
  const carved: Footprint = {
    polygon: [
      [0, 0],
      [6, 0],
      [6, 4],
      [3, 4],
      [3, 2],
      [0, 2],
    ],
    rotation: 30,
  }

  it('draws the rectangle about the centre the room stands on and keeps its turn', () => {
    const back = restoredTo(carved, { width: 5, depth: 4 })
    const bounds = boundingBox(back.polygon)
    expect(bounds.left + bounds.width / 2).toBeCloseTo(3, 9)
    expect(bounds.top + bounds.depth / 2).toBeCloseTo(2, 9)
    expect(back.rotation).toBe(30)
    expect(area(back.polygon)).toBeCloseTo(20, 9)
  })

  it('names the neighbour the rectangle would reach into rather than refusing', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(5, 0, 4, 4))], [])
    const landing = landOver(restoredTo(box(0, 0, 4, 4), { width: 7, depth: 4 }), sheet)
    expect(landing.over.map((other) => other.id)).toEqual(['Kitchen'])
    expect(carveRefusal(landing, sheet)).toBeNull()
  })

  it('says why beforehand where the rectangle would carve a neighbour it may not carve', () => {
    const small: RoomSizes = { proportion: 1, minArea: 15 }
    const sheet = sheetOf([neighbour('Guest WC', box(5, 0, 4, 4), false, small)], [])
    const landing = landOver(restoredTo(box(0, 0, 4, 4), { width: 7, depth: 4 }), sheet)
    expect(carveRefusal(landing, sheet)).toBe('Guest WC would be left under its smallest 15 m²')
  })
})

describe('putting back the outline a room had before its last carve', () => {
  const before = box(0, 0, 4, 4)
  const cutter = box(3, 3, 2, 2)
  const bitten = carveWith(cutter, sheetOf([neighbour('Bedroom', before)], []))

  it('takes a bite out of the room to begin with', () => {
    expect(bitten.ok).toBe(true)
    expect(area((bitten.ok ? bitten.value[0]?.footprint.polygon : []) ?? [])).toBeCloseTo(15, 9)
  })

  it('names the room standing in the bite while it is still there', () => {
    const sheet = sheetOf([neighbour('Guest WC', cutter)], [])
    expect(landOver(before, sheet).over.map((other) => other.id)).toEqual(['Guest WC'])
  })

  it('lands cleanly once the room that cut it has gone elsewhere', () => {
    const sheet = sheetOf([neighbour('Guest WC', box(10, 10, 2, 2))], [])
    const landing = landOver(before, sheet)
    expect(landing.over).toEqual([])
    expect(area(outlineOf(landing.footprint))).toBeCloseTo(16, 9)
    expect(carveRefusal(landing, sheet)).toBeNull()
  })

  it('says why beforehand where going back would carve the room standing in the bite', () => {
    const small: RoomSizes = { proportion: 1, minArea: 3.5 }
    const sheet = sheetOf([neighbour('Guest WC', cutter, false, small)], [])
    expect(carveRefusal(landOver(before, sheet), sheet)).toBe(
      'Guest WC would be left under its smallest 3.5 m²',
    )
  })
})

function projectWithThreeRooms(): {
  store: ReturnType<typeof createStore>
  a: string
  b: string
  c: string
} {
  const store = createStore(undefined, { newId: createIdGenerator(11) })
  const a = store.actions.addRoom({ type: 'bedroom', name: 'Bedroom', targetArea: 16 })
  const b = store.actions.addRoom({ type: 'kitchen', name: 'Kitchen', targetArea: 16 })
  const c = store.actions.addRoom({ type: 'guest-wc', name: 'Guest WC', targetArea: 4 })
  if (!a.ok || !b.ok || !c.ok) throw new Error('the rooms were refused')
  store.actions.place(a.value, box(0.5, 0.5, 4, 4))
  store.actions.place(b.value, box(4.5, 0.5, 4, 4))
  return { store, a: a.value, b: b.value, c: c.value }
}

describe('a room let go over its neighbours', () => {
  it('carves both rooms it landed over, in one step to undo', () => {
    const { store, a, b, c } = projectWithThreeRooms()
    const sheet = sheetOf(
      [
        neighbour('Bedroom', footprintOf(store.getState(), a)),
        neighbour('Kitchen', footprintOf(store.getState(), b)),
      ].map((other, index) => ({ ...other, id: index === 0 ? a : b })),
      [],
    )
    const landing = landOver(droppedAt([4.5, 2.5], { width: 2, depth: 2 }), sheet)
    expect(landing.over).toHaveLength(2)
    const carved = carveWith(landing.footprint, sheet)
    expect(carved.ok).toBe(true)
    if (!carved.ok) return
    store.transaction(() => {
      store.actions.place(c, landing.footprint)
      for (const piece of carved.value) store.actions.place(piece.id, piece.footprint)
    })
    expect(area(outlineOf(footprintOf(store.getState(), a)))).toBeCloseTo(14, 6)
    expect(area(outlineOf(footprintOf(store.getState(), b)))).toBeCloseTo(14, 6)
    expect(store.undo()).toBe(true)
    expect(area(outlineOf(footprintOf(store.getState(), a)))).toBeCloseTo(16, 6)
    expect(area(outlineOf(footprintOf(store.getState(), b)))).toBeCloseTo(16, 6)
    expect(store.getState().rooms.find((room) => room.id === c)?.footprint).toBeUndefined()
  })

  it('writes nothing down until the drop is answered, and Put back leaves it where it began', () => {
    const { store, a, b } = projectWithThreeRooms()
    const began = footprintOf(store.getState(), a)
    const sheet = sheetOf([neighbour(b, footprintOf(store.getState(), b))], [])
    const slid = moveFootprint(began, [0, 1], sheet)
    expect(slid.ok).toBe(true)
    if (slid.ok) store.actions.place(a, slid.value, 'preview')
    const landing = landOver(movedTo(began, [3, 0]), sheet)
    expect(landing.over.map((other) => other.id)).toEqual([b])
    store.actions.place(a, began, 'preview')
    expect(footprintOf(store.getState(), a)).toEqual(began)
    // No step was recorded for the drag: one undo reaches past it to the last thing committed,
    // which is the kitchen being placed.
    expect(store.undo()).toBe(true)
    expect(footprintOf(store.getState(), a)).toEqual(began)
    expect(store.getState().rooms.find((room) => room.id === b)?.footprint).toBeUndefined()
  })
})
