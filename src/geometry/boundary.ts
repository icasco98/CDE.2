import { outlineOf, translateFootprint } from './footprint'
import { boundingBox, edgesOf, signedArea, type Rect } from './polygon'
import type { Footprint, Point, Polygon } from './types'

/** A millimetre: floating point puts an edge a hair either side of the boundary, and a footprint 0.0001 m over the line is on it. */
const TOLERANCE = 1e-3

/** The boundary is read as convex: every edge of it is a wall the whole sheet-side of which is out. A concave boundary is not yet handled. */
type Wall = { readonly nx: number; readonly ny: number; readonly depth: number }

/** One wall per boundary edge, each carrying how far `polygon` reaches past it. */
function wallsOf(polygon: Polygon, boundary: Polygon): Wall[] {
  const outward = signedArea(boundary) >= 0 ? 1 : -1
  const walls: Wall[] = []
  for (const [a, b] of edgesOf(boundary)) {
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const length = Math.hypot(ex, ey)
    if (length < 1e-12) continue
    const nx = (outward * ey) / length
    const ny = (-outward * ex) / length
    let depth = -Infinity
    for (const p of polygon) depth = Math.max(depth, (p[0] - a[0]) * nx + (p[1] - a[1]) * ny)
    walls.push({ nx, ny, depth })
  }
  return walls
}

function worstWall(walls: readonly Wall[], shift: Point): { wall: Wall | null; over: number } {
  let worst: Wall | null = null
  let over = -Infinity
  for (const wall of walls) {
    const g = shift[0] * wall.nx + shift[1] * wall.ny + wall.depth
    if (g > over) {
      over = g
      worst = wall
    }
  }
  return { wall: worst, over }
}

/** Axis by axis against the boundary's extent, leaving an axis that cannot fit where it is. */
function shiftInsideExtent(polygon: Polygon, boundary: Polygon): Point {
  const extent = boundingBox(polygon)
  const bounds = boundingBox(boundary)
  let dx = 0
  let dy = 0
  if (extent.width <= bounds.width + TOLERANCE) {
    if (extent.left < bounds.left - TOLERANCE) dx = bounds.left - extent.left
    else if (extent.left + extent.width > bounds.left + bounds.width + TOLERANCE) {
      dx = bounds.left + bounds.width - (extent.left + extent.width)
    }
  }
  if (extent.depth <= bounds.depth + TOLERANCE) {
    if (extent.top < bounds.top - TOLERANCE) dy = bounds.top - extent.top
    else if (extent.top + extent.depth > bounds.top + bounds.depth + TOLERANCE) {
      dy = bounds.top + bounds.depth - (extent.top + extent.depth)
    }
  }
  return [dx, dy]
}

/**
 * The smallest shift that brings `polygon` back inside `boundary`, `[0, 0]` when it is already
 * in. A polygon too big to fit is left where it is on the axis that cannot hold it: it can only
 * be flagged, and yanking it against a wall it can never satisfy would just fight the person.
 */
export function shiftInside(polygon: Polygon, boundary: Polygon): Point {
  if (!polygon.length || boundary.length < 3) return [0, 0]
  const walls = wallsOf(polygon, boundary)
  let shift: Point = [0, 0]
  for (let i = 0; i < 64; i++) {
    const { wall, over } = worstWall(walls, shift)
    if (!wall || over <= TOLERANCE) break
    shift = [shift[0] - over * wall.nx, shift[1] - over * wall.ny]
  }
  if (worstWall(walls, shift).over > TOLERANCE) return shiftInsideExtent(polygon, boundary)
  return shift
}

export function shiftFootprintInside(footprint: Footprint, boundary: Polygon): Point {
  return shiftInside(outlineOf(footprint), boundary)
}

/** Does the footprint's turned outline leave the boundary? */
export function isOutsideBoundary(footprint: Footprint, boundary: Polygon): boolean {
  if (boundary.length < 3) return false
  return worstWall(wallsOf(outlineOf(footprint), boundary), [0, 0]).over > TOLERANCE
}

/** One shift for the whole set, so a group brought back inside keeps its arrangement. */
export function clampGroupInside(footprints: readonly Footprint[], boundary: Polygon): Footprint[] {
  const corners = footprints.flatMap((footprint) => outlineOf(footprint))
  const shift = shiftInside(corners, boundary)
  if (!shift[0] && !shift[1]) return [...footprints]
  return footprints.map((footprint) => translateFootprint(footprint, shift))
}

/** A rectangle being drawn, cut back to the boundary's extent; its own corners stay square. */
export function clampDrawnRectangle(rect: Rect, boundary: Polygon): Rect {
  if (boundary.length < 3) return rect
  const bounds = boundingBox(boundary)
  const right = bounds.left + bounds.width
  const bottom = bounds.top + bounds.depth
  const left = Math.min(Math.max(rect.left, bounds.left), right)
  const top = Math.min(Math.max(rect.top, bounds.top), bottom)
  return {
    left,
    top,
    width: Math.max(0, Math.min(rect.left + rect.width, right) - left),
    depth: Math.max(0, Math.min(rect.top + rect.depth, bottom) - top),
  }
}

function between(from: Footprint, to: Footprint, s: number): Footprint {
  const polygon = from.polygon.map((p, i): Point => {
    const q = to.polygon[i] ?? p
    return [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]
  })
  return { polygon, rotation: from.rotation + (to.rotation - from.rotation) * s }
}

/**
 * How far a resize may travel from `from` towards `to` before the outline leaves the boundary.
 * The vertices move together, so the overhang grows with the fraction travelled and bisection
 * lands within a hundredth of a millimetre of the wall. A footprint already outside before the
 * edit is returned untouched: this edit did not put it there.
 */
export function limitResize(from: Footprint, to: Footprint, boundary: Polygon): Footprint {
  if (boundary.length < 3) return to
  const inside = (footprint: Footprint) => !isOutsideBoundary(footprint, boundary)
  if (inside(to)) return to
  if (!inside(from) || from.polygon.length !== to.polygon.length) return to
  let low = 0
  let high = 1
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2
    if (inside(between(from, to, middle))) low = middle
    else high = middle
  }
  return between(from, to, low)
}
