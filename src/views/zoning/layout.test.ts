import { describe, expect, it } from 'vitest'
import { buildableOf, createState, settle } from '../../bubbles'
import {
  area,
  boundingBox,
  footprintsOverlap,
  GRID_M,
  outlineOf,
  rectangleToPolygon,
  type Footprint,
  type Point,
  type Polygon,
} from '../../geometry'
import {
  createIdGenerator,
  createStore,
  EXTERIOR,
  occupiedStoreys,
  type Project,
  type Room,
} from '../../model'
import {
  buildableArea,
  defaultProgram,
  impliedConnections,
  roomTypeById,
  roomTypes,
} from '../../rulebook'
import { offTarget, proportionOf, sizesOf, startingRectangle, type RoomSizes } from './defaults'
import { layOut } from './layout'

function sizeTable(plotAreaM2: number): ReadonlyMap<string, RoomSizes> {
  return new Map(roomTypes.map((type) => [type.id, sizesOf(type, plotAreaM2)]))
}

type Household = Project['household']

/**
 * A project as the person reaches the Zoning tab with it: the program rebuilt from the household,
 * the rulebook's default connections as edges, and the bubbles settled on the plot, which is where
 * a plan is read from.
 */
function diagram(
  storeys = 2,
  polygon: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 }),
  household: Partial<Household> = {},
): Project {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  store.actions.setPlot({ ...store.getState().plot, on: true, polygon })
  store.actions.setHousehold({ ...store.getState().household, ...household })
  const opened = store.getState()
  for (const room of defaultProgram(area(opened.plot.polygon), opened.household, storeys))
    store.actions.addRoom(room)
  for (const link of impliedConnections(store.getState().rooms, store.getState().edges))
    store.actions.connect({ a: link.a, b: link.b, kind: link.kind, storey: link.storey })
  const project = store.getState()
  const state = createState(
    project.rooms.map((room) => ({ ...room, tier: roomTypeById(room.type)?.tier })),
    project.edges.filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR),
    buildableOf(buildableArea(project.plot)),
  )
  for (const body of settle(state).state.bodies)
    store.actions.setBubble(body.id, { x: body.x, y: body.y })
  return store.getState()
}

/** The rooms as they stand once a set of placements has been taken. */
function taken(
  rooms: readonly Room[],
  placements: readonly { id: string; footprint: Footprint }[],
) {
  const at = new Map(placements.map((placement) => [placement.id, placement.footprint]))
  return rooms.map((room) => {
    const footprint = at.get(room.id)
    return footprint ? { ...room, footprint } : room
  })
}

function placedOn(rooms: readonly Room[], storey: number) {
  return rooms.filter(
    (room): room is Room & { footprint: Footprint } =>
      occupiedStoreys(room).includes(storey) && room.footprint !== undefined,
  )
}

function overlappingPairs(rooms: readonly (Room & { footprint: Footprint })[]): string[] {
  const found: string[] = []
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      if (a && b && footprintsOverlap(a.footprint, b.footprint)) found.push(`${a.name}/${b.name}`)
    }
  return found
}

function centreOf(footprint: Footprint): Point {
  const bounds = boundingBox(outlineOf(footprint))
  return [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}

/** How far apart the pairs the diagram joins are on the plan, and how far apart the rest are. */
function spans(project: Project, rooms: readonly (Room & { footprint: Footprint })[]) {
  const linked: number[] = []
  const apart: number[] = []
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]
      const b = rooms[j]
      if (!a || !b) continue
      const [ax, ay] = centreOf(a.footprint)
      const [bx, by] = centreOf(b.footprint)
      const joined = project.edges.some(
        (edge) => (edge.a === a.id && edge.b === b.id) || (edge.a === b.id && edge.b === a.id),
      )
      ;(joined ? linked : apart).push(Math.hypot(ax - bx, ay - by))
    }
  return { linked: mean(linked), apart: mean(apart) }
}

function laid(project: Project, storey: number) {
  return layOut(
    project.rooms,
    project.edges,
    project.plot,
    storey,
    sizeTable(area(project.plot.polygon)),
    GRID_M,
  )
}

