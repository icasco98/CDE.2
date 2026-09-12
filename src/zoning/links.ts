import type { Point } from '../geometry'
import { cellAt, cellCentre } from './grid'
import { NOBODY, type Division, type Door, type PartitionLink, type PartitionRoom } from './types'

/*
 * The links, once the floor is divided. A pair with a run of wall long enough for a door gets one,
 * at the middle of the longest run they share; a pair without gets a line of tension and a sentence
 * saying what is in the way. A door here is still the drawing of an edge: no wall that happens to
 * coincide ever makes one, only a link the graph already holds.
 */

/** The run of wall a door needs, in metres, and the room size under which it may take a little less. */
const DOOR_M = 1
const SMALL_DOOR_M = 0.9
const SMALL_ROOM_M2 = 8

/** A run of wall two zones share: the corners it turns, and how long it is all told. */
export type Run = { readonly path: readonly Point[]; readonly length: number }

/** How much wall a pair needs before a door goes on it: a metre, or a little less for a small room. */
export function runNeeded(a: PartitionRoom | undefined, b: PartitionRoom | undefined): number {
  const small = (room: PartitionRoom | undefined): boolean =>
    room !== undefined && room.targetArea < SMALL_ROOM_M2
  return small(a) || small(b) ? SMALL_DOOR_M : DOOR_M
}

/**
 * Every run of wall two rooms share, longest first. The sides their cells have in common are
 * chained end to end, so a boundary that steps up the grid is read as the one wall it is rather
 * than as the several short ones the steps would make of it. Straightening those steps is half two.
 */
export function sharedRuns(division: Division, a: number, b: number): readonly Run[] {
  const grid = division.grid
  const sides: (readonly [Point, Point])[] = []
  for (let index = 0; index < division.owner.length; index++) {
    if (division.owner[index] !== a) continue
    const col = index % grid.cols
    const row = (index - col) / grid.cols
    const x = grid.left + col * grid.step
    const y = grid.top + row * grid.step
    const on = x + grid.step
    const down = y + grid.step
    if (row > 0 && division.owner[index - grid.cols] === b)
      sides.push([
        [x, y],
        [on, y],
      ])
    if (col + 1 < grid.cols && division.owner[index + 1] === b)
      sides.push([
        [on, y],
        [on, down],
      ])
    if (row + 1 < grid.rows && division.owner[index + grid.cols] === b)
      sides.push([
        [x, down],
        [on, down],
      ])
    if (col > 0 && division.owner[index - 1] === b)
      sides.push([
        [x, y],
        [x, down],
      ])
  }
  return chained(sides, grid.step)
}

/** The shared sides linked end to end into runs, each walked from one of its own ends. */
function chained(sides: readonly (readonly [Point, Point])[], cell: number): readonly Run[] {
  const at = new Map<string, number[]>()
  for (const [index, side] of sides.entries())
    for (const end of side) {
      const key = keyOf(end)
      at.set(key, [...(at.get(key) ?? []), index])
    }
  const walked = new Uint8Array(sides.length)
  const runs: Run[] = []
  const lonely = (index: number): Point | undefined =>
    (sides[index] as readonly [Point, Point]).find((end) => (at.get(keyOf(end)) ?? []).length === 1)
  // A run is walked from one of its own ends where it has one, so its middle really is its middle;
  // a run that closes on itself has none, and starts wherever its first side does.
  const order = [...sides.keys()].filter((index) => lonely(index) !== undefined)
  for (const seed of [...order, ...sides.keys()]) {
    if (walked[seed] === 1) continue
    let here = lonely(seed) ?? ((sides[seed] as readonly [Point, Point])[0] as Point)
    const path: Point[] = [here]
    for (let index = seed; index >= 0;) {
      walked[index] = 1
      const side = sides[index] as readonly [Point, Point]
      const onward = keyOf(side[0]) === keyOf(here) ? side[1] : side[0]
      path.push(onward)
      here = onward
      index = (at.get(keyOf(onward)) ?? []).find((other) => walked[other] !== 1) ?? -1
    }
    runs.push({ path, length: (path.length - 1) * cell })
  }
  return runs.sort((one, other) => other.length - one.length)
}

