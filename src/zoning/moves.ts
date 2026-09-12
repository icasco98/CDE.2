import type { Point } from '../geometry'
import { NARROWEST, WIDEST } from './spine'
import { sidesOfCell, type Grid } from './grid'
import { allowed, usable } from './seeds'
import {
  addOn,
  apart,
  armSide,
  cellsOfBox,
  cutOut,
  joined,
  jogsRun,
  moved,
  shapeHolds,
  SIDES,
  slidStep,
  strip,
  touching,
  JOG,
  type Box,
  type Shape,
  type Side,
} from './shape'
import { NOBODY, type Division } from './types'

/*
 * The walls moved. Every zone starts as the rectangle its own cells carried, which leaves floor
 * over between them and every room short of what it asked for; here the walls travel along their
 * own lines, a grid step at a time, always the move that does the storey the most good, until the
 * floor is taken up, the rooms are back on their targets and the pairs the bubbles put together
 * are together again.
 */

/** How deep an arm a zone may put out in one move, in cells: four metres of free floor at once. */
const REACH = 16

/** What a cell of divided floor left outside every zone costs, against a cell of area off target. */
const LEFT_OVER = 0.8

/**
 * What a metre between a zone's middle and its bubble costs, in cells of area. The morph's one
 * promise about where a room ends up is that it is where the bubble was, so a rectangle that would
 * be the right size in the wrong place is worth less than a smaller one standing where it should.
 */
const ADRIFT = 8

/**
 * How far past its target a room may be taken by a wall move. Only the corridor takes what the
 * storey has over, because the corridor is the spine and is measured last; a room that has what it
 * asked for does not go on taking floor just because the floor beside it is going spare.
 */
const OVER = 1.1

/** How many walls are moved before the storey is left as it stands. */
const MOVES = 400

/** The run of wall a seeded contact must keep, in cells: the 0.9 m a small room's door needs. */
const CONTACT = 4

/**
 * What a cell of a seeded contact still owing is worth against a cell of area off target. High,
 * and no move may ever owe more than the one before it: decision 21 says the morph may reshape a
 * pair of rooms and may never part them, so the pairs come first and the areas after.
 */
const CONTACT_WEIGHT = 60

/** What a pair owes while one of the two has no floor at all, in cells of wall. */
const MISSING = 3 * CONTACT

/** A zone as the straightening carries it: what it has become, and what it was asked for. */
export type Zoned = {
  readonly index: number
  shape: Shape | null
  /** In cells, both of them, because a wall moves in whole cells and so does the floor it carries. */
  held: number
  readonly target: number
  /** The floor the room may not be taken under, in cells. */
  readonly floor: number
  readonly weight: number
  /** Where the bubble stood, in cells from the grid's own corner. */
  readonly at: Point
  /**
   * A zone no wall move may touch: a room already built on another storey, and a small room drawn
   * at its target outright. Both are settled before the wall-moving starts and the rest make way.
   */
  pinned: boolean
}

/** A wall on the move: the band of cells it sweeps, and the shape the zone is left with. */
type Moving = {
  readonly zone: number
  readonly shape: Shape
  readonly band: Box
  /** Whether the band is joining the zone or leaving it. */
  readonly out: boolean
  /** The zone on the other side of the wall, or `NOBODY` where the floor there is nobody's. */
  readonly other: number
  readonly otherShape: Shape | null
  /** How many cells the other zone gives up or takes on, which is not always the whole band. */
  readonly otherCells: number
  readonly gain: number
}

function boxOf(shape: Shape, arm: boolean): Box | null {
  return arm ? shape.arm : shape.main
}

/** The shape a zone is left with when one of its rectangles has a whole side moved a step. */
function reshaped(shape: Shape, arm: boolean, side: Side, out: boolean): Shape | null {
  const box = boxOf(shape, arm)
  if (!box) return null
  const next = moved(box, side, out)
  if (next.cols < JOG || next.rows < JOG) return null
  const other = boxOf(shape, !arm)
  const whole = other === null ? { main: next, arm: null } : joined(next, other)
  return whole && jogsRun(whole) ? whole : null
}

