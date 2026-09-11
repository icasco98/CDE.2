import { outlineOf } from './footprint'
import { area, boundingBox, differencePolygons, edgesOf } from './polygon'
import type { Footprint, Point, Polygon } from './types'

/** Two shapes count as overlapping only past this much, in metres: a shared wall and the rounding either side of it are not an overlap. */
export const OVERLAP_TOLERANCE = 0.002

/** An oriented bounding box: centre, half extents, and its own unit axes. */
export type Obb = {
  readonly cx: number
  readonly cy: number
  readonly halfWidth: number
  readonly halfDepth: number
  readonly ax: Point
  readonly ay: Point
}

export function obbOf(footprint: Footprint): Obb {
  const bounds = boundingBox(footprint.polygon)
  const radians = (footprint.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    cx: bounds.left + bounds.width / 2,
    cy: bounds.top + bounds.depth / 2,
    halfWidth: bounds.width / 2,
    halfDepth: bounds.depth / 2,
    ax: [cos, sin],
    ay: [-sin, cos],
  }
}

function reach(obb: Obb, axis: Point): number {
  return (
    obb.halfWidth * Math.abs(obb.ax[0] * axis[0] + obb.ax[1] * axis[1]) +
    obb.halfDepth * Math.abs(obb.ay[0] * axis[0] + obb.ay[1] * axis[1])
  )
}

/** Separating axis theorem over the four candidate axes; touching counts as a gap. */
export function obbsSeparated(a: Obb, b: Obb): boolean {
  const dx = b.cx - a.cx
  const dy = b.cy - a.cy
  for (const axis of [a.ax, a.ay, b.ax, b.ay]) {
    const distance = Math.abs(dx * axis[0] + dy * axis[1])
    if (distance > reach(a, axis) + reach(b, axis) - OVERLAP_TOLERANCE) return true
  }
  return false
}

function spanAlong(polygon: Polygon, ax: number, ay: number): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const p of polygon) {
    const d = p[0] * ax + p[1] * ay
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return { min, max }
}

/** Exact for convex outlines; for a concave one it can only err towards reporting an overlap. */
function polygonsSeparated(a: Polygon, b: Polygon): boolean {
  for (const polygon of [a, b]) {
    for (const [p, q] of edgesOf(polygon)) {
      const nx = q[1] - p[1]
      const ny = -(q[0] - p[0])
      const length = Math.hypot(nx, ny)
      if (!length) continue
      const spanA = spanAlong(a, nx / length, ny / length)
      const spanB = spanAlong(b, nx / length, ny / length)
      if (spanA.max < spanB.min + OVERLAP_TOLERANCE) return true
      if (spanB.max < spanA.min + OVERLAP_TOLERANCE) return true
    }
  }
  return false
}

/** True only where two footprints share real area: rooms brought flush wall to wall do not overlap. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  if (obbsSeparated(obbOf(a), obbOf(b))) return false
  return !polygonsSeparated(outlineOf(a), outlineOf(b))
}

function pieceArea(piece: readonly Polygon[]): number {
  const [outer, ...holes] = piece
  if (!outer) return 0
  return holes.reduce((total, hole) => total - area(hole), area(outer))
}

/**
 * The area two footprints really hold in common. `footprintsOverlap` is cheap and, for a shape a
 * carve has left concave, can only say "maybe"; this settles the maybe against the polygon
 * booleans, so a cutter sitting in the notch it made is not read as lying over its neighbour.
 */
export function sharedArea(a: Footprint, b: Footprint): number {
  if (obbsSeparated(obbOf(a), obbOf(b))) return 0
  const outline = outlineOf(a)
  const left = differencePolygons(outline, [outlineOf(b)]).reduce(
    (total, piece) => total + pieceArea(piece),
    0,
  )
  return Math.max(0, area(outline) - left)
}
