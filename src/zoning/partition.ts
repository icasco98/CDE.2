import { area, type Point, type Polygon } from '../geometry'
import { cellAt, cellCentre, gridOver, INSIDE, OFF, PAST, type Grid } from './grid'
import { doorOn, reachedFrom, runNeeded, sharedRuns, whyOpen } from './links'
import { divide, settleAreas } from './reach'
import { claimDrives, inContact, layContact, layCorridor, layKerb, relaxRun } from './seeds'
import { squareCorridor, straighten } from './straighten'
import { tidy } from './tidy'
import { cellsOf, fillHoles, joinSeeds, keepOnePiece, outlineOfCells, zoneOfCells } from './zones'
import {
  NOBODY,
  type Division,
  type Door,
  type Partition,
  type PartitionInput,
  type PartitionRoom,
  type Tension,
  type Zone,
} from './types'

/*
 * Decision 19, half one. The buildable area is divided among the bubbles, so that there are no
 * gaps and no overlaps by construction and every contact the bubbles made becomes a shared wall.
 * The zones may be stepped on the 0.25 m grid; straightening them into running walls is half two.
 */

/** The floor a room must have before the tidying will take a cell from it, in m². */
const LITTLE_M2 = 8

/** The kind whose bays keep a straight run to the street. */
const BAY = 'garage'

/** A corridor is the one room laid as a run rather than grown from a reach. */
function isCorridor(room: PartitionRoom): boolean {
  return room.half > 0
}

/**
 * The floor divided. The rooms come in whatever order the caller gives them and are answered in
 * that order throughout, so the same bubbles give the same zones, cell for cell.
 */
export function partitionOf(input: PartitionInput): Partition {
  const at0 = new Map(input.rooms.map((room, index) => [room.id, index]))
  const entry0 = input.rooms[at0.get(input.arrivals[0] ?? '') ?? -1]
  const rooms = input.rooms.map((room) =>
    isCorridor(room) ? squareCorridor(room, entry0?.at, input.street) : room,
  )
  const grid = gridOver(input.plot, input.buildable)
  const division = openDivision(grid, rooms, input.buildable)
  const at = new Map(rooms.map((room, index) => [room.id, index]))
  const entry = rooms[at.get(input.arrivals[0] ?? '') ?? -1]

  for (const [index, room] of rooms.entries())
    if (isCorridor(room)) layCorridor(division, room, index, entry?.at)
  claimDrives(division, rooms, input.street, (room) => room.type === BAY)
  for (const [index, room] of rooms.entries()) layKerb(division, room, index)
  const seeded = seedContacts(division, rooms, input, at)

  const sites = rooms.flatMap((room, index) => (isCorridor(room) ? [] : [index]))
  divide(division, rooms, sites)
  /** One zone each, no holes in any of them, and every room on its target to within a cell. */
  const whole = (): void => {
    keepOnePiece(division, rooms.length)
    fillHoles(division, rooms.length)
    settleAreas(division, rooms, LITTLE_M2)
  }
  // Tidy first and settle the areas last: the tidying moves whole runs of cells to make the zones
  // read as shapes, and the settling then hands single cells back along those same boundaries.
  joinSeeds(division, rooms.length)
  tidy(division, LITTLE_M2)
  whole()
  // The corridor's run is a wall while the reaches divide the floor round it; once they have, it
  // is an ordinary zone again, so the cells the hole-filling left it over its target can go.
  relaxRun(division)
  whole()
  straighten(division, rooms, seeded, rooms.findIndex(isCorridor))

  const zones: Zone[] = []
  for (const [index, room] of rooms.entries()) {
    const cells = cellsOf(division, index)
    if (cells.length === 0) continue
    const polygon = zoneOfCells(grid, cells)
    if (polygon.length < 3) continue
    zones.push({ id: room.id, polygon, areaM2: cells.length * grid.cellArea })
  }

  const doors: Door[] = []
  const tensions: Tension[] = []
  for (const link of input.links) {
    const a = at.get(link.a)
    const b = at.get(link.b)
    if (a === undefined || b === undefined) continue
    const runs = sharedRuns(division, a, b)
    const longest = runs[0]
    const needed = runNeeded(rooms[a], rooms[b])
    if (longest && longest.length >= needed - 1e-9) {
      doors.push(doorOn(link, longest))
      continue
    }
    tensions.push({
      linkId: link.id,
      a: link.a,
      b: link.b,
      sentence: whyOpen(division, rooms, a, b, longest?.length ?? 0),
    })
  }

  const reached = reachedFrom(input.links, doors, input.arrivals)
  const unreached = rooms.filter((room) => !reached.has(room.id)).map((room) => room.id)

  const past: number[] = []
  for (let index = 0; index < division.owner.length; index++)
    if (division.owner[index] !== NOBODY && grid.place[index] === PAST) past.push(index)

  return {
    zones,
    doors,
    tensions,
    unreached,
    overflowM2: past.length * grid.cellArea,
    spill: outlineOfCells(grid, past).filter((ring) => ring.length >= 3),
    blockedBays: blockedRuns(division, rooms, input),
  }
}

/** How wide a run to the street has to be, in metres: the 3 m of a bay in the room-type table. */
const RUN_M = 3

/**
 * The bays with no straight run to the street. A car needs one clear run of a bay's own width from
 * the bay's floor to the street line, not the whole of its floor clear: the ground in that run is
 * the garage's or nobody's, and a bay standing in tandem has its run through the bay in front of
 * it, which is the same driveway, so another garage bay in the way is not in the way at all. It is
 * read off the zones rather than off the claims, because it is the plan that has to hold.
 */
