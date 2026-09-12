import type { Point } from '../geometry'
import { coreOf, LITTLE_M2, sparePlaceOf } from './cores'
import type { Grid } from './grid'
import { settleLittle } from './little'
import { closePockets, settle, type Zoned } from './moves'
import { placedCells } from './seeds'
import { cellsOfShape, shapeHolds, shapeOfCells, touching, type Shape } from './shape'
import { againstSpine, grownTo, spineOf } from './spine'
import { NOBODY, type Division, type Kerb, type PartitionRoom } from './types'

/*
 * Decision 19, half two. The partition leaves every zone the stepped outline of its cells, which
 * no architect would draw. Here each one becomes running walls: the largest rectangle its cells
 * carry, with at most one rectangular arm, and then the walls are moved along their own lines, a
 * grid step at a time, until the floor left over is taken up and each room is back on its target.
 */

/** What being off target counts for on the corridor, which is the spine and is measured last. */
const SPINE_WEIGHT = 0.6

/** The run of wall the corridor keeps on the entry and on the stair, in cells: a door's metre. */
const CIRCULATION = 4

/** How far a room may be carried to put it against the corridor, in cells: five metres. */
const CARRY = 20

/**
 * The storey straightened. The division is rewritten in place: afterwards every cell a room holds
 * is a cell of that room's rectangle or of its one arm, so the outline traced from them turns four
 * corners or six and the doors are read off walls that run.
 */
export function straighten(
  division: Division,
  rooms: readonly PartitionRoom[],
  contacts: readonly (readonly [number, number])[],
  corridor: number,
  served: ReadonlySet<number>,
): void {
  const grid = division.grid
  const held = new Int32Array(grid.cols * grid.rows).fill(NOBODY)
  const cell = grid.cellArea
  const little = (room: PartitionRoom): boolean => room.targetArea < LITTLE_M2
  const zoned: Zoned[] = rooms.map((room, index) => ({
    index,
    shape: null,
    held: 0,
    target: Math.round(room.targetArea / cell),
    // A small room is drawn at its target and never carved below it; every other room may be
    // carved down to the bottom of the room-type table's range.
    floor: Math.round(
      (little(room)
        ? room.targetArea
        : Math.min(room.minArea ?? room.targetArea, room.targetArea)) / cell,
    ),
    weight: index === corridor ? SPINE_WEIGHT : 1,
    at: [(room.at[0] - grid.left) / grid.step, (room.at[1] - grid.top) / grid.step],
    pinned: false,
  }))
  // A room already built on another storey keeps the floor it is built on, whole.
  for (const zone of zoned) {
    if (!rooms[zone.index]?.placed) continue
    take(grid, held, zone, standing(division, rooms[zone.index] as PartitionRoom))
    zone.pinned = zone.shape !== null
  }
  // The corridor keeps its own run, no narrower and no wider than the Municipality allows, and the
  // rooms are then fitted against it: a plan is read off its circulation.
  const spine = zoned[corridor]
  if (spine && !spine.pinned) take(grid, held, spine, spineOf(division, rooms[corridor], corridor))
  // What each room could lose before it is fitted and still have the floor it asked for, in cells.
  const budget = new Float64Array(rooms.length)
  for (const cell of division.owner) if (cell !== NOBODY) budget[cell] = (budget[cell] ?? 0) + 1
  for (const zone of zoned) budget[zone.index] = (budget[zone.index] ?? 0) - zone.floor
  // The entry and the stair are slid bodily onto the run before anything else is fitted, because
  // the wall between them and the corridor is the way in and the way up and may not be left open.
  const run = spine?.shape
  if (run)
    for (const zone of zoned) {
      if (!served.has(zone.index) || zone.pinned) continue
      const room = rooms[zone.index] as PartitionRoom
      // A room the division left nothing is put on the nearest free floor first: the way in and
      // the way up have to be somewhere before they can be put against the run.
      const core =
        coreOf(division, held, room, zone.index) ??
        sparePlaceOf(division, held, room, zone.index, zone.target)
      if (!core) continue
      // A room already standing on the run is left where it is; only one that has come away from
      // it is slid back, and then no further than the nearest side or end will take it.
      const slid =
        touching(core, run) >= CIRCULATION
          ? core
          : (least(
              againstSpine(division, held, run.main, core, zone.index, CIRCULATION, CARRY),
              rooms,
              contacts,
              zone.index,
              grid,
            ) ?? core)
      // Grown out to its target where it stands: the rooms round it have not been fitted yet, so
      // it takes the floor it asked for now rather than being left with what the slide gave it.
      const box = grownTo(division, held, slid.main, zone.index, zone.target, budget)
      take(grid, held, zone, slid.arm === null ? { main: box, arm: null } : slid)
    }
  for (const zone of zoned) {
    const room = rooms[zone.index] as PartitionRoom
    if (zone.shape !== null || little(room)) continue
    take(grid, held, zone, coreOf(division, held, room, zone.index))
  }
  for (const zone of zoned) {
    const room = rooms[zone.index] as PartitionRoom
    if (zone.shape !== null || !little(room)) continue
    take(grid, held, zone, coreOf(division, held, room, zone.index))
  }
  // A room the straightened corridor ran over has no rectangle of its own left to keep; it is put
  // back on the nearest free floor to its bubble rather than dropped out of the plan altogether.
  for (const zone of zoned)
    if (zone.shape === null)
      take(
        grid,
        held,
        zone,
        sparePlaceOf(division, held, rooms[zone.index] as PartitionRoom, zone.index, zone.target),
      )
  // The small rooms are drawn at their target before the wall-moving starts, and the rooms round
  // them make way: a room of four square metres cannot be brought to its target by moving walls.
  settleLittle(division, held, zoned, rooms, contacts, little, corridor)
  settle(division, held, zoned, contacts, corridor)
  closePockets(division, held, zoned, contacts, corridor)
  for (let index = 0; index < division.owner.length; index++) {
    division.owner[index] = held[index] as number
    division.fixed[index] = 0
  }
}

