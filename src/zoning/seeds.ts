import type { Point } from '../geometry'
import { cellCentre, INSIDE, OFF, type Grid } from './grid'
import { NOBODY, type Division, type PartitionRoom } from './types'

/*
 * What is put down before any reach is measured. The corridor is laid first, because a plan is
 * read off its circulation; then the rooms the rulebook walled onto the kerb, so the frontage the
 * bubbles claimed is the frontage the zones keep; then a metre of wall at every contact the
 * bubbles made, so the division may reshape two rooms but can never part them.
 */

/** How far in from the buildable line a walled room's own cells are put down, in metres. */
const KERB_SEED_M = 0.5

/** The run of wall seeded at a contact, in metres: the metre a door needs, with a little over. */
const CONTACT_M = 1.5

/** How far back from a contact each of the two rooms is given, in metres. */
const CONTACT_DEPTH_M = 0.5

/** How far apart two bubbles may stand and still be read as touching, in metres. */
const TOUCHING_M = 0.1

type Box = {
  readonly at: Point
  /** The way the box's long side runs, a unit vector. */
  readonly along: Point
  readonly halfLong: number
  readonly halfWide: number
}

function unit(from: Point, to: Point): Point {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const run = Math.hypot(dx, dy)
  return run < 1e-9 ? [1, 0] : [dx / run, dy / run]
}

/** Every cell whose middle falls inside an oriented box, walked in row order so the result is fixed. */
function cellsIn(grid: Grid, box: Box): readonly number[] {
  const across: Point = [-box.along[1], box.along[0]]
  const reach = Math.hypot(box.halfLong, box.halfWide) + grid.step
  const lowCol = Math.max(0, Math.floor((box.at[0] - reach - grid.left) / grid.step))
  const highCol = Math.min(grid.cols - 1, Math.ceil((box.at[0] + reach - grid.left) / grid.step))
  const lowRow = Math.max(0, Math.floor((box.at[1] - reach - grid.top) / grid.step))
  const highRow = Math.min(grid.rows - 1, Math.ceil((box.at[1] + reach - grid.top) / grid.step))
  const out: number[] = []
  for (let row = lowRow; row <= highRow; row++)
    for (let col = lowCol; col <= highCol; col++) {
      const index = row * grid.cols + col
      const at = cellCentre(grid, index)
      const dx = at[0] - box.at[0]
      const dy = at[1] - box.at[1]
      if (Math.abs(dx * box.along[0] + dy * box.along[1]) > box.halfLong) continue
      if (Math.abs(dx * across[0] + dy * across[1]) > box.halfWide) continue
      out.push(index)
    }
  return out
}

/** Whether the storey may put a room on this cell at all: on the floor, and inside the line while it fits. */
export function usable(division: Division, index: number): boolean {
  const place = division.grid.place[index] ?? OFF
  if (place === OFF) return false
  return division.fits ? place === INSIDE : true
}

/** Whether this room is allowed to hold this cell: nobody has claimed it, or the claim names the room. */
export function allowed(division: Division, index: number, room: number): boolean {
  const claim = division.claim[index] ?? NOBODY
  return claim === NOBODY || (division.claims[claim]?.includes(room) ?? false)
}

/**
 * A cell put down before the reaches run: it belongs to that room and no reach ever takes it. The
 * corridor's own run is put down as `RUN` and a wall the frontage or a contact asks for as `WALL`,
 * because the run may be trimmed back to the corridor's target afterwards and a wall may not.
 */
const RUN = 1
export const WALL = 2

function settle(division: Division, index: number, room: number, mark: number): void {
  if (!usable(division, index) || !allowed(division, index, room)) return
  const held = division.fixed[index] ?? 0
  if (held !== 0) {
    // A wall asked for on a cell the corridor already holds raises that cell to a wall.
    if (division.owner[index] === room && mark > held) division.fixed[index] = mark
    return
  }
  division.owner[index] = room
  division.fixed[index] = mark
}

/** The corridor's run let go, once the zones are whole: its extra cells may be handed on. */
export function relaxRun(division: Division): void {
  for (let index = 0; index < division.fixed.length; index++)
    if (division.fixed[index] === RUN) division.fixed[index] = 0
}

/**
 * The corridor's own cells: a straight run at its width from the room it starts from, as long as
 * its area gives it. Laid before anything else and never taken, so the plan is read off a corridor
 * that lies where the bubble lay rather than off whatever the reaches leave over.
 */
