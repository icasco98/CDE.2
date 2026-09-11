import { describe, expect, it } from 'vitest'
import {
  GRID_M,
  area,
  boundingBox,
  outlineOf,
  rectangleToPolygon,
  sharedArea,
  type Footprint,
  type Handle,
  type Point,
  type Polygon,
} from '../../geometry'
import { createIdGenerator, createStore, type Project } from '../../model'
import {
  angleTo,
  carveWith,
  dropFootprint,
  moveFootprint,
  normaliseAngle,
  resizeFootprint,
  rotateFootprint,
  sheetOf,
  snapAngle,
  type Neighbour,
  type Sheet,
} from './gestures'

const plot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

function box(left: number, top: number, width: number, depth: number, rotation = 0): Footprint {
  return { polygon: rectangleToPolygon({ left, top, width, depth }), rotation }
}

function neighbour(id: string, footprint: Footprint, pinned = false): Neighbour {
  return { id, name: id, footprint, pinned }
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

  it('lets a cutter through the same overlap', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(10, 10, 4, 3))], [])
    expect(moveFootprint(box(0, 0, 4, 3), [10, 10], sheet, true).ok).toBe(true)
  })

  it('leaves a cutter where the hand put it rather than flush with the wall it is to cut', () => {
    const sheet = sheetOf([neighbour('Kitchen', box(10, 10, 4, 3))], [])
    const cut = settled(moveFootprint(box(0, 0, 4, 3), [9.75, 12], sheet, true))
    expect(boundingBox(outlineOf(cut)).left).toBeCloseTo(9.75, 9)
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
    const dropped = settled(dropFootprint([10.1, 10.1], { width: 5.5, depth: 4.5 }, alone()))
    const bounds = boundingBox(outlineOf(dropped))
    expect(bounds.left).toBeCloseTo(7.25, 9)
    expect(bounds.top).toBeCloseTo(7.75, 9)
    expect(dropped.rotation).toBe(0)
  })

  it('refuses a drop on top of a room already there', () => {
    const sheet = sheetOf([neighbour('Diwaniya', box(8, 8, 5, 5))], [])
    expect(dropFootprint([10, 10], { width: 4, depth: 4 }, sheet).ok).toBe(false)
  })

  it('shifts a drop at the plot edge back inside', () => {
    const dropped = settled(dropFootprint([19, 3], { width: 6, depth: 4 }, alone(plot)))
    const bounds = boundingBox(outlineOf(dropped))
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

describe('what a run of gestures leaves behind', () => {
  it('never leaves two footprints on one storey overlapping, over a thousand gestures', () => {
    const random = seeded(20260911)
    const rooms = twelveRooms()
    const ids = [...rooms.keys()]
    let accepted = 0
    let carves = 0
    for (let turn = 0; turn < 1000; turn++) {
      const id = ids[Math.floor(random() * ids.length)] ?? 'room-0'
      const from = rooms.get(id)
      if (!from) continue
      const sheet = sheetWithout(rooms, id, turn % 3 === 0)
      const pick = random()
      if (pick < 0.45) {
        const delta: Point = [(random() - 0.5) * 14, (random() - 0.5) * 14]
        const attempt = moveFootprint(from, delta, sheet)
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else if (pick < 0.65) {
        const attempt = rotateFootprint(from, random() * 360, sheet)
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else if (pick < 0.9) {
        const handle = HANDLES[Math.floor(random() * HANDLES.length)] ?? HANDLES[0]
        const at: Point = [random() * 20, random() * 25]
        const attempt = handle
          ? resizeFootprint(from, handle[0], handle[1], at, sheet)
          : { ok: false as const, reason: 'no handle' }
        if (attempt.ok) {
          rooms.set(id, attempt.value)
          accepted++
        }
      } else {
        // The carve of the brief: a room dropped with Alt held is the cutter, and a room coming
        // off the tray is a rectangle.
        const at: Point = [random() * 20, random() * 25]
        const cutter = dropFootprint(at, { width: 2, depth: 3 }, sheet, true)
        const carved = cutter.ok ? carveWith(cutter.value, sheet) : null
        if (cutter.ok && carved?.ok) {
          rooms.set(id, cutter.value)
          for (const piece of carved.value) rooms.set(piece.id, piece.footprint)
          if (carved.value.length > 0) carves++
        }
      }
      expect(anyOverlap(rooms)).toBeNull()
    }
    expect(accepted).toBeGreaterThan(300)
    expect(carves).toBeGreaterThan(0)
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