/** Where a shape's middle falls, in cells from the grid's own corner. */
function middleOf(shape: Shape): Point {
  const main = shape.main.cols * shape.main.rows
  const arm = shape.arm ? shape.arm.cols * shape.arm.rows : 0
  const mid = (box: Box): Point => [box.col + box.cols / 2, box.row + box.rows / 2]
  const one = mid(shape.main)
  if (!shape.arm) return one
  const other = mid(shape.arm)
  const held = main + arm
  return [(one[0] * main + other[0] * arm) / held, (one[1] * main + other[1] * arm) / held]
}

/** How far a zone's middle stands from its bubble, in cells. */
function adrift(zone: Zoned, shape: Shape | null): number {
  if (!shape) return 0
  const at = middleOf(shape)
  return Math.hypot(at[0] - zone.at[0], at[1] - zone.at[1])
}

/** How much of the divided floor no zone has taken up. */
function looseCells(division: Division, held: Int32Array): number {
  let loose = 0
  for (let cell = 0; cell < division.owner.length; cell++)
    if (division.owner[cell] !== NOBODY && held[cell] === NOBODY) loose += 1
  return loose
}

/**
 * What a pair of rooms the bubbles put together still owes: the wall a door needs that they have
 * not yet got, and the floor between them where they have come apart altogether. Decision 21 says
 * the morph may reshape a pair of rooms and may never part them, and the rectangles do part them,
 * so the walls are moved until the pairs are back together and never moved apart again.
 */
function owed(one: Shape | null, other: Shape | null): number {
  // A room the fitting left nothing owes more than any pair that at least stands on the same floor,
  // so putting it down anywhere near its partner reads as making the pair rather than breaking it.
  if (!one || !other) return MISSING
  const run = touching(one, other)
  return CONTACT - Math.min(CONTACT, run) + (run > 0 ? 0 : apart(one, other))
}

/** What the seeded contacts round one or two zones owe, as the shapes stand or as a move leaves them. */
export function contactsOwed(
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  shapes: ReadonlyMap<number, Shape | null>,
): number {
  let total = 0
  for (const [one, other] of contacts) {
    if (!shapes.has(one) && !shapes.has(other)) continue
    const a = shapes.has(one) ? (shapes.get(one) as Shape | null) : (zoned[one]?.shape ?? null)
    const b = shapes.has(other)
      ? (shapes.get(other) as Shape | null)
      : (zoned[other]?.shape ?? null)
    total += owed(a, b)
  }
  return total
}