export function layCorridor(
  division: Division,
  room: PartitionRoom,
  index: number,
  startsAt: Point | undefined,
): void {
  const width = 2 * room.radius
  if (width < 1e-9 || room.targetArea <= 0) return
  const along: Point = [Math.cos(room.angle), Math.sin(room.angle)]
  const ends: readonly Point[] = [
    [room.at[0] - along[0] * room.half, room.at[1] - along[1] * room.half],
    [room.at[0] + along[0] * room.half, room.at[1] + along[1] * room.half],
  ]
  const first = ends[0] as Point
  const second = ends[1] as Point
  const near =
    startsAt === undefined
      ? first
      : Math.hypot(first[0] - startsAt[0], first[1] - startsAt[1]) <=
          Math.hypot(second[0] - startsAt[0], second[1] - startsAt[1])
        ? first
        : second
  const away: Point = near === first ? along : [-along[0], -along[1]]
  // The run starts at the capsule's own near tip, so the zone begins where the bubble began.
  const tip: Point = [near[0] - away[0] * room.radius, near[1] - away[1] * room.radius]
  const runOf = (length: number): Box => ({
    at: [tip[0] + away[0] * (length / 2), tip[1] + away[1] * (length / 2)],
    along: away,
    halfLong: length / 2,
    halfWide: width / 2,
  })
  const held = (length: number): readonly number[] =>
    cellsIn(division.grid, runOf(length)).filter((cell) => usable(division, cell))
  // The run is lengthened a step at a time until its cells come to the corridor's target area:
  // a rectangle of exactly that area, rasterised, would hold whatever its corners happened to
  // straddle, and the corridor is the one room whose area must not be argued about afterwards.
  const step = division.grid.step / 4
  const most = (2 * room.targetArea) / width
  let length = step
  let count = held(length).length
  for (let tried = length + step; tried <= most; tried += step) {
    const next = held(tried).length
    if (next * division.grid.cellArea >= room.targetArea) {
      const under = Math.abs(count * division.grid.cellArea - room.targetArea)
      const over = Math.abs(next * division.grid.cellArea - room.targetArea)
      if (over <= under) length = tried
      break
    }
    if (next > count) length = tried
    count = next
  }
  const run = held(length)
  for (const cell of run) settle(division, cell, index, RUN)
  // The run is rasterised a whole column at a time, so its last column can carry the corridor past
  // its target; the cells furthest from the near end are given back until the area is the target's.
  const furthest = [...run].sort((a, b) => {
    const one = cellCentre(division.grid, a)
    const other = cellCentre(division.grid, b)
    const reach =
      (other[0] - tip[0]) * away[0] +
      (other[1] - tip[1]) * away[1] -
      ((one[0] - tip[0]) * away[0] + (one[1] - tip[1]) * away[1])
    return reach !== 0 ? reach : a - b
  })
  let over = run.length * division.grid.cellArea - room.targetArea
  for (const cell of furthest) {
    if (over <= division.grid.cellArea / 2) break
    division.owner[cell] = NOBODY
    division.fixed[cell] = 0
    over -= division.grid.cellArea
  }
}

/** How far along a line a point falls, in metres from its start. */
function alongLine(from: Point, along: Point, at: Point): number {
  return (at[0] - from[0]) * along[0] + (at[1] - from[1]) * along[1]
}

/**
 * A walled room's own cells against the kerb it claimed: its own width of the claim, a metre deep.
 * The frontage is a wall in the bubbles, so it is a wall here too — the room with a street door
 * keeps the street whatever the reaches round it would rather have.
 */
export function layKerb(division: Division, room: PartitionRoom, index: number): void {
  const kerb = room.kerb
  if (!kerb) return
  const along = unit(kerb.from, kerb.to)
  const run = Math.hypot(kerb.to[0] - kerb.from[0], kerb.to[1] - kerb.from[1])
  if (run < 1e-9) return
  const middle = Math.min(run, Math.max(0, alongLine(kerb.from, along, room.at)))
  const half = Math.min(room.radius, run / 2)
  const at = Math.min(run - half, Math.max(half, middle))
  const centre: Point = [
    kerb.from[0] + along[0] * at + kerb.inward[0] * (KERB_SEED_M / 2),
    kerb.from[1] + along[1] * at + kerb.inward[1] * (KERB_SEED_M / 2),
  ]
  const box: Box = { at: centre, along, halfLong: half, halfWide: KERB_SEED_M / 2 }
  for (const cell of cellsIn(division.grid, box)) settle(division, cell, index, WALL)
}

/** Whether two bubbles are touching, measured between their rims as the diagram measures them. */
export function inContact(a: PartitionRoom, b: PartitionRoom): boolean {
  return gapBetween(a, b).gap <= TOUCHING_M
}

/** The nearest points of two bubbles' bodies and how far apart their rims stand. */
function gapBetween(
  a: PartitionRoom,
  b: PartitionRoom,
): { readonly onA: Point; readonly onB: Point; readonly gap: number } {
  const onA = nearestOn(a, b.at)
  const onB = nearestOn(b, onA)
  const back = nearestOn(a, onB)
  return {
    onA: back,
    onB,
    gap: Math.hypot(onB[0] - back[0], onB[1] - back[1]) - a.radius - b.radius,
  }
}

