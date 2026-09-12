import { type Grid } from './grid'
import { allowed, usable, WALL } from './seeds'
import { joined, jogsRun, JOG, type Box, type Shape } from './shape'
import { NOBODY, type Division, type PartitionRoom } from './types'

/*
 * The shape every zone starts from: the largest rectangle its own cells carry, with at most one
 * rectangular arm against it. Nothing here moves a wall — that is the settling — and nothing here
 * takes a cell another zone already holds, so the shapes the rooms start with never overlap.
 */

/** The floor a room must have before it may take an arm, in m²; under it a zone is a rectangle. */
export const LITTLE_M2 = 8

/** How far outside its own cells a zone may look for the rectangle it becomes, in cells. */
const MARGIN = 8

/** What a cell of the zone's own is worth to the rectangle that covers it. */
const MINE = 1

/**
 * What a cell of a seeded wall is worth. Far more than an ordinary cell: the rectangle is drawn to
 * reach the metre of wall the seeding put down at every contact, so a pair the bubbles put together
 * is still together once the zones are rectangles, rather than left to the wall-moving to rejoin.
 */
const SEEDED = 8

/** What a cell of floor nobody holds costs, so a rectangle squares up rather than reaches out. */
const SPARE = 0.6

/** A cell no zone may stand on at all. */
const BLOCKED = -1e6

/** Prefix sums of a score over a window of the grid, so any box in it is read in constant time. */
type Field = {
  readonly col: number
  readonly row: number
  readonly cols: number
  readonly rows: number
  readonly sums: Float64Array
}

function sumIn(field: Field, box: Box): number {
  const left = box.col - field.col
  const top = box.row - field.row
  const right = left + box.cols
  const bottom = top + box.rows
  if (left < 0 || top < 0 || right > field.cols || bottom > field.rows) return BLOCKED
  const width = field.cols + 1
  return (
    (field.sums[bottom * width + right] as number) -
    (field.sums[top * width + right] as number) -
    (field.sums[bottom * width + left] as number) +
    (field.sums[top * width + left] as number)
  )
}

/**
 * The largest rectangle a zone's cells carry, by the score under it. Every pair of column lines is
 * walked once and the rows between them read as one longest run, so the whole search costs the
 * window's area times its width rather than the square of its area.
 */
function bestBox(field: Field): Box | null {
  let best: Box | null = null
  let most = 0
  const down = new Float64Array(field.rows)
  const running = new Float64Array(field.rows + 1)
  for (let left = 0; left + JOG <= field.cols; left++) {
    down.fill(0)
    for (let right = left; right < field.cols; right++) {
      const width = field.cols + 1
      for (let row = 0; row < field.rows; row++)
        down[row] =
          (down[row] as number) +
          (field.sums[(row + 1) * width + right + 1] as number) -
          (field.sums[row * width + right + 1] as number) -
          (field.sums[(row + 1) * width + right] as number) +
          (field.sums[row * width + right] as number)
      if (right - left + 1 < JOG) continue
      running[0] = 0
      for (let row = 0; row < field.rows; row++)
        running[row + 1] = (running[row] as number) + (down[row] as number)
      let lowest = 0
      let lowestAt = 0
      for (let end = JOG; end <= field.rows; end++) {
        const start = end - JOG
        if ((running[start] as number) < lowest) {
          lowest = running[start] as number
          lowestAt = start
        }
        const score = (running[end] as number) - lowest
        if (score <= most) continue
        most = score
        best = {
          col: field.col + left,
          row: field.row + lowestAt,
          cols: right - left + 1,
          rows: end - lowestAt,
        }
      }
    }
  }
  return best
}

/** The four ways an arm may stand on a rectangle, each flush with one end of the side it is on. */
const ARMS = [
  { beyond: true, flush: true },
  { beyond: true, flush: false },
  { beyond: false, flush: true },
  { beyond: false, flush: false },
] as const

/**
 * The best arm on a rectangle: a second rectangle against one of its four sides, flush with one
 * end of it, so the two together turn six corners and not eight. Nothing where no arm pays for
 * itself, which is how a zone that wants to be a rectangle stays one.
 */
function bestArm(field: Field, main: Box): Box | null {
  let best: Box | null = null
  let most = 0
  for (const turned of [false, true]) {
    const along = turned ? main.rows : main.cols
    for (const side of ARMS) {
      for (let reach = JOG; reach < along; reach++) {
        // An arm as long as the side it stands on makes a rectangle, which `bestBox` had its
        // chance at; anything between leaves a jog, and a jog under the metre is no wall at all.
        if (along - reach < JOG) continue
        const from = side.flush ? 0 : along - reach
        for (let depth = JOG; depth <= MARGIN; depth++) {
          const box: Box = turned
            ? {
                col: side.beyond ? main.col + main.cols : main.col - depth,
                row: main.row + from,
                cols: depth,
                rows: reach,
              }
            : {
                col: main.col + from,
                row: side.beyond ? main.row + main.rows : main.row - depth,
                cols: reach,
                rows: depth,
              }
          const score = sumIn(field, box)
          if (score <= most) continue
          most = score
          best = box
        }
      }
    }
  }
  return best
}