describe('a plan laid out from the bubbles', () => {
  it('gives the same placements for the same diagram twice over', () => {
    const project = diagram(2)
    const first = laid(project, 0)
    const second = laid(project, 0)
    expect(first.ok).toBe(true)
    expect(second).toEqual(first)
  })

  it('leaves no two footprints on the ground floor over one another', () => {
    const project = diagram(2)
    const out = laid(project, 0)
    if (!out.ok) throw new Error(out.reason)
    expect(out.value).toHaveLength(12)
    expect(overlappingPairs(placedOn(taken(project.rooms, out.value), 0))).toEqual([])
  })

  it('holds every room it places inside a plot that binds', () => {
    const project = diagram(2)
    const out = laid(project, 0)
    if (!out.ok) throw new Error(out.reason)
    const plot = boundingBox(project.plot.polygon)
    for (const placement of out.value) {
      const bounds = boundingBox(outlineOf(placement.footprint))
      expect(bounds.left).toBeGreaterThanOrEqual(plot.left - 1e-6)
      expect(bounds.top).toBeGreaterThanOrEqual(plot.top - 1e-6)
      expect(bounds.left + bounds.width).toBeLessThanOrEqual(plot.left + plot.width + 1e-6)
      expect(bounds.top + bounds.depth).toBeLessThanOrEqual(plot.top + plot.depth + 1e-6)
    }
  })

  it('never moves a room already placed or one the person holds', () => {
    const project = diagram(2)
    const ground = project.rooms.filter((room) => room.storey === 0)
    const standing = ground[0]
    const held = ground[1]
    if (!standing || !held) throw new Error('the program is not the one this test reads')
    const footprint: Footprint = {
      polygon: rectangleToPolygon({ left: 0, top: 21, width: 5, depth: 4 }),
      rotation: 0,
    }
    const heldFootprint: Footprint = {
      polygon: rectangleToPolygon({ left: 15, top: 0, width: 5, depth: 4 }),
      rotation: 0,
    }
    const rooms = project.rooms.map((room) =>
      room.id === standing.id
        ? { ...room, footprint }
        : room.id === held.id
          ? { ...room, footprint: heldFootprint, pinned: true }
          : room,
    )
    const out = layOut(
      rooms,
      project.edges,
      project.plot,
      0,
      sizeTable(area(project.plot.polygon)),
      GRID_M,
    )
    if (!out.ok) throw new Error(out.reason)
    expect(out.value.map((placement) => placement.id)).not.toContain(standing.id)
    expect(out.value.map((placement) => placement.id)).not.toContain(held.id)
    const after = taken(rooms, out.value)
    expect(after.find((room) => room.id === standing.id)?.footprint).toEqual(footprint)
    expect(after.find((room) => room.id === held.id)?.footprint).toEqual(heldFootprint)
    expect(overlappingPairs(placedOn(after, 0))).toEqual([])
  })

  it('refuses a plot too small to hold the storey, and names the rooms left over one another', () => {
    const project = diagram(2, rectangleToPolygon({ left: 0, top: 0, width: 8, depth: 8 }))
    const out = laid(project, 0)
    if (out.ok) throw new Error('an eight-metre square held a whole ground floor')
    expect(out.reason).toMatch(/^Not enough room on Ground for /)
    expect(out.reason).toMatch(/enlarge the plot or unplace something$/)
    expect(out.reason).toContain('Kitchen')
    expect(project.rooms.every((room) => room.footprint === undefined)).toBe(true)
  })

  it('places a stair spanning two storeys once and stands it on both', () => {
    const project = diagram(2)
    const stair = project.rooms.find((room) => room.type === 'stair')
    if (!stair) throw new Error('the two-storey program laid no stair')
    expect(occupiedStoreys(stair)).toEqual([0, 1])

    const ground = laid(project, 0)
    if (!ground.ok) throw new Error(ground.reason)
    expect(ground.value.map((placement) => placement.id)).toContain(stair.id)
    const afterGround = taken(project.rooms, ground.value)

    const upstairs = layOut(
      afterGround,
      project.edges,
      project.plot,
      1,
      sizeTable(area(project.plot.polygon)),
      GRID_M,
    )
    if (!upstairs.ok) throw new Error(upstairs.reason)
    expect(upstairs.value.map((placement) => placement.id)).not.toContain(stair.id)
    const after = taken(afterGround, upstairs.value)
    const laidStair = after.find((room) => room.id === stair.id)
    expect(laidStair?.footprint).toEqual(
      ground.value.find((placement) => placement.id === stair.id)?.footprint,
    )
    expect(placedOn(after, 0).map((room) => room.id)).toContain(stair.id)
    expect(placedOn(after, 1).map((room) => room.id)).toContain(stair.id)
    expect(overlappingPairs(placedOn(after, 1))).toEqual([])
  })
})

describe('the reference case: the two-storey default program on the 20 × 25 plot', () => {
  it('lays the ground floor out with no overlap, every room at its target size, linked rooms 8.97 m apart on average against 11.33 m for unlinked', () => {
    const project = diagram(2)
    const out = laid(project, 0)
    if (!out.ok) throw new Error(out.reason)
    const rooms = placedOn(taken(project.rooms, out.value), 0)
    expect(rooms).toHaveLength(12)
    expect(overlappingPairs(rooms)).toEqual([])

    for (const room of rooms) {
      const bounds = boundingBox(outlineOf(room.footprint))
      const wanted = startingRectangle(room.targetArea, proportionOf(roomTypeById(room.type)))
      expect(bounds.width).toBeCloseTo(wanted.width, 9)
      expect(bounds.depth).toBeCloseTo(wanted.depth, 9)
      expect(offTarget(area(outlineOf(room.footprint)), room.targetArea)).toBe(false)
    }

    const { linked, apart } = spans(project, rooms)
    expect(linked).toBeCloseTo(8.97, 1)
    expect(apart).toBeCloseTo(11.33, 1)
    expect(linked).toBeLessThan(apart)
  })
})

describe('the cost of one press of the button', () => {
  it('lays twenty rooms out on one storey in under 20 ms', () => {
    const project = diagram(1, rectangleToPolygon({ left: 0, top: 0, width: 30, depth: 30 }), {
      maid: true,
      driver: true,
      womensReception: true,
    })
    const rooms = project.rooms.slice(0, 20)
    expect(rooms.filter((room) => room.footprint === undefined)).toHaveLength(20)
    const sizes = sizeTable(area(project.plot.polygon))
    const run = () => layOut(rooms, project.edges, project.plot, 0, sizes, GRID_M)
    expect(run().ok).toBe(true)
    // The best of ten after a warm-up, so neither compilation nor a stray collection is charged to it.
    for (let i = 0; i < 5; i++) run()
    let best = Infinity
    for (let i = 0; i < 10; i++) {
      const started = performance.now()
      run()
      best = Math.min(best, performance.now() - started)
    }
    expect(best).toBeLessThan(20)
  })
})