function blockedRuns(
  division: Division,
  rooms: readonly PartitionRoom[],
  input: PartitionInput,
): readonly string[] {
  const street = input.street
  if (!street) return []
  const grid = division.grid
  const bays = new Set(rooms.flatMap((room, index) => (room.type === BAY ? [index] : [])))
  const away: Point = [-street.inward[0], -street.inward[1]]
  const along = unitAlong(street.from, street.to)
  const blocked: string[] = []
  for (const index of bays) {
    const room = rooms[index]
    if (!room) continue
    // The bay's floor cut into lanes running to the street, each one a cell wide.
    const lanes = new Map<number, boolean>()
    for (let cell = 0; cell < division.owner.length; cell++) {
      if (division.owner[cell] !== index) continue
      const from = cellCentre(grid, cell)
      const lane = Math.round(
        ((from[0] - street.from[0]) * along[0] + (from[1] - street.from[1]) * along[1]) / grid.step,
      )
      if (lanes.get(lane) === false) continue
      lanes.set(lane, laneIsClear(division, bays, index, from, away))
    }
    const widest = widestRun(lanes, grid.step)
    if (widest < Math.min(RUN_M, lanes.size * grid.step) - 1e-9) blocked.push(room.id)
  }
  return blocked
}

/** Whether one lane out of a bay reaches the street without crossing a room that is not a bay. */
function laneIsClear(
  division: Division,
  bays: ReadonlySet<number>,
  bay: number,
  from: Point,
  away: Point,
): boolean {
  const grid = division.grid
  for (let step = 1; step < grid.rows + grid.cols; step++) {
    const on = cellAt(
      grid,
      from[0] + away[0] * step * grid.step,
      from[1] + away[1] * step * grid.step,
    )
    if (on < 0 || (grid.place[on] ?? OFF) === OFF) return true
    const owner = division.owner[on] ?? NOBODY
    if (owner === NOBODY || owner === bay || bays.has(owner)) continue
    return false
  }
  return true
}

/** The widest stretch of neighbouring lanes that all reach the street, in metres. */
function widestRun(lanes: ReadonlyMap<number, boolean>, step: number): number {
  const clear = [...lanes].filter(([, open]) => open).map(([lane]) => lane)
  clear.sort((one, other) => one - other)
  let widest = 0
  let run = 0
  let last: number | undefined
  for (const lane of clear) {
    run = last !== undefined && lane === last + 1 ? run + 1 : 1
    last = lane
    widest = Math.max(widest, run)
  }
  return widest * step
}

/** The way a stretch of the buildable line runs, as a unit vector. */
function unitAlong(from: Point, to: Point): Point {
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  return run < 1e-9 ? [1, 0] : [(to[0] - from[0]) / run, (to[1] - from[1]) / run]
}

/** The floor before anything is put on it, and whether the storey's targets fit inside the line. */
function openDivision(grid: Grid, rooms: readonly PartitionRoom[], buildable: Polygon): Division {
  let inside = 0
  for (const place of grid.place) if (place === INSIDE) inside += grid.cellArea
  const wanted = rooms.reduce((total, room) => total + Math.max(0, room.targetArea), 0)
  // The line is a wall while the storey fits behind it; a storey that cannot fit is let past it,
  // and what it takes past it is the spill the sheet hatches and counts.
  const fits = wanted <= Math.min(inside, area(buildable)) + grid.cellArea
  return {
    grid,
    owner: new Int32Array(grid.cols * grid.rows).fill(NOBODY),
    fixed: new Uint8Array(grid.cols * grid.rows),
    claim: new Int32Array(grid.cols * grid.rows).fill(NOBODY),
    claims: [],
    fits,
  }
}

/**
 * A metre of shared wall at every contact the bubbles made, and one for every companion against
 * the room it is entered through, so the division may reshape two rooms but can never part them.
 */
function seedContacts(
  division: Division,
  rooms: readonly PartitionRoom[],
  input: PartitionInput,
  at: ReadonlyMap<string, number>,
): readonly (readonly [number, number])[] {
  // Whether two rooms touch is a fact about the bubble diagram the person left, so it is read off
  // the bubbles as they stand; where the wall is laid is a fact about the plan, so it is laid
  // against the corridor as the straightening turned it.
  const given = input.rooms
  const seeded = new Set<string>()
  const pairs: (readonly [number, number])[] = []
  const seed = (one: number, other: number): void => {
    const key = one < other ? `${one}|${other}` : `${other}|${one}`
    if (seeded.has(key)) return
    seeded.add(key)
    const a = rooms[one]
    const b = rooms[other]
    const wasA = given[one]
    const wasB = given[other]
    if (!a || !b || !wasA || !wasB || !inContact(wasA, wasB)) return
    layContact(division, a, b, one, other)
    pairs.push(one < other ? [one, other] : [other, one])
  }
  for (const link of input.links) {
    const a = at.get(link.a)
    const b = at.get(link.b)
    if (a !== undefined && b !== undefined && a !== b) seed(a, b)
  }
  for (const [index, room] of rooms.entries()) {
    const owner = room.owner === undefined ? undefined : at.get(room.owner)
    if (owner !== undefined && owner !== index) seed(index, owner)
  }
  return pairs
}
