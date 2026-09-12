import type { Point } from '../geometry'
import { cellCentre, type Grid } from './grid'
import { allowed, usable, WALL } from './seeds'
import { cellsOfBox, JOG, type Box, type Shape } from './shape'
import { NOBODY, type Division, type PartitionRoom } from './types'

/*
 * The corridor's own run, and the rooms put against it. The run is read back off the axis the
 * straightening turned it onto rather than off the cells it ended with; the entry and the stair
 * are then slid bodily onto it, because the wall between them and the corridor is the way into the
 * house and the way up and may not be left to the wall-moving to find.
 */

/** The corridor's width in cells: the Municipality's 1.20 m clear, and no more than 2.4 m. */
export const NARROWEST = 5
export const WIDEST = 9

/** Whether every cell of a box is floor this room may stand on that no other zone holds. */
function free(division: Division, held: Int32Array, index: number, box: Box): boolean {
  for (const cell of cellsOfBox(division.grid, box)) {
    if (!usable(division, cell) || !allowed(division, cell, index)) return false
    const taken = held[cell] as number
    if (taken !== NOBODY && taken !== index) return false
  }
  return true
}

/**
 * Every way a room the corridor must reach can be slid bodily against it, the shortest move
 * first: four sides to stand on, each with the room slid along that side as little as it can be
 * and still keep the run of wall a door needs. The caller chooses between them; what is answered
 * here is only which of them the floor will take.
 */
export function againstSpine(
  division: Division,
  held: Int32Array,
  spine: Box,
  shape: Shape,
  index: number,
  reach: number,
  most: number,
): readonly Shape[] {
  const bounds = boundsOf(shape)
  const steps: { dx: number; dy: number }[] = []
  const between = (low: number, high: number): number => Math.min(high, Math.max(low, 0))
  for (const east of [true, false]) {
    const dx = east ? spine.col + spine.cols - bounds.col : spine.col - (bounds.col + bounds.cols)
    const dy = between(
      spine.row + reach - bounds.row - bounds.rows,
      spine.row + spine.rows - reach - bounds.row,
    )
    steps.push({ dx, dy })
  }
  for (const south of [true, false]) {
    const dy = south ? spine.row + spine.rows - bounds.row : spine.row - (bounds.row + bounds.rows)
    const dx = between(
      spine.col + reach - bounds.col - bounds.cols,
      spine.col + spine.cols - reach - bounds.col,
    )
    steps.push({ dx, dy })
  }
  steps.sort(
    (one, other) => Math.abs(one.dx) + Math.abs(one.dy) - Math.abs(other.dx) - Math.abs(other.dy),
  )
  const found: Shape[] = []
  for (const step of steps) {
    // A room that would have to be carried across the house to reach the run is left where it is:
    // the link is then drawn as the tension it is, which is truer than a plan nobody would draw.
    if (Math.abs(step.dx) + Math.abs(step.dy) > most) continue
    const moved: Shape = {
      main: shift(shape.main, step),
      arm: shape.arm ? shift(shape.arm, step) : null,
    }
    if (standsOn(division, held, index, moved)) found.push(moved)
  }
  return found
}

/**
 * A rectangle grown out to the floor it asked for, on whatever sides the free floor allows. The
 * entry and the stair are put against the corridor before the rooms round them are fitted at all,
 * so they take the floor they need first and the rooms round them are fitted to what is left.
 */
export function grownTo(
  division: Division,
  held: Int32Array,
  box: Box,
  index: number,
  target: number,
  budget: Float64Array,
): Box {
  const wanted = box.cols / box.rows
  let kept = box
  for (let step = 0; step < 200 && kept.cols * kept.rows < target; step++) {
    let best: Box | null = null
    let nearest = Infinity
    for (const side of [0, 1, 2, 3] as const) {
      const next =
        side === 0
          ? { ...kept, row: kept.row - 1, rows: kept.rows + 1 }
          : side === 1
            ? { ...kept, cols: kept.cols + 1 }
            : side === 2
              ? { ...kept, rows: kept.rows + 1 }
              : { ...kept, col: kept.col - 1, cols: kept.cols + 1 }
      if (cellsOfBox(division.grid, next).length !== next.cols * next.rows) continue
      // Only its own floor and floor nobody holds: growing here is taking the room's share early,
      // not taking it off the room next door, which has not been fitted yet and cannot answer.
      if (!spare(division, held, index, next, budget)) continue
      const off = Math.abs(Math.log(next.cols / next.rows) - Math.log(wanted))
      if (off >= nearest) continue
      nearest = off
      best = next
    }
    if (!best) break
    for (const cell of cellsOfBox(division.grid, best)) {
      const was = division.owner[cell] as number
      if (was !== NOBODY && was !== index && !inside(kept, division.grid, cell))
        budget[was] = (budget[was] as number) - 1
    }
    kept = best
  }
  return kept
}

function inside(box: Box, grid: Grid, cell: number): boolean {
  const col = cell % grid.cols
  const row = (cell - col) / grid.cols
  return col >= box.col && col < box.col + box.cols && row >= box.row && row < box.row + box.rows
}

/**
 * Whether a box is floor this room may grow into before the rooms round it are fitted: its own,
 * or floor no shape holds yet and whose room can spare it. A wall the seeding put down for another
 * room is never grown over, because that metre of wall is the door the bubbles asked for.
 */
