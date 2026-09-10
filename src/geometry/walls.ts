import { edgesOf } from './polygon'
import type { Point, Polygon } from './types'

/** A run of wall two polygons hold in common, one end to the other. */
export type SharedWall = { readonly from: Point; readonly to: Point }

/**
 * Every run along which an edge of `a` and an edge of `b` lie on the same line within
 * `tolerance` and overlap in extent. A shared wall is a fact about the drawing and nothing
 * more: it is read to warn that a door has been drawn where the walls do not meet, and it
 * never makes a connection of its own.
 */
export function sharedWalls(a: Polygon, b: Polygon, tolerance: number): SharedWall[] {
  const out: SharedWall[] = []
  for (const [a1, a2] of edgesOf(a)) {
    const dx = a2[0] - a1[0]
    const dy = a2[1] - a1[1]
    const length = Math.hypot(dx, dy)
    if (length < 1e-9) continue
    const ux = dx / length
    const uy = dy / length
    for (const [b1, b2] of edgesOf(b)) {
      const across1 = (b1[0] - a1[0]) * uy - (b1[1] - a1[1]) * ux
      const across2 = (b2[0] - a1[0]) * uy - (b2[1] - a1[1]) * ux
      if (Math.abs(across1) > tolerance || Math.abs(across2) > tolerance) continue
      const along = (p: Point) => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy
      const low = Math.max(0, Math.min(along(b1), along(b2)))
      const high = Math.min(length, Math.max(along(b1), along(b2)))
      if (high - low < tolerance) continue
      out.push({
        from: [a1[0] + ux * low, a1[1] + uy * low],
        to: [a1[0] + ux * high, a1[1] + uy * high],
      })
    }
  }
  return out
}
