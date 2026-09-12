import { boundingBox, GRID_M, pointInPolygon, type Point, type Polygon } from '../geometry'

/*
 * The floor as the partition divides it: squares of the sheet's own grid laid over the plot, so
 * every zone the division makes is already on the 0.25 m grid and two zones that meet share the
 * whole of the line between them.
 */

/** Where a cell stands: off the plot, inside the buildable line, or on the plot past that line. */
export const OFF = 0
export const INSIDE = 1
export const PAST = 2

export type Grid = {
  /** The west and north lines of the first cell, on the grid. */
  readonly left: number
  readonly top: number
  readonly cols: number
  readonly rows: number
  readonly step: number
  readonly cellArea: number
  /** `OFF`, `INSIDE` or `PAST` for every cell, in row order. */
  readonly place: Uint8Array
}

function onGrid(value: number, step: number): number {
  return Math.floor(value / step) * step
}

/**
 * The grid over a plot. Its lines are the sheet's own, not the plot's corners, so a zone traced
 * from these cells lands on the same quarter-metre a drawn room does.
 */
export function gridOver(plot: Polygon, buildable: Polygon): Grid {
  const step = GRID_M
  const bounds = boundingBox(plot)
  const left = onGrid(bounds.left, step)
  const top = onGrid(bounds.top, step)
  const cols = Math.max(1, Math.ceil((bounds.left + bounds.width - left) / step))
  const rows = Math.max(1, Math.ceil((bounds.top + bounds.depth - top) / step))
  const place = new Uint8Array(cols * rows)
  const holds = buildable.length >= 3
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const at: Point = [left + (col + 0.5) * step, top + (row + 0.5) * step]
      if (!pointInPolygon(plot, at)) continue
      place[row * cols + col] = holds && pointInPolygon(buildable, at) ? INSIDE : PAST
    }
  return { left, top, cols, rows, step, cellArea: step * step, place }
}

export function cellCentre(grid: Grid, index: number): Point {
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  return [grid.left + (col + 0.5) * grid.step, grid.top + (row + 0.5) * grid.step]
}

/** The cell a point falls in, or -1 where the point is off the grid altogether. */
export function cellAt(grid: Grid, x: number, y: number): number {
  const col = Math.floor((x - grid.left) / grid.step)
  const row = Math.floor((y - grid.top) / grid.step)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1
  return row * grid.cols + col
}

/**
 * The cells that share a side with this one, written into `out` and counted back. The caller keeps
 * the array, because the partition asks this of every cell many times over and an array made each
 * time costs more than the rest of the division put together.
 */
export function sidesOfCell(grid: Grid, index: number, out: Int32Array): number {
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  let count = 0
  if (row > 0) out[count++] = index - grid.cols
  if (col > 0) out[count++] = index - 1
  if (col + 1 < grid.cols) out[count++] = index + 1
  if (row + 1 < grid.rows) out[count++] = index + grid.cols
  return count
}