/** The point of a room's own segment nearest somewhere else; for a disc that is its middle. */
function nearestOn(room: PartitionRoom, at: Point): Point {
  if (room.half < 1e-9) return room.at
  const along: Point = [Math.cos(room.angle), Math.sin(room.angle)]
  const reach = Math.min(room.half, Math.max(-room.half, alongLine(room.at, along, at)))
  return [room.at[0] + along[0] * reach, room.at[1] + along[1] * reach]
}

/**
 * The metre of shared wall a contact is worth: half a metre of floor either side of the point
 * where the two bubbles meet, each half settled on its own room. A room standing along a corridor
 * takes its half from the corridor's free side, because the corridor's own cells are already down.
 */
export function layContact(
  division: Division,
  a: PartitionRoom,
  b: PartitionRoom,
  indexA: number,
  indexB: number,
): void {
  const { onA, onB } = gapBetween(a, b)
  const away = unit(onA, onB)
  const meeting: Point = [
    (onA[0] + away[0] * a.radius + onB[0] - away[0] * b.radius) / 2,
    (onA[1] + away[1] * a.radius + onB[1] - away[1] * b.radius) / 2,
  ]
  const across: Point = [-away[1], away[0]]
  for (const [room, side] of [
    [indexA, -1],
    [indexB, 1],
  ] as const) {
    const centre: Point = [
      meeting[0] + away[0] * side * (CONTACT_DEPTH_M / 2),
      meeting[1] + away[1] * side * (CONTACT_DEPTH_M / 2),
    ]
    const box: Box = {
      at: centre,
      along: across,
      halfLong: CONTACT_M / 2,
      halfWide: CONTACT_DEPTH_M / 2,
    }
    for (const cell of cellsIn(division.grid, box)) settle(division, cell, room, WALL)
  }
}

/**
 * The driveway a garage bay keeps: the stretch of kerb it claimed, as deep as the deepest bay
 * standing on it, is the garage's or nobody's. A bay in tandem stands on the same stretch behind
 * the bay in front of it, which is why the claim is read over the whole group of them at once.
 */
export function claimDrives(
  division: Division,
  rooms: readonly PartitionRoom[],
  isBay: (room: PartitionRoom) => boolean,
): void {
  const claims = division.claims
  for (const [index, room] of rooms.entries()) {
    const kerb = room.kerb
    if (!kerb || !isBay(room)) continue
    const group = [index]
    for (let more = true; more;) {
      more = false
      for (const [other, each] of rooms.entries()) {
        if (group.includes(other) || each.behind === undefined) continue
        const ahead = rooms.findIndex((one) => one.id === each.behind)
        if (!group.includes(ahead)) continue
        group.push(other)
        more = true
      }
    }
    const along = unit(kerb.from, kerb.to)
    const run = Math.hypot(kerb.to[0] - kerb.from[0], kerb.to[1] - kerb.from[1])
    if (run < 1e-9) continue
    // Only the ground between the street and the nearest rim of the deepest bay on this stretch is
    // claimed: that is the run itself. A bay standing on the kerb needs none, because its own cells
    // are already against the line; a bay in tandem needs the whole driveway past the bay in front.
    let depth = 0
    for (const member of group) {
      const bay = rooms[member]
      if (!bay) continue
      const into =
        (bay.at[0] - kerb.from[0]) * kerb.inward[0] + (bay.at[1] - kerb.from[1]) * kerb.inward[1]
      depth = Math.max(depth, into - bay.radius)
    }
    if (depth <= 0) continue
    const claim = claims.length
    claims.push(group)
    // A cell narrower than the claim at each end, so a room standing beside the bay may still
    // share its side wall: what the driveway needs is the ground in front of the bay, not its sides.
    const box: Box = {
      at: [
        kerb.from[0] + along[0] * (run / 2) + kerb.inward[0] * (depth / 2),
        kerb.from[1] + along[1] * (run / 2) + kerb.inward[1] * (depth / 2),
      ],
      along,
      halfLong: Math.max(division.grid.step, run / 2 - division.grid.step),
      halfWide: depth / 2,
    }
    for (const cell of cellsIn(division.grid, box)) {
      // A cell the corridor already lies on is not the garage's to claim; that bay's run is
      // blocked, and the finding says so rather than the driveway taking the corridor's floor.
      if (division.fixed[cell] !== 0 && !group.includes(division.owner[cell] ?? NOBODY)) continue
      if ((division.claim[cell] ?? NOBODY) !== NOBODY) continue
      division.claim[cell] = claim
    }
  }
}