/**
 * The way of putting a room against the run that stands across the fewest other pairs. A room slid
 * onto the corridor takes floor between two rooms that were going to meet there, and the line from
 * one bubble to the other says which pairs those are: of two places against the run, the one that
 * cuts fewer of them is the one a plan would use.
 */
function least(
  ways: readonly Shape[],
  rooms: readonly PartitionRoom[],
  contacts: readonly (readonly [number, number])[],
  index: number,
  grid: Grid,
): Shape | null {
  let best: Shape | null = null
  let fewest = Infinity
  for (const way of ways) {
    let cuts = 0
    for (const [one, other] of contacts) {
      if (one === index || other === index) continue
      const from = rooms[one]?.at
      const to = rooms[other]?.at
      if (from && to && crosses(way, from, to, grid)) cuts += 1
    }
    if (cuts >= fewest) continue
    fewest = cuts
    best = way
    if (cuts === 0) break
  }
  return best
}

/** Whether the line from one bubble to another passes over a shape, walked a cell at a time. */
function crosses(shape: Shape, from: Point, to: Point, grid: Grid): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / grid.step))
  for (let step = 0; step <= steps; step++) {
    const x = (from[0] + ((to[0] - from[0]) * step) / steps - grid.left) / grid.step
    const y = (from[1] + ((to[1] - from[1]) * step) / steps - grid.top) / grid.step
    if (shapeHolds(shape, Math.floor(x), Math.floor(y))) return true
  }
  return false
}

/** The shape a room already built on another storey stands on, read off the footprint it has. */
function standing(division: Division, room: PartitionRoom): Shape | null {
  const cells = placedCells(division, room)
  return cells.length === 0 ? null : shapeOfCells(division.grid, cells)
}

/** A shape given to a zone: the cells are marked its own and its floor is counted. */
function take(grid: Grid, held: Int32Array, zone: Zoned, shape: Shape | null): void {
  zone.shape = shape
  zone.held = 0
  if (!shape) return
  for (const cell of cellsOfShape(grid, shape)) {
    held[cell] = zone.index
    zone.held += 1
  }
}

/* ------------------------------------------------------------------------------ the corridor's axis */

/** The four ways a wall on this grid can run, which are the ways the cells themselves run. */
const WAYS: readonly Point[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

function nearestWay(along: Point): Point {
  let best = WAYS[0] as Point
  let closest = -Infinity
  for (const way of WAYS) {
    const with_ = along[0] * way[0] + along[1] * way[1]
    if (with_ <= closest) continue
    closest = with_
    best = way
  }
  return best
}

function unitBetween(from: Point, to: Point): Point {
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  return run < 1e-9 ? [1, 0] : [(to[0] - from[0]) / run, (to[1] - from[1]) / run]
}

/**
 * The corridor turned onto an axis before the floor is divided at all. The owner's ruling is that
 * a diagonal is drawn by hand, so the one room the bubbles lay at a free angle is turned onto the
 * nearer of the plot's two ways — the way the service street runs and the way in from it — about
 * the end it starts from, keeping that end and its length. A run that then crosses the buildable
 * line is shortened by the laying, never bent.
 */
export function squareCorridor(
  room: PartitionRoom,
  startsAt: Point | undefined,
  street: Kerb | undefined,
): PartitionRoom {
  if (room.half <= 0) return room
  const along: Point = [Math.cos(room.angle), Math.sin(room.angle)]
  const first: Point = [room.at[0] - along[0] * room.half, room.at[1] - along[1] * room.half]
  const second: Point = [room.at[0] + along[0] * room.half, room.at[1] + along[1] * room.half]
  const near =
    startsAt === undefined ||
    Math.hypot(first[0] - startsAt[0], first[1] - startsAt[1]) <=
      Math.hypot(second[0] - startsAt[0], second[1] - startsAt[1])
      ? first
      : second
  const away: Point = near === first ? along : [-along[0], -along[1]]
  // A plot whose sides are not square to the sheet still has its cells square to it, and a wall
  // can only be drawn along those; the street's way is read onto them first, and the corridor
  // then takes whichever of the four it already lies nearest.
  const street0 = street ? nearestWay(unitBetween(street.from, street.to)) : ([1, 0] as Point)
  const ways: readonly Point[] = [
    street0,
    [-street0[0], -street0[1]],
    [-street0[1], street0[0]],
    [street0[1], -street0[0]],
  ]
  let squared = ways[0] as Point
  let closest = -Infinity
  for (const way of ways) {
    const with_ = away[0] * way[0] + away[1] * way[1]
    if (with_ <= closest) continue
    closest = with_
    squared = way
  }
  return {
    ...room,
    at: [near[0] + squared[0] * room.half, near[1] + squared[1] * room.half],
    angle: Math.atan2(squared[1], squared[0]),
  }
}