/** What moving one wall over one band of cells would do, or nothing where it cannot be done. */
function weigh(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  corridor: number,
  loose: number,
  zone: number,
  band: Box,
  next: Shape,
  out: boolean,
  side: Side,
): Moving | null {
  const grid = division.grid
  const mine = zoned[zone] as Zoned
  const shape = mine.shape
  if (!shape || !jogsRun(next)) return null
  if (zone === corridor && tooWide(next)) return null
  const cells = cellsOfBox(grid, band)
  if (cells.length !== band.cols * band.rows || cells.length === 0) return null
  let other = NOBODY
  for (const cell of cells) {
    if (!usable(division, cell) || !allowed(division, cell, zone)) return null
    if (out) {
      const col = cell % grid.cols
      if (shapeHolds(shape, col, (cell - col) / grid.cols)) return null
      const taken = held[cell] as number
      if (taken !== NOBODY && other !== NOBODY && taken !== other) return null
      if (taken !== NOBODY) other = taken
    }
  }
  if (!out) other = beyond(division, held, band, side, zone)
  let otherShape: Shape | null = null
  let taking: Box | null = null
  if (other !== NOBODY) {
    const neighbour = zoned[other] as Zoned
    if (!neighbour.shape || neighbour.pinned) return null
    if (!cells.every((cell) => allowed(division, cell, other))) return null
    // Only the part of the band the neighbour actually holds leaves it; the rest was floor nobody
    // held. That part has to be a block of its own, or what the neighbour is left with is not a
    // shape and the move is not one a wall could make.
    taking = out ? blockOf(grid, cells, held, other) : band
    if (!taking) return null
    otherShape = out ? cutOut(neighbour.shape, taking) : addOn(neighbour.shape, taking)
    if (!otherShape) return null
    if (out && neighbour.held - taking.cols * taking.rows < neighbour.floor) return null
    if (other === corridor && tooWide(otherShape)) return null
  }
  const shapes = new Map<number, Shape | null>([[zone, next]])
  if (other !== NOBODY) shapes.set(other, otherShape)
  const before = new Map<number, Shape | null>([[zone, mine.shape]])
  if (other !== NOBODY) before.set(other, (zoned[other] as Zoned).shape)
  const owing = contactsOwed(zoned, contacts, before) - contactsOwed(zoned, contacts, shapes)
  let after = loose
  for (const cell of cells) {
    if ((division.owner[cell] as number) === NOBODY) continue
    if (out && (held[cell] as number) === NOBODY) after -= 1
    if (!out && other === NOBODY) after += 1
  }
  const step = cells.length * (out ? 1 : -1)
  if (out && owing === 0 && zone !== corridor && mine.held + step > mine.target * OVER) return null
  const neighbour = other === NOBODY ? null : (zoned[other] as Zoned)
  const theirs = (taking === null ? 0 : taking.cols * taking.rows) * (out ? -1 : 1)
  const step0 = ADRIFT * division.grid.step
  const gain =
    owing * CONTACT_WEIGHT +
    (loose - after) * LEFT_OVER +
    step0 * (adrift(mine, mine.shape) - adrift(mine, next)) +
    (neighbour === null
      ? 0
      : step0 * (adrift(neighbour, neighbour.shape) - adrift(neighbour, otherShape))) +
    mine.weight * (Math.abs(mine.held - mine.target) - Math.abs(mine.held + step - mine.target)) +
    (neighbour === null
      ? 0
      : neighbour.weight *
        (Math.abs(neighbour.held - neighbour.target) -
          Math.abs(neighbour.held + theirs - neighbour.target)))
  return { zone, shape: next, band, out, other, otherShape, otherCells: Math.abs(theirs), gain }
}

/** The cells of a band one zone holds, as a block; nothing where they do not make one. */
function blockOf(grid: Grid, cells: readonly number[], held: Int32Array, zone: number): Box | null {
  let left = grid.cols
  let right = -1
  let top = grid.rows
  let bottom = -1
  let count = 0
  for (const cell of cells) {
    if ((held[cell] as number) !== zone) continue
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    left = Math.min(left, col)
    right = Math.max(right, col)
    top = Math.min(top, row)
    bottom = Math.max(bottom, row)
    count += 1
  }
  if (count === 0) return null
  const box: Box = { col: left, row: top, cols: right - left + 1, rows: bottom - top + 1 }
  return box.cols * box.rows === count ? box : null
}

/** Which zone, if any, holds the whole of the floor just beyond a band that is being let go. */
function beyond(division: Division, held: Int32Array, band: Box, side: Side, zone: number): number {
  const grid = division.grid
  const away = side === 0 ? -grid.cols : side === 2 ? grid.cols : side === 3 ? -1 : 1
  let other = NOBODY
  for (const cell of cellsOfBox(grid, band)) {
    const past = cell + away
    if (past < 0 || past >= held.length) return NOBODY
    const taken = held[past] as number
    if (taken === zone || taken === NOBODY) return NOBODY
    if (other !== NOBODY && taken !== other) return NOBODY
    other = taken
  }
  return other
}

/**
 * Whether a shape is one the corridor may not have: the Municipality's 1.20 m clear at its
 * narrowest and no more than 2.4 m at its widest, on the arm as much as on the run, so a corridor
 * that turns a corner to reach the room at the end of it is still a corridor and not a room.
 */
function tooWide(shape: Shape): boolean {
  for (const box of [shape.main, shape.arm]) {
    if (!box) continue
    const across = Math.min(box.cols, box.rows)
    if (across < NARROWEST || across > WIDEST) return true
  }
  // The step at the inside of the turn is a wall of the corridor too, so it keeps the same clear
  // width; a stub of a metre there would be a corner nobody could carry anything round.
  if (shape.arm === null) return false
  return shape.main.rows - shape.arm.rows < NARROWEST
}

