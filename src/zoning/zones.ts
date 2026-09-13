import { signedArea, type Point, type Polygon } from '../geometry'
import type { Grid } from './grid'
import type { Division } from './types'

/*
 * From cells to shapes. A zone is the outline of the cells one room holds: one ring, because a
 * footprint is one polygon and a room with a hole in it is not a room.
 */

/** The cells one room holds, in index order. */
export function cellsOf(division: Division, room: number): readonly number[] {
  const out: number[] = []
  for (let index = 0; index < division.owner.length; index++)
    if (division.owner[index] === room) out.push(index)
  return out
}

/** The corners of a cell, clockwise on the sheet, which is the winding a footprint's polygon has. */
function cornersOf(grid: Grid, index: number): readonly [Point, Point, Point, Point] {
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  const x = grid.left + col * grid.step
  const y = grid.top + row * grid.step
  return [
    [x, y],
    [x + grid.step, y],
    [x + grid.step, y + grid.step],
    [x, y + grid.step],
  ]
}

function keyOf(at: Point): string {
  return `${at[0].toFixed(4)}|${at[1].toFixed(4)}`
}

/** Runs of collinear corners are one wall, so a zone is drawn with the corners it really turns at. */
function straightened(ring: readonly Point[]): Polygon {
  const out: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const before = ring[(i + ring.length - 1) % ring.length] as Point
    const here = ring[i] as Point
    const after = ring[(i + 1) % ring.length] as Point
    const turn =
      (here[0] - before[0]) * (after[1] - here[1]) - (here[1] - before[1]) * (after[0] - here[0])
    if (Math.abs(turn) > 1e-9) out.push(here)
  }
  return out
}

/**
 * The outline of a set of cells: every side of a cell the set does not hold on its other side,
 * chained into rings. At a corner where the set touches itself the ring turns as tightly as it
 * can, which keeps two rings apart rather than joining them into a figure of eight.
 */
export function outlineOfCells(grid: Grid, cells: readonly number[]): readonly Polygon[] {
  const held = new Set(cells)
  const edges: Side[] = []
  const byStart = new Map<string, Side[]>()
  const put = (from: Point, to: Point): void => {
    const side: Side = { from, to, walked: false }
    edges.push(side)
    const key = keyOf(from)
    byStart.set(key, [...(byStart.get(key) ?? []), side])
  }
  for (const index of cells) {
    const [a, b, c, d] = cornersOf(grid, index)
    const col = index % grid.cols
    const row = (index - col) / grid.cols
    if (row === 0 || !held.has(index - grid.cols)) put(a, b)
    if (col + 1 === grid.cols || !held.has(index + 1)) put(b, c)
    if (row + 1 === grid.rows || !held.has(index + grid.cols)) put(c, d)
    if (col === 0 || !held.has(index - 1)) put(d, a)
  }
  const rings: Polygon[] = []
  for (const seed of edges) {
    if (seed.walked) continue
    const ring: Point[] = []
    let side = seed
    while (!side.walked) {
      side.walked = true
      ring.push(side.from)
      const onward = (byStart.get(keyOf(side.to)) ?? []).filter((each) => !each.walked)
      const next = onward.length === 1 ? onward[0] : tightest(side, onward)
      if (!next) break
      side = next
    }
    const shape = straightened(ring)
    if (shape.length >= 3) rings.push(shape)
  }
  return rings
}

/** One side of one cell that the room does not hold on its other side: a piece of the outline. */
type Side = { readonly from: Point; readonly to: Point; walked: boolean }

/** The tightest turn out of a corner, keeping the floor on the same hand all the way round. */
function tightest(came: Side, waiting: readonly Side[]): Side | undefined {
  const was: Point = [came.to[0] - came.from[0], came.to[1] - came.from[1]]
  let best: Side | undefined
  let bestTurn = -Infinity
  for (const side of waiting) {
    const going: Point = [side.to[0] - came.to[0], side.to[1] - came.to[1]]
    // Positive is a turn towards the floor the ring keeps on its right, so the sharpest of those
    // comes first and a run that touches itself at a corner comes out as two rings, not one.
    const turn = was[0] * going[1] - was[1] * going[0]
    const back = was[0] * going[0] + was[1] * going[1] < 0 ? -2 : 0
    const score = (turn > 0 ? 1 : turn < 0 ? -1 : 0) + back
    if (score <= bestTurn) continue
    bestTurn = score
    best = side
  }
  return best
}

/** The one ring a zone is: its outline's largest, which is the only one a footprint can carry. */
export function zoneOfCells(grid: Grid, cells: readonly number[]): Polygon {
  let largest: Polygon = []
  let most = 0
  for (const ring of outlineOfCells(grid, cells)) {
    const held = Math.abs(signedArea(ring))
    if (held <= most) continue
    most = held
    largest = signedArea(ring) >= 0 ? ring : [...ring].reverse()
  }
  return largest
}
