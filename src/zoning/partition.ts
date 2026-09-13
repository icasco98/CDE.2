import type { Point } from '../geometry'
import { cellAt, cellCentre, gridOver, OFF, PAST, type Grid } from './grid'
import { doorOn, reachedFrom, runNeeded, sharedRuns, whyOpen } from './links'
import { layPlaced } from './seeds'
import { layRooms, squareCorridor } from './straighten'
import { cellsOf, outlineOfCells, zoneOfCells } from './zones'
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
 * Decision 19. The corridor is turned onto a grid axis, a stair the floor below placed is put down
 * first, and the spine engine lays every other room as a band beside the corridor (Z6), writing the
 * floor's owners directly; what follows reads the doors, the tension, the reach and the spill off
 * those owners, exactly as it did off the cell partition of half one.
 */

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
  const division = openDivision(grid)
  const at = new Map(rooms.map((room, index) => [room.id, index]))

  // A room that already stands on another storey goes down first and keeps its cells, so the
  // floor above stacks on the floor below; then the spine engine lays everything else.
  for (const [index, room] of rooms.entries()) layPlaced(division, room, index)
  layRooms(division, rooms, input)

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
  const bays = rooms.flatMap((room, index) => (room.type === BAY ? [index] : []))
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
    // The bays stand in tandem, one driveway: a room with a door onto one bay has its way into
    // the bay behind it through the first, so a link to that bay is the same door.
    const room = bays.includes(a) && !bays.includes(b) ? b : bays.includes(b) ? a : undefined
    const through =
      room === undefined
        ? undefined
        : bays
            .filter((bay) => bay !== a && bay !== b)
            .map((bay) => sharedRuns(division, room, bay)[0])
            .find((run) => run !== undefined && run.length >= needed - 1e-9)
    if (through) {
      doors.push(doorOn(link, through))
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

/** The floor before anything is put on it. */
function openDivision(grid: Grid): Division {
  return {
    grid,
    owner: new Int32Array(grid.cols * grid.rows).fill(NOBODY),
    fixed: new Uint8Array(grid.cols * grid.rows),
  }
}
