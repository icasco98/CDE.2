import type { Grid } from './grid'

/*
 * What a straightened zone is allowed to be. Decision 19's ruling is that walls run: a room is a
 * rectangle, or a rectangle with one rectangular arm, and nothing else. Both are read off the grid
 * as blocks of cells, so a zone traced from them turns four corners or six and no others.
 */

/** A block of the grid: the columns [col, col + cols) and the rows [row, row + rows). */
export type Box = {
  readonly col: number
  readonly row: number
  readonly cols: number
  readonly rows: number
}

/** A rectangle, or a rectangle with one rectangular arm, which is the L. */
export type Shape = { readonly main: Box; readonly arm: Box | null }

/** The shortest wall a zone may turn on, in cells: the brief's metre on the 0.25 m grid. */
export const JOG = 4

function boxHolds(box: Box, col: number, row: number): boolean {
  return col >= box.col && col < box.col + box.cols && row >= box.row && row < box.row + box.rows
}

export function shapeHolds(shape: Shape, col: number, row: number): boolean {
  return boxHolds(shape.main, col, row) || (shape.arm !== null && boxHolds(shape.arm, col, row))
}

/** Every cell of a box on the grid, in row order, dropping whatever falls off the grid. */
export function cellsOfBox(grid: Grid, box: Box): readonly number[] {
  const out: number[] = []
  const lastCol = Math.min(grid.cols, box.col + box.cols)
  const lastRow = Math.min(grid.rows, box.row + box.rows)
  for (let row = Math.max(0, box.row); row < lastRow; row++)
    for (let col = Math.max(0, box.col); col < lastCol; col++) out.push(row * grid.cols + col)
  return out
}

export function cellsOfShape(grid: Grid, shape: Shape): readonly number[] {
  const main = cellsOfBox(grid, shape.main)
  return shape.arm === null ? main : [...main, ...cellsOfBox(grid, shape.arm)]
}

/** One run of columns holding the same rows: the rectangle a shape is made of, read off the cells. */
type Run = {
  readonly col: number
  readonly cols: number
  readonly row: number
  readonly rows: number
}

/**
 * The shape a set of cells makes, or nothing where the cells are not one. Every rectangle and
 * every L comes out as one or two runs of columns holding the one same stretch of rows; anything
 * else — a Z, a T, a hole, two pieces — is not a shape and is what the repair is for.
 */
export function shapeOfCells(grid: Grid, cells: readonly number[]): Shape | null {
  if (cells.length === 0) return null
  const columns = new Map<number, { lo: number; hi: number; held: number }>()
  for (const cell of cells) {
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    const seen = columns.get(col)
    if (!seen) columns.set(col, { lo: row, hi: row, held: 1 })
    else {
      seen.lo = Math.min(seen.lo, row)
      seen.hi = Math.max(seen.hi, row)
      seen.held += 1
    }
  }
  const order = [...columns.keys()].sort((one, other) => one - other)
  const first = order[0] as number
  for (const [at, col] of order.entries()) {
    if (col !== first + at) return null
    const span = columns.get(col) as { lo: number; hi: number; held: number }
    if (span.hi - span.lo + 1 !== span.held) return null
  }
  const runs: Run[] = []
  for (const col of order) {
    const span = columns.get(col) as { lo: number; hi: number; held: number }
    const last = runs[runs.length - 1]
    if (last && last.row === span.lo && last.rows === span.hi - span.lo + 1)
      runs[runs.length - 1] = { ...last, cols: last.cols + 1 }
    else runs.push({ col, cols: 1, row: span.lo, rows: span.hi - span.lo + 1 })
  }
  if (runs.length === 1) {
    const only = runs[0] as Run
    return { main: { col: only.col, row: only.row, cols: only.cols, rows: only.rows }, arm: null }
  }
  if (runs.length !== 2) return null
  const one = runs[0] as Run
  const other = runs[1] as Run
  const flushTop = one.row === other.row
  const flushBottom = one.row + one.rows === other.row + other.rows
  // Flush at both ends is a rectangle, which the run-joining above would already have made one;
  // flush at neither is a Z, and a Z turns eight corners.
  if (flushTop === flushBottom) return null
  const tall = one.rows >= other.rows ? one : other
  const short = one.rows >= other.rows ? other : one
  return {
    main: { col: tall.col, row: tall.row, cols: tall.cols, rows: tall.rows },
    arm: { col: short.col, row: short.row, cols: short.cols, rows: short.rows },
  }
}

