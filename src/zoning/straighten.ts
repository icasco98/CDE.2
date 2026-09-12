import type { Point } from '../geometry'
import { coreOf, sparePlaceOf, spineOf } from './cores'
import type { Grid } from './grid'
import { closePockets, settle, type Zoned } from './moves'
import { cellsOfShape, type Shape } from './shape'
import { NOBODY, type Division, type Kerb, type PartitionRoom } from './types'

/*
 * Decision 19, half two. The partition leaves every zone the stepped outline of its cells, which
 * no architect would draw. Here each one becomes running walls: the largest rectangle its cells
 * carry, with at most one rectangular arm, and then the walls are moved along their own lines, a
 * grid step at a time, until the floor left over is taken up and each room is back on its target.
 */

/** What being off target counts for on the corridor, which is the spine and is measured last. */
const SPINE_WEIGHT = 0.6

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
): void {
  const grid = division.grid
  const held = new Int32Array(grid.cols * grid.rows).fill(NOBODY)
  const cell = grid.cellArea
  const zoned: Zoned[] = rooms.map((room, index) => ({
    index,
    shape: null,
    held: 0,
    target: Math.round(room.targetArea / cell),
    floor: Math.round(Math.min(room.minArea ?? room.targetArea, room.targetArea) / cell),
    weight: index === corridor ? SPINE_WEIGHT : 1,
    at: [(room.at[0] - grid.left) / grid.step, (room.at[1] - grid.top) / grid.step],
  }))
  // The corridor keeps its own run, no narrower and no wider than the Municipality allows, and the
  // rooms are then fitted against it: a plan is read off its circulation.
  const spine = zoned[corridor]
  if (spine) take(grid, held, spine, spineOf(division, rooms[corridor], corridor))
  for (const zone of zoned)
    if (zone !== spine)
      take(grid, held, zone, coreOf(division, held, rooms[zone.index] as PartitionRoom, zone.index))
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
  settle(division, held, zoned, contacts, corridor)
  closePockets(division, held, zoned, contacts, corridor)
  for (let index = 0; index < division.owner.length; index++) {
    division.owner[index] = held[index] as number
    division.fixed[index] = 0
  }
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