/** The cells one room holds in the division as the reaches left it. */
export function ownedBy(division: Division, index: number): readonly number[] {
  const out: number[] = []
  for (let cell = 0; cell < division.owner.length; cell++)
    if (division.owner[cell] === index) out.push(cell)
  return out
}

/** The window a zone is fitted in: its own cells, with room round them to square up into. */
export function windowOf(grid: Grid, cells: readonly number[], margin: number): Box {
  let left = grid.cols
  let right = -1
  let top = grid.rows
  let bottom = -1
  for (const cell of cells) {
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    left = Math.min(left, col)
    right = Math.max(right, col)
    top = Math.min(top, row)
    bottom = Math.max(bottom, row)
  }
  const col = Math.max(0, left - margin)
  const row = Math.max(0, top - margin)
  return {
    col,
    row,
    cols: Math.min(grid.cols, right + 1 + margin) - col,
    rows: Math.min(grid.rows, bottom + 1 + margin) - row,
  }
}

/** The score under every cell of a window, summed up, ready for any box in it to be read off. */
function fieldOver(
  division: Division,
  held: Int32Array,
  index: number,
  window: Box,
  anywhere = false,
): Field {
  const grid = division.grid
  const width = window.cols + 1
  const sums = new Float64Array(width * (window.rows + 1))
  for (let row = 0; row < window.rows; row++)
    for (let col = 0; col < window.cols; col++) {
      const cell = (window.row + row) * grid.cols + window.col + col
      const taken = held[cell] as number
      // A cell another zone already holds is a wall, not a bargain: the rectangle is inscribed in
      // the room's own floor, and what the reaches left ragged between rooms is handed out after.
      const worth =
        !usable(division, cell) || !allowed(division, cell, index) || taken !== NOBODY
          ? BLOCKED
          : division.owner[cell] === index
            ? division.fixed[cell] === WALL
              ? SEEDED
              : MINE
            : division.owner[cell] === NOBODY
              ? anywhere
                ? MINE
                : -SPARE
              : anywhere
                ? MINE
                : BLOCKED
      sums[(row + 1) * width + col + 1] =
        worth +
        (sums[row * width + col + 1] as number) +
        (sums[(row + 1) * width + col] as number) -
        (sums[row * width + col] as number)
    }
  return { col: window.col, row: window.row, cols: window.cols, rows: window.rows, sums }
}

/** The rectangle, or the rectangle and arm, a zone's own cells carry. */
export function coreOf(
  division: Division,
  held: Int32Array,
  room: PartitionRoom,
  index: number,
): Shape | null {
  const cells = ownedBy(division, index)
  if (cells.length === 0) return null
  const grid = division.grid
  const field = fieldOver(division, held, index, windowOf(grid, cells, MARGIN))
  const main = bestBox(field)
  if (!main) return null
  const little = room.targetArea < LITTLE_M2
  const arm = little ? null : bestArm(field, main)
  if (!arm) return { main, arm: null }
  const together = joined(main, arm)
  return together && jogsRun(together) ? together : { main, arm: null }
}

/**
 * Somewhere for a room the division left nothing: the largest free rectangle near its bubble, cut
 * back to about the floor it asked for, from the side furthest from the bubble so what is kept is
 * the part nearest where the room was meant to stand.
 */
export function sparePlaceOf(
  division: Division,
  held: Int32Array,
  room: PartitionRoom,
  index: number,
  target: number,
): Shape | null {
  const grid = division.grid
  const at = Math.max(
    0,
    Math.min(
      grid.cols * grid.rows - 1,
      Math.round((room.at[1] - grid.top) / grid.step) * grid.cols +
        Math.round((room.at[0] - grid.left) / grid.step),
    ),
  )
  const reach = Math.ceil(Math.sqrt(target)) + MARGIN
  const field = fieldOver(division, held, index, windowOf(grid, [at], reach), true)
  const box = bestBox(field)
  if (!box) return null
  const col = at % grid.cols
  const row = (at - col) / grid.cols
  let kept = box
  while (kept.cols * kept.rows > target && Math.max(kept.cols, kept.rows) > JOG) {
    if (kept.cols >= kept.rows && kept.cols > JOG)
      kept = {
        ...kept,
        col: col < kept.col + kept.cols / 2 ? kept.col : kept.col + 1,
        cols: kept.cols - 1,
      }
    else if (kept.rows > JOG)
      kept = {
        ...kept,
        row: row < kept.row + kept.rows / 2 ? kept.row : kept.row + 1,
        rows: kept.rows - 1,
      }
    else break
  }
  return { main: kept, arm: null }
}