/**
 * An arm standing against one side of a rectangle, `depth` cells deep, running `reach` cells from
 * one end of that side. The whole of it lies outside the rectangle, which is what makes the two of
 * them an L rather than a rectangle with a bite out of it.
 */
function armOn(box: Box, side: Side, flush: boolean, depth: number, reach: number): Box {
  const across = side === 0 || side === 2
  const along = across ? box.cols : box.rows
  const from = flush ? 0 : along - reach
  if (across)
    return {
      col: box.col + from,
      row: side === 0 ? box.row - depth : box.row + box.rows,
      cols: reach,
      rows: depth,
    }
  return {
    col: side === 3 ? box.col - depth : box.col + box.cols,
    row: box.row + from,
    cols: depth,
    rows: reach,
  }
}

/** How far the free floor beside one side of a rectangle runs, layer by layer out from it. */
function freeRuns(
  division: Division,
  held: Int32Array,
  zone: number,
  box: Box,
  side: Side,
  flush: boolean,
): readonly number[] {
  const grid = division.grid
  const across = side === 0 || side === 2
  const along = across ? box.cols : box.rows
  const runs: number[] = []
  let common = along
  for (let depth = 1; depth <= REACH; depth++) {
    const band = armOn(box, side, flush, depth, along)
    const line = across
      ? { col: band.col, row: side === 0 ? box.row - depth : box.row + box.rows + depth - 1 }
      : { col: side === 3 ? box.col - depth : box.col + box.cols + depth - 1, row: band.row }
    let reach = 0
    for (let step = 0; step < along; step++) {
      const at = flush ? step : along - 1 - step
      const col = across ? line.col + at : line.col
      const row = across ? line.row : line.row + at
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) break
      const cell = row * grid.cols + col
      if (!usable(division, cell) || !allowed(division, cell, zone)) break
      if ((held[cell] as number) !== NOBODY) break
      reach += 1
    }
    common = Math.min(common, reach)
    runs.push(common)
    if (common === 0) break
  }
  return runs
}

/**
 * Every move one zone has: each of its walls a step out or a step in, and, where the floor beside
 * it is free for only part of a wall's length, that part alone as a new arm. The second is what
 * lets a room reach past the corner of the room beside it without leaving a jog no wall could turn.
 */
function movesOf(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  corridor: number,
  loose: number,
  zone: Zoned,
  out: (moving: Moving) => void,
): void {
  const shape = zone.shape
  if (!shape || zone.pinned) return
  const weighing = (band: Box, next: Shape, going: boolean, side: Side): void => {
    const moving = weigh(
      division,
      held,
      zoned,
      contacts,
      corridor,
      loose,
      zone.index,
      band,
      next,
      going,
      side,
    )
    if (moving) out(moving)
  }
  for (const arm of [false, true]) {
    const box = boxOf(shape, arm)
    if (!box) continue
    for (const side of SIDES)
      for (const going of [true, false]) {
        const next = reshaped(shape, arm, side, going)
        if (next) weighing(strip(box, side, going), next, going, side)
      }
  }
  if (shape.arm !== null) {
    // A zone over its target gives back its whole arm at once: a shape may hold one arm or none,
    // so an arm can never be whittled away a step at a time.
    weighing(shape.arm, { main: shape.main, arm: null }, false, 0)
    const side = armSide(shape)
    for (const going of [true, false]) {
      const slid = slidStep(shape, going)
      if (slid && side !== null) weighing(slid.band, slid.shape, going, side)
    }
    return
  }
  for (const side of SIDES)
    for (const flush of [true, false]) {
      const runs = freeRuns(division, held, zone.index, shape.main, side, flush)
      const along = side === 0 || side === 2 ? shape.main.cols : shape.main.rows
      for (const [at, reach] of runs.entries()) {
        const depth = at + 1
        if (depth < JOG || reach < JOG || reach >= along || along - reach < JOG) continue
        const band = armOn(shape.main, side, flush, depth, reach)
        const next = joined(shape.main, band)
        if (next) weighing(band, next, true, side)
      }
    }
}

