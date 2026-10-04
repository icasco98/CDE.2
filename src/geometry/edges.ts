import { edgesOf, signedArea } from './polygon'
import type { Point, Polygon } from './types'

/** A run of edge two polygons hold in common, one end to the other. */
export type SharedEdge = { readonly from: Point; readonly to: Point }

/** How far apart two edges may lie and still be read as the one edge, in metres. */
export const EDGE_TOLERANCE = 0.05

export function edgeLength(edge: SharedEdge): number {
  return Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1])
}

export function edgeMidpoint(edge: SharedEdge): Point {
  return [(edge.from[0] + edge.to[0]) / 2, (edge.from[1] + edge.to[1]) / 2]
}

/** The unit direction along the edge; an edge of no length is read as running east. */
export function edgeDirection(edge: SharedEdge): Point {
  const run = edgeLength(edge)
  if (run < 1e-9) return [1, 0]
  return [(edge.to[0] - edge.from[0]) / run, (edge.to[1] - edge.from[1]) / run]
}

/**
 * Every run along which an edge of `a` and an edge of `b` lie on the same line within
 * `tolerance` and overlap in extent. A shared edge is a fact about the drawing and nothing
 * more: it is read to warn that a door has been drawn where the edges do not meet, and it
 * never makes a connection of its own.
 */
export function sharedEdges(a: Polygon, b: Polygon, tolerance: number): SharedEdge[] {
  const out: SharedEdge[] = []
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

/** One edge of a polygon with the unit normal that points away from its inside. */
export type OutwardEdge = { readonly from: Point; readonly to: Point; readonly normal: Point }

/** Every edge of `polygon` with its outward normal, read from the ring's own winding. */
export function outwardEdges(polygon: Polygon): OutwardEdge[] {
  const outward = signedArea(polygon) >= 0 ? 1 : -1
  const edges: OutwardEdge[] = []
  for (const [a, b] of edgesOf(polygon)) {
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const length = Math.hypot(ex, ey)
    if (length < 1e-12) continue
    edges.push({ from: a, to: b, normal: [(outward * ey) / length, (-outward * ex) / length] })
  }
  return edges
}