/** Two rectangles put together where they make a rectangle or an L; nothing where they do not. */
export function joined(one: Box, other: Box): Shape | null {
  return (
    besideColumns(one, other) ??
    besideColumns(other, one) ??
    besideRows(one, other) ??
    besideRows(other, one)
  )
}

/** The second rectangle standing east of the first, flush with one end of its side or with both. */
function besideColumns(a: Box, b: Box): Shape | null {
  if (b.col !== a.col + a.cols) return null
  const top = a.row === b.row
  const bottom = a.row + a.rows === b.row + b.rows
  if (top && bottom) return { main: { ...a, cols: a.cols + b.cols }, arm: null }
  // Flush at neither end is a Z, and a Z turns eight corners; a room turns four or six.
  if (top === bottom) return null
  return a.rows >= b.rows ? { main: a, arm: b } : { main: b, arm: a }
}

/** The second rectangle standing south of the first, on the same terms. */
function besideRows(a: Box, b: Box): Shape | null {
  if (b.row !== a.row + a.rows) return null
  const left = a.col === b.col
  const right = a.col + a.cols === b.col + b.cols
  if (left && right) return { main: { ...a, rows: a.rows + b.rows }, arm: null }
  if (left === right) return null
  return a.cols >= b.cols ? { main: a, arm: b } : { main: b, arm: a }
}

/** The sides of a box, in the order north, east, south, west. */
export const SIDES = [0, 1, 2, 3] as const
export type Side = (typeof SIDES)[number]

/** The box with one of its sides moved a step out, or a step in where `out` is false. */
export function moved(box: Box, side: Side, out: boolean): Box {
  const step = out ? 1 : -1
  if (side === 0) return { ...box, row: box.row - step, rows: box.rows + step }
  if (side === 2) return { ...box, rows: box.rows + step }
  if (side === 3) return { ...box, col: box.col - step, cols: box.cols + step }
  return { ...box, cols: box.cols + step }
}

/** The line of cells one step outside a side of a box, or its outermost line where `out` is false. */
export function strip(box: Box, side: Side, out: boolean): Box {
  if (side === 0) return { ...box, row: out ? box.row - 1 : box.row, rows: 1 }
  if (side === 2) return { ...box, row: box.row + box.rows - (out ? 0 : 1), rows: 1 }
  if (side === 3) return { ...box, col: out ? box.col - 1 : box.col, cols: 1 }
  return { ...box, col: box.col + box.cols - (out ? 0 : 1), cols: 1 }
}

/** How much wall two shapes hold in common, in cells: the longest run where their sides meet. */
export function touching(one: Shape, other: Shape): number {
  let longest = 0
  for (const a of [one.main, one.arm])
    for (const b of [other.main, other.arm]) {
      if (!a || !b) continue
      const across =
        a.col + a.cols === b.col || b.col + b.cols === a.col
          ? Math.min(a.row + a.rows, b.row + b.rows) - Math.max(a.row, b.row)
          : 0
      const down =
        a.row + a.rows === b.row || b.row + b.rows === a.row
          ? Math.min(a.col + a.cols, b.col + b.cols) - Math.max(a.col, b.col)
          : 0
      longest = Math.max(longest, across, down)
    }
  return longest
}

function sameBox(one: Box, other: Box): boolean {
  return (
    one.col === other.col &&
    one.row === other.row &&
    one.cols === other.cols &&
    one.rows === other.rows
  )
}

function insideBox(box: Box, part: Box): boolean {
  return (
    part.col >= box.col &&
    part.row >= box.row &&
    part.col + part.cols <= box.col + box.cols &&
    part.row + part.rows <= box.row + box.rows
  )
}

/**
 * The shape left when a block is taken out of one of its rectangles, or nothing where what is left
 * would be neither. A slab off one end leaves a rectangle and a block off one corner leaves an L,
 * which is how a room gives a neighbour the floor it needs without either of them losing its walls.
 */