/**
 * The walls moved. One wall at a time, always the move that does the storey the most good: the
 * floor the rectangles left over is taken up, a room short of its target grows into the room beside
 * it that has floor to spare, and no wall moves where it would part a pair the bubbles put together.
 */
export function settle(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  corridor: number,
): void {
  let loose = looseCells(division, held)
  for (let move = 0; move < MOVES; move++) {
    let best: Moving | null = null
    for (const zone of zoned)
      movesOf(division, held, zoned, contacts, corridor, loose, zone, (moving) => {
        if (moving.gain <= 1e-9) return
        if (!best || moving.gain > best.gain) best = moving
      })
    const taken: Moving | null = best
    if (!taken) return
    loose = apply(division, held, zoned, taken, loose)
  }
}

/** One move made: the cells change hands, and both zones take the shapes the move left them. */
function apply(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  moving: Moving,
  loose: number,
): number {
  const cells = cellsOfBox(division.grid, moving.band)
  let after = loose
  for (const cell of cells) {
    if ((division.owner[cell] as number) !== NOBODY) {
      if (moving.out && (held[cell] as number) === NOBODY) after -= 1
      if (!moving.out && moving.other === NOBODY) after += 1
    }
    held[cell] = moving.out ? moving.zone : moving.other
  }
  const zone = zoned[moving.zone] as Zoned
  zone.shape = moving.shape
  zone.held += cells.length * (moving.out ? 1 : -1)
  if (moving.other !== NOBODY) {
    const neighbour = zoned[moving.other] as Zoned
    neighbour.shape = moving.otherShape
    neighbour.held += moving.otherCells * (moving.out ? -1 : 1)
  }
  return after
}

/* --------------------------------------------------------------------------------- the last holes */

/** One array, reused: the cells sharing a side with the cell being looked at. */
const beside = new Int32Array(4)

/**
 * A pocket of floor the shapes closed round is not a plan: a room with a hole in it is not a room
 * and the sheet would draw a gap. Each pocket is given to whichever zone can reach it by moving
 * one of its walls out; a pocket no zone can reach at all is left, and the tests say so.
 */
export function closePockets(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  corridor: number,
): void {
  for (let round = 0; round < MOVES; round++) {
    const pockets = new Set(pocketsIn(division, held))
    if (pockets.size === 0) return
    let best: Moving | null = null
    for (const zone of zoned)
      movesOf(division, held, zoned, contacts, corridor, 0, zone, (moving) => {
        if (!moving.out) return
        const taking = cellsOfBox(division.grid, moving.band).filter((cell) => pockets.has(cell))
        if (taking.length === 0) return
        if (!best || taking.length > cellsOfBox(division.grid, best.band).length) best = moving
      })
    const taken: Moving | null = best
    if (!taken) return
    apply(division, held, zoned, taken, 0)
  }
}

/** Every cell no zone holds that the floor outside the house cannot be walked to from. */
function pocketsIn(division: Division, held: Int32Array): readonly number[] {
  const grid = division.grid
  const open = new Uint8Array(grid.cols * grid.rows)
  const queue: number[] = []
  for (let cell = 0; cell < open.length; cell++) {
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    const edge = col === 0 || row === 0 || col + 1 === grid.cols || row + 1 === grid.rows
    if (!edge || held[cell] !== NOBODY || open[cell] === 1) continue
    open[cell] = 1
    queue.push(cell)
  }
  while (queue.length > 0) {
    const cell = queue.pop() as number
    for (let side = sidesOfCell(grid, cell, beside); side-- > 0;) {
      const other = beside[side] as number
      if (open[other] === 1 || held[other] !== NOBODY) continue
      open[other] = 1
      queue.push(other)
    }
  }
  const shut: number[] = []
  for (let cell = 0; cell < open.length; cell++)
    if (open[cell] === 0 && held[cell] === NOBODY) shut.push(cell)
  return shut
}
