import clipping from 'polygon-clipping'
import type { Point, Polygon } from './types'

/** An axis-aligned rectangle on the sheet: x right, y down, metres. */
export type Rect = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly depth: number
}

/** Consecutive vertex pairs, last back to first. */
export function edgesOf(polygon: Polygon): [Point, Point][] {
  const out: [Point, Point][] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (a && b) out.push([a, b])
  }
  return out
}

/** Positive when the ring winds clockwise on the sheet, where y runs down. */
export function signedArea(polygon: Polygon): number {
  let sum = 0
  for (const [a, b] of edgesOf(polygon)) sum += a[0] * b[1] - b[0] * a[1]
  return sum / 2
}

export function area(polygon: Polygon): number {
  return Math.abs(signedArea(polygon))
}

export function centroid(polygon: Polygon): Point {
  const twice = signedArea(polygon) * 2
  if (Math.abs(twice) < 1e-12) {
    let sx = 0
    let sy = 0
    for (const p of polygon) {
      sx += p[0]
      sy += p[1]
    }
    const n = Math.max(1, polygon.length)
    return [sx / n, sy / n]
  }
  let cx = 0
  let cy = 0
  for (const [a, b] of edgesOf(polygon)) {
    const cross = a[0] * b[1] - b[0] * a[1]
    cx += (a[0] + b[0]) * cross
    cy += (a[1] + b[1]) * cross
  }
  return [cx / (3 * twice), cy / (3 * twice)]
}

export function boundingBox(polygon: Polygon): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of polygon) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }
  if (!polygon.length) return { left: 0, top: 0, width: 0, depth: 0 }
  return { left: minX, top: minY, width: maxX - minX, depth: maxY - minY }
}

export function rectangleToPolygon(rect: Rect): Polygon {
  return [
    [rect.left, rect.top],
    [rect.left + rect.width, rect.top],
    [rect.left + rect.width, rect.top + rect.depth],
    [rect.left, rect.top + rect.depth],
  ]
}

/** Ray cast: strictly inside. A point on the boundary is undecided here; ask `pointOnBoundary`. */
export function pointInPolygon(polygon: Polygon, p: Point): boolean {
  let hit = false
  for (const [a, b] of edgesOf(polygon)) {
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      hit = !hit
    }
  }
  return hit
}

export function nearestPointOnBoundary(polygon: Polygon, p: Point): Point {
  let best: Point = polygon[0] ?? p
  let bestDistance = Infinity
  for (const [a, b] of edgesOf(polygon)) {
    const q = nearestPointOnSegment(p, a, b)
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < bestDistance) {
      bestDistance = d
      best = q
    }
  }
  return best
}

export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const length2 = ex * ex + ey * ey
  if (length2 < 1e-18) return a
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / length2))
  return [a[0] + t * ex, a[1] + t * ey]
}

export function pointOnBoundary(polygon: Polygon, p: Point, tolerance: number): boolean {
  const q = nearestPointOnBoundary(polygon, p)
  return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance
}

type Ring = [number, number][]

export function polygonToRings(polygon: Polygon): Ring[] {
  return [polygon.map((p): [number, number] => [p[0], p[1]])]
}

/** The library closes its rings; a `Polygon` does not repeat its first vertex. */
export function ringToPolygon(ring: readonly (readonly number[])[]): Polygon {
  const out: Point[] = []
  for (const p of ring) out.push([p[0] ?? 0, p[1] ?? 0])
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && first && last) {
    if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop()
  }
  return out
}

/** Each piece is its outer ring first, then its holes. */
export type Piece = Polygon[]

function toPieces(result: readonly (readonly (readonly (readonly number[])[])[])[]): Piece[] {
  return result.map((piece) => piece.map(ringToPolygon).filter((ring) => ring.length >= 3))
}

export function unionPolygons(polygons: readonly Polygon[]): Piece[] {
  const geometries = polygons.map(polygonToRings)
  const [first, ...rest] = geometries
  if (!first) return []
  return toPieces(clipping.union(first, ...rest))
}

export function differencePolygons(subject: Polygon, clippers: readonly Polygon[]): Piece[] {
  if (!clippers.length) return [[subject]]
  return toPieces(clipping.difference(polygonToRings(subject), ...clippers.map(polygonToRings)))
}
