import { area, type Point, type Polygon } from '../geometry'
import { cellAt, gridOver, INSIDE, PAST, type Grid } from './grid'
import { doorOn, reachedFrom, runNeeded, sharedRuns, whyOpen } from './links'
import { divide, settleAreas } from './reach'
import { claimDrives, inContact, layContact, layCorridor, layKerb, relaxRun } from './seeds'
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
  const rooms = input.rooms
  const grid = gridOver(input.plot, input.buildable)
  const division = openDivision(grid, rooms, input.buildable)
  const at = new Map(rooms.map((room, index) => [room.id, index]))
  const entry = rooms[at.get(input.arrivals[0] ?? '') ?? -1]

  for (const [index, room] of rooms.entries())
    if (isCorridor(room)) layCorridor(division, room, index, entry?.at)
  claimDrives(division, rooms, (room) => room.type === BAY)
  for (const [index, room] of rooms.entries()) layKerb(division, room, index)
  seedContacts(division, rooms, input, at)

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

/**
 * The bays with no straight run to the street: the ground between the bay and the street line,
 * over the bay's own width, is the garage's or nobody's, so a cell of it held by another room is
 * a bay a car cannot reach. Checked on the zones rather than on the claims, because it is the
 * plan that has to hold, and a bay standing in tandem has its run through the bay in front of it.
 */
function blockedRuns(
  division: Division,
  rooms: readonly PartitionRoom[],
  input: PartitionInput,
): readonly string[] {
  const street = input.street
  if (!street) return []
  const grid = division.grid
  const blocked: string[] = []
  for (const [index, room] of rooms.entries()) {
    if (room.type !== BAY) continue
    const away: Point = [-street.inward[0], -street.inward[1]]
    const across: Point = [-away[1], away[0]]
    const bays = new Set(rooms.flatMap((each, other) => (each.type === BAY ? [other] : [])))
    let stopped = false
    for (const side of [-room.radius / 2, 0, room.radius / 2]) {
      const from: Point = [room.at[0] + across[0] * side, room.at[1] + across[1] * side]
      for (let step = 0; step < grid.rows + grid.cols; step++) {
        const cell = cellAt(
          grid,
          from[0] + away[0] * step * grid.step,
          from[1] + away[1] * step * grid.step,
        )
        if (cell < 0 || (grid.place[cell] ?? 0) === 0) break
        const owner = division.owner[cell] ?? NOBODY
        if (owner === NOBODY || owner === index || bays.has(owner)) continue
        stopped = true
        break
      }
      if (stopped) break
    }
    if (stopped) blocked.push(room.id)
  }
  return blocked
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
): void {
  const seeded = new Set<string>()
  const seed = (one: number, other: number): void => {
    const key = one < other ? `${one}|${other}` : `${other}|${one}`
    if (seeded.has(key)) return
    seeded.add(key)
    const a = rooms[one]
    const b = rooms[other]
    if (!a || !b || !inContact(a, b)) return
    layContact(division, a, b, one, other)
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
}