function keyOf(at: Point): string {
  return `${at[0].toFixed(4)}|${at[1].toFixed(4)}`
}

/** The middle of a run, where the door goes, and the way the wall runs there. */
export function doorOn(link: PartitionLink, run: Run): Door {
  const half = run.length / 2
  let walked = 0
  for (let index = 0; index + 1 < run.path.length; index++) {
    const from = run.path[index] as Point
    const to = run.path[index + 1] as Point
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (length < 1e-9) continue
    if (walked + length < half && index + 2 < run.path.length) {
      walked += length
      continue
    }
    const into = Math.min(length, half - walked)
    return {
      linkId: link.id,
      at: [
        from[0] + ((to[0] - from[0]) * into) / length,
        from[1] + ((to[1] - from[1]) * into) / length,
      ],
      along: [(to[0] - from[0]) / length, (to[1] - from[1]) / length],
    }
  }
  return { linkId: link.id, at: (run.path[0] ?? [0, 0]) as Point, along: [1, 0] }
}

/** Where a zone's cells lie, as one point, which is what a line drawn between two zones runs from. */
function middleOf(division: Division, room: number): Point {
  let x = 0
  let y = 0
  let held = 0
  for (let index = 0; index < division.owner.length; index++) {
    if (division.owner[index] !== room) continue
    const at = cellCentre(division.grid, index)
    x += at[0]
    y += at[1]
    held += 1
  }
  return held === 0 ? [0, 0] : [x / held, y / held]
}

/** The room whose floor the line between two zones crosses most; nothing where it crosses none. */
function between(division: Division, a: number, b: number): number {
  const from = middleOf(division, a)
  const to = middleOf(division, b)
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  const steps = Math.max(1, Math.ceil(run / division.grid.step))
  const crossed = new Map<number, number>()
  for (let step = 0; step <= steps; step++) {
    const at: Point = [
      from[0] + ((to[0] - from[0]) * step) / steps,
      from[1] + ((to[1] - from[1]) * step) / steps,
    ]
    const cell = cellAt(division.grid, at[0], at[1])
    if (cell < 0) continue
    const owner = division.owner[cell] ?? NOBODY
    if (owner === NOBODY || owner === a || owner === b) continue
    crossed.set(owner, (crossed.get(owner) ?? 0) + 1)
  }
  let deepest = NOBODY
  let most = 0
  for (const [owner, count] of [...crossed].sort((one, other) => one[0] - other[0]))
    if (count > most) {
      most = count
      deepest = owner
    }
  return deepest
}

/** To a tenth of a metre, which is as fine as a wall on this sheet is ever read. */
function metres(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** What is standing in the way of a link the zones did not realize, in one sentence. */
export function whyOpen(
  division: Division,
  rooms: readonly PartitionRoom[],
  a: number,
  b: number,
  longest: number,
): string {
  const one = rooms[a]?.name ?? ''
  const other = rooms[b]?.name ?? ''
  const across = between(division, a, b)
  if (across !== NOBODY)
    return `${one} cannot reach ${other}: ${rooms[across]?.name ?? ''} is between them.`
  if (longest > 0)
    return `${one} and ${other} meet along only ${metres(longest)} m; a door needs ${metres(runNeeded(rooms[a], rooms[b]))} m of wall.`
  return `${one} and ${other} do not meet; there is no wall between them for a door.`
}

/** The rooms a person can walk to from the entry over the doors, and no other way. */
export function reachedFrom(
  links: readonly PartitionLink[],
  doors: readonly Door[],
  arrivals: readonly string[],
): ReadonlySet<string> {
  const reached = new Set<string>(arrivals)
  const open = new Set(doors.map((door) => door.linkId))
  const beside = new Map<string, string[]>()
  for (const link of links) {
    if (!open.has(link.id)) continue
    beside.set(link.a, [...(beside.get(link.a) ?? []), link.b])
    beside.set(link.b, [...(beside.get(link.b) ?? []), link.a])
  }
  const queue = [...arrivals]
  while (queue.length > 0) {
    const here = queue.shift() as string
    for (const next of beside.get(here) ?? []) {
      if (reached.has(next)) continue
      reached.add(next)
      queue.push(next)
    }
  }
  return reached
}