export function cutOut(shape: Shape, band: Box): Shape | null {
  if (shape.arm && sameBox(shape.arm, band))
    return jogsRun({ main: shape.main, arm: null }) ? { main: shape.main, arm: null } : null
  const inMain = insideBox(shape.main, band)
  const box = inMain ? shape.main : shape.arm
  if (!box || (!inMain && !insideBox(box, band))) return null
  const other = inMain ? shape.arm : shape.main
  const left = band.col === box.col
  const right = band.col + band.cols === box.col + box.cols
  const top = band.row === box.row
  const bottom = band.row + band.rows === box.row + box.rows
  if (left && right && top && bottom) return null
  const whole = (kept: Box): Shape | null => {
    const made = other === null ? { main: kept, arm: null } : joined(kept, other)
    return made && jogsRun(made) ? made : null
  }
  if (left && right && (top || bottom))
    return whole({ ...box, row: top ? box.row + band.rows : box.row, rows: box.rows - band.rows })
  if (top && bottom && (left || right))
    return whole({ ...box, col: left ? box.col + band.cols : box.col, cols: box.cols - band.cols })
  // A block off a corner leaves two runs of columns; that is an L, and only where the rectangle
  // it came out of was the whole shape, because a shape may carry one arm and never two.
  if (other !== null || !(left || right) || !(top || bottom)) return null
  const tall: Box = {
    ...box,
    col: left ? box.col + band.cols : box.col,
    cols: box.cols - band.cols,
  }
  const short: Box = {
    col: left ? box.col : box.col + box.cols - band.cols,
    row: top ? box.row + band.rows : box.row,
    cols: band.cols,
    rows: box.rows - band.rows,
  }
  const made = joined(tall, short)
  return made && jogsRun(made) ? made : null
}

/** The shape a rectangle of floor joins, or nothing where the two of them make neither shape. */
export function addOn(shape: Shape, band: Box): Shape | null {
  if (shape.arm === null) {
    const merged = joined(shape.main, band)
    return merged && jogsRun(merged) ? merged : null
  }
  for (const box of [shape.main, shape.arm]) {
    const other = box === shape.main ? shape.arm : shape.main
    const merged = joined(box, band)
    if (!merged || merged.arm !== null) continue
    const whole = joined(merged.main, other)
    if (whole && jogsRun(whole)) return whole
  }
  return null
}

/** Which side of the rectangle the arm stands on, or nothing where the shape has no arm. */
export function armSide(shape: Shape): Side | null {
  const main = shape.main
  const arm = shape.arm
  if (!arm) return null
  if (arm.row + arm.rows === main.row) return 0
  if (arm.col === main.col + main.cols) return 1
  if (arm.row === main.row + main.rows) return 2
  if (arm.col + arm.cols === main.col) return 3
  return null
}

/**
 * The step of an L slid a cell along: the rectangle grows towards its arm and the arm gives up the
 * same cell, or the other way about. What changes hands is the part of that line the arm does not
 * already stand on, which is where a half-metre sliver of floor between two rooms goes.
 */
export function slidStep(shape: Shape, out: boolean): { shape: Shape; band: Box } | null {
  const side = armSide(shape)
  const arm = shape.arm
  if (side === null || !arm) return null
  const main = shape.main
  const back = ((side + 2) % 4) as Side
  const grown = moved(main, side, out)
  const shrunk = moved(arm, back, !out)
  if (shrunk.cols < JOG || shrunk.rows < JOG || grown.cols < JOG || grown.rows < JOG) return null
  const made = joined(grown, shrunk)
  if (!made || !jogsRun(made)) return null
  const line = strip(main, side, out)
  const across = side === 0 || side === 2
  const over = across ? arm.cols : arm.rows
  const flush = across ? arm.col === main.col : arm.row === main.row
  const band: Box = across
    ? { ...line, col: flush ? line.col + over : line.col, cols: line.cols - over }
    : { ...line, row: flush ? line.row + over : line.row, rows: line.rows - over }
  if (band.cols <= 0 || band.rows <= 0) return null
  return { shape: made, band }
}

/** How far apart two shapes stand, in cells: nought where they meet, along and across added up. */
export function apart(one: Shape, other: Shape): number {
  let nearest = Infinity
  for (const a of [one.main, one.arm])
    for (const b of [other.main, other.arm]) {
      if (!a || !b) continue
      const across = Math.max(0, a.col - (b.col + b.cols), b.col - (a.col + a.cols))
      const down = Math.max(0, a.row - (b.row + b.rows), b.row - (a.row + a.rows))
      nearest = Math.min(nearest, across + down)
    }
  return nearest === Infinity ? 0 : nearest
}

/** Whether every wall of a shape runs at least the metre a jog is allowed to be. */
export function jogsRun(shape: Shape): boolean {
  const main = shape.main
  if (main.cols < JOG || main.rows < JOG) return false
  if (shape.arm === null) return true
  const arm = shape.arm
  if (arm.cols < JOG || arm.rows < JOG) return false
  return main.rows - arm.rows >= JOG
}