function spare(
  division: Division,
  held: Int32Array,
  index: number,
  box: Box,
  budget: Float64Array,
): boolean {
  const taking = new Map<number, number>()
  for (const cell of cellsOfBox(division.grid, box)) {
    if (!usable(division, cell) || !allowed(division, cell, index)) return false
    if ((held[cell] as number) !== NOBODY && held[cell] !== index) return false
    if (division.fixed[cell] === WALL && division.owner[cell] !== index) return false
    const was = division.owner[cell] as number
    if (was !== NOBODY && was !== index) taking.set(was, (taking.get(was) ?? 0) + 1)
  }
  // A room whose cells this one is growing over keeps enough of them for the floor it asked for:
  // the entry takes its share of what is going spare, never the whole of the room beside it.
  for (const [other, count] of taking) if (count > (budget[other] as number)) return false
  return true
}

function shift(box: Box, step: { dx: number; dy: number }): Box {
  return { ...box, col: box.col + step.dx, row: box.row + step.dy }
}

function boundsOf(shape: Shape): Box {
  const arm = shape.arm
  if (!arm) return shape.main
  const col = Math.min(shape.main.col, arm.col)
  const row = Math.min(shape.main.row, arm.row)
  return {
    col,
    row,
    cols: Math.max(shape.main.col + shape.main.cols, arm.col + arm.cols) - col,
    rows: Math.max(shape.main.row + shape.main.rows, arm.row + arm.rows) - row,
  }
}

/** Whether every cell of a shape is floor this room may stand on and no other room holds. */
function standsOn(division: Division, held: Int32Array, index: number, shape: Shape): boolean {
  for (const box of [shape.main, shape.arm]) {
    if (!box) continue
    if (cellsOfBox(division.grid, box).length !== box.cols * box.rows) return false
    if (!free(division, held, index, box)) return false
  }
  return true
}

/**
 * The corridor's own rectangle: the run it was laid as, read back off the axis it was turned onto
 * rather than off the cells it ended with, so the spine is the width the Municipality asks and the
 * length its target gives it and nothing the hole-filling handed it on the way. A run that crosses
 * the buildable line is shortened from its far end, never bent.
 */
export function spineOf(
  division: Division,
  room: PartitionRoom | undefined,
  index: number,
): Shape | null {
  if (!room || room.half <= 0 || room.targetArea <= 0) return null
  const grid = division.grid
  const along: Point = [Math.cos(room.angle), Math.sin(room.angle)]
  const wide = Math.min(WIDEST, Math.max(NARROWEST, Math.round((2 * room.radius) / grid.step)))
  const near: Point = [room.at[0] - along[0] * room.half, room.at[1] - along[1] * room.half]
  const tip: Point = [near[0] - along[0] * room.radius, near[1] - along[1] * room.radius]
  // The run is as long as its target gives it, and longer where a room it serves stands further
  // down the axis than that: a corridor that stops short of the stair is a corridor that serves it
  // by a door it has not got.
  const seeded = reachOfSeeds(division, index, tip, along, wide)
  const long = Math.max(JOG, seeded, Math.round(room.targetArea / (wide * grid.step) / grid.step))
  const across = Math.abs(along[0]) > 0.5
  const tipCol = Math.floor((tip[0] - grid.left) / grid.step)
  const tipRow = Math.floor((tip[1] - grid.top) / grid.step)
  const middle = across
    ? Math.round((room.at[1] - grid.top) / grid.step - wide / 2)
    : Math.round((room.at[0] - grid.left) / grid.step - wide / 2)
  const forward = across ? along[0] > 0 : along[1] > 0
  const box: Box = across
    ? { col: forward ? tipCol : tipCol - long + 1, row: middle, cols: long, rows: wide }
    : { col: middle, row: forward ? tipRow : tipRow - long + 1, cols: wide, rows: long }
  return shortened(division, box, across, forward)
}

/** How far to either side of the corridor's own axis a seeded wall still counts as on it, in cells. */
const BESIDE = 8

/**
 * How far down its own axis the furthest wall seeded on the corridor stands, in cells from the
 * tip. A run cut to its target alone can stop short of the last room the bubbles stood against it,
 * and a corridor that stops short of the stair serves it by a door it has not got. Only the run's
 * own seeded cells are read: taking the rooms' side as well stretches the run past a pair standing
 * across from one another, and parts them.
 */
function reachOfSeeds(
  division: Division,
  index: number,
  tip: Point,
  along: Point,
  wide: number,
): number {
  const grid = division.grid
  const across: Point = [-along[1], along[0]]
  let reach = 0
  for (let cell = 0; cell < division.owner.length; cell++) {
    if (division.fixed[cell] !== WALL || division.owner[cell] !== index) continue
    const at = cellCentre(grid, cell)
    const off = Math.abs((at[0] - tip[0]) * across[0] + (at[1] - tip[1]) * across[1]) / grid.step
    if (off > wide / 2 + BESIDE) continue
    const down = ((at[0] - tip[0]) * along[0] + (at[1] - tip[1]) * along[1]) / grid.step
    reach = Math.max(reach, Math.ceil(down))
  }
  return reach
}

/** The run cut back from its far end until every cell of it is floor the storey may build on. */
function shortened(division: Division, box: Box, across: boolean, forward: boolean): Shape | null {
  let held = box
  for (let tries = 0; tries < 200; tries++) {
    const cells = cellsOfBox(division.grid, held)
    if (
      cells.length === held.cols * held.rows &&
      cells.every((cell) => usable(division, cell) && division.claim[cell] === NOBODY)
    )
      return { main: held, arm: null }
    const long = across ? held.cols : held.rows
    if (long <= JOG) return null
    held = across
      ? { ...held, col: forward ? held.col : held.col + 1, cols: long - 1 }
      : { ...held, row: forward ? held.row : held.row + 1, rows: long - 1 }
  }
  return null
}
