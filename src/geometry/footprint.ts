import { boundingBox } from './polygon'
import type { Footprint, Point, Polygon } from './types'

/** The frame a footprint's own polygon is written in: the centre it turns about, and that turn. */
export type Frame = {
  readonly cx: number
  readonly cy: number
  readonly cos: number
  readonly sin: number
  readonly rotated: boolean
}

/** -1 west or north, 0 centre, 1 east or south, in the footprint's own frame. */
export type Handle = -1 | 0 | 1

export function frameOf(footprint: Footprint): Frame {
  const bounds = boundingBox(footprint.polygon)
  const radians = (footprint.rotation * Math.PI) / 180
  return {
    cx: bounds.left + bounds.width / 2,
    cy: bounds.top + bounds.depth / 2,
    cos: Math.cos(radians),
    sin: Math.sin(radians),
    rotated: radians !== 0,
  }
}

export function localToSheetPoint(p: Point, frame: Frame): Point {
  if (!frame.rotated) return p
  const dx = p[0] - frame.cx
  const dy = p[1] - frame.cy
  return [frame.cx + dx * frame.cos - dy * frame.sin, frame.cy + dx * frame.sin + dy * frame.cos]
}

export function sheetToLocalPoint(p: Point, frame: Frame): Point {
  if (!frame.rotated) return p
  const dx = p[0] - frame.cx
  const dy = p[1] - frame.cy
  return [frame.cx + dx * frame.cos + dy * frame.sin, frame.cy - dx * frame.sin + dy * frame.cos]
}

export function localToSheetPolygon(polygon: Polygon, frame: Frame): Polygon {
  return frame.rotated ? polygon.map((p) => localToSheetPoint(p, frame)) : polygon
}

export function sheetToLocalPolygon(polygon: Polygon, frame: Frame): Polygon {
  return frame.rotated ? polygon.map((p) => sheetToLocalPoint(p, frame)) : polygon
}

/** A direction, not a place: a drag delta turned into the footprint's own axes, with no translation. */
export function sheetToLocalVector(dx: number, dy: number, frame: Frame): Point {
  if (!frame.rotated) return [dx, dy]
  return [dx * frame.cos + dy * frame.sin, -dx * frame.sin + dy * frame.cos]
}

/** The footprint's outline where it sits on the sheet, its rotation applied. */
export function outlineOf(footprint: Footprint): Polygon {
  return localToSheetPolygon(footprint.polygon, frameOf(footprint))
}

export function translateFootprint(footprint: Footprint, delta: Point): Footprint {
  if (!delta[0] && !delta[1]) return footprint
  return {
    polygon: footprint.polygon.map((p): Point => [p[0] + delta[0], p[1] + delta[1]]),
    rotation: footprint.rotation,
  }
}

/** Where a corner (`±1, ±1`) or a wall midpoint (`0, ±1`, `±1, 0`) of the footprint sits on the sheet. */
export function anchorPointOf(footprint: Footprint, sx: Handle, sy: Handle): Point {
  const frame = frameOf(footprint)
  const bounds = boundingBox(footprint.polygon)
  const local: Point = [frame.cx + (sx * bounds.width) / 2, frame.cy + (sy * bounds.depth) / 2]
  return localToSheetPoint(local, frame)
}

/**
 * The footprint scaled to `width` by `depth`, with the handle at `(sx, sy)` held exactly at
 * `anchor` on the sheet. Solving for the new centre from the held point, rather than carrying
 * the old one forward, is what keeps that point from drifting once the footprint is turned.
 */
export function resizeFromAnchor(
  footprint: Footprint,
  anchor: Point,
  sx: Handle,
  sy: Handle,
  width: number,
  depth: number,
): Footprint {
  const bounds = boundingBox(footprint.polygon)
  const radians = (footprint.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const cx = anchor[0] - sx * halfWidth * cos + sy * halfDepth * sin
  const cy = anchor[1] - sx * halfWidth * sin - sy * halfDepth * cos
  const polygon = footprint.polygon.map((p): Point => {
    const fx = bounds.width > 1e-12 ? (p[0] - bounds.left) / bounds.width : 0.5
    const fy = bounds.depth > 1e-12 ? (p[1] - bounds.top) / bounds.depth : 0.5
    return [cx + (fx - 0.5) * width, cy + (fy - 0.5) * depth]
  })
  return { polygon, rotation: footprint.rotation }
}

/**
 * A polygon written in `previous`'s frame, stored as a footprint of its own. Its bounding box
 * has moved, and a footprint turns about that box, so it is shifted to sit where the turn about
 * the old centre put it.
 */
export function placeInFrame(polygon: Polygon, previous: Frame, rotation: number): Footprint {
  const bounds = boundingBox(polygon)
  const dx = previous.cx - (bounds.left + bounds.width / 2)
  const dy = previous.cy - (bounds.top + bounds.depth / 2)
  const shift: Point = [
    dx - (dx * previous.cos - dy * previous.sin),
    dy - (dx * previous.sin + dy * previous.cos),
  ]
  return translateFootprint({ polygon, rotation }, shift)
}
