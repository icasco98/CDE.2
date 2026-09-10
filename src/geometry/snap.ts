import { edgesOf, nearestPointOnSegment, type Rect } from './polygon'
import type { Point, Polygon } from './types'

/** The sheet grid, in metres. */
export const GRID_M = 0.25

/** A gap this small is already touching, and closing it would be a move nobody asked for. */
const CLOSED_M = 0.02

/** Within about five degrees: a wall only snaps flush against one running the same way. */
const PARALLEL_SIN = 0.09

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_M) * GRID_M
}

export function snapPointToGrid(p: Point): Point {
  return [snapToGrid(p[0]), snapToGrid(p[1])]
}

function overlapAlong(aLow: number, aHigh: number, bLow: number, bHigh: number): number {
  return Math.min(aHigh, bHigh) - Math.max(aLow, bLow)
}

/** The gap to the nearest facing neighbour along one axis, if one is within reach. */
function gapToNeighbour(
  rect: Rect,
  neighbours: readonly Rect[],
  axis: 'x' | 'y',
  reach: number,
): number | null {
  let best = Infinity
  let delta: number | null = null
  for (const other of neighbours) {
    const facing =
      axis === 'x'
        ? overlapAlong(rect.top, rect.top + rect.depth, other.top, other.top + other.depth)
        : overlapAlong(rect.left, rect.left + rect.width, other.left, other.left + other.width)
    if (facing <= 0) continue
    const ahead =
      axis === 'x' ? other.left - (rect.left + rect.width) : other.top - (rect.top + rect.depth)
    const behind =
      axis === 'x' ? rect.left - (other.left + other.width) : rect.top - (other.top + other.depth)
    if (ahead > CLOSED_M && ahead < reach && ahead < best) {
      best = ahead
      delta = ahead
    }
    if (behind > CLOSED_M && behind < reach && behind < best) {
      best = behind
      delta = -behind
    }
  }
  return delta
}

/** A moved rectangle slid up against whichever facing neighbours are within `reach`. */
export function snapRectangleToNeighbours(
  rect: Rect,
  neighbours: readonly Rect[],
  reach: number,
): Rect {
  const dx = gapToNeighbour(rect, neighbours, 'x', reach) ?? 0
  const moved = { ...rect, left: rect.left + dx }
  const dy = gapToNeighbour(moved, neighbours, 'y', reach) ?? 0
  return { ...moved, top: moved.top + dy }
}

/**
 * The point on `outlines` a dragged corner should land on: one of their own corners within
 * `reach` if there is one, else the nearest point along a wall, else nothing. Corners win at
 * equal reach, since landing exactly on another room's corner is the more useful alignment.
 * Every polygon here is read in whichever one frame the caller put them in.
 */
export function nearestNeighbourPoint(
  p: Point,
  outlines: readonly Polygon[],
  reach: number,
): Point | null {
  let corner: Point | null = null
  let cornerDistance = reach
  let wall: Point | null = null
  let wallDistance = reach
  for (const polygon of outlines) {
    for (const [a, b] of edgesOf(polygon)) {
      const toCorner = Math.hypot(p[0] - a[0], p[1] - a[1])
      if (toCorner < cornerDistance) {
        cornerDistance = toCorner
        corner = a
      }
      const q = nearestPointOnSegment(p, a, b)
      const toWall = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (toWall < wallDistance) {
        wallDistance = toWall
        wall = q
      }
    }
  }
  return corner ?? wall
}

/**
 * The extra push along `normal` that would bring the wall `a`-`b` flush with a parallel wall of
 * `outlines` within `reach`, or 0 when none is. Read in the same one frame as the outlines.
 */
export function wallSnapOffset(
  a: Point,
  b: Point,
  normal: Point,
  outlines: readonly Polygon[],
  reach: number,
): number {
  const wx = b[0] - a[0]
  const wy = b[1] - a[1]
  const length = Math.hypot(wx, wy)
  if (length < 1e-6) return 0
  const ux = wx / length
  const uy = wy / length
  let best = 0
  let bestGap = reach
  for (const polygon of outlines) {
    for (const [p, q] of edgesOf(polygon)) {
      const ex = q[0] - p[0]
      const ey = q[1] - p[1]
      const edgeLength = Math.hypot(ex, ey)
      if (edgeLength < 1e-6) continue
      if (Math.abs(ux * (ey / edgeLength) - uy * (ex / edgeLength)) > PARALLEL_SIN) continue
      const gap = (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]
      if (Math.abs(gap) < bestGap) {
        bestGap = Math.abs(gap)
        best = gap
      }
    }
  }
  return best
}
