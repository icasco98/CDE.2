import { frameOf, outlineOf, placeInFrame, sheetToLocalPolygon } from './footprint'
import { area, boundingBox, differencePolygons, rectangleToPolygon, type Rect } from './polygon'
import type { Footprint, Polygon } from './types'

/** Half a centimetre: the polygon booleans land a vertex a hair either side of a wall, and a room 2.9999 m wide is not under a 3 m minimum. */
const TOLERANCE = 0.005

/**
 * `subject` less every cutter. The largest piece is kept and `split` says whether there were
 * others; a hole is filled, which is the honest drawing of a room with someone else's space
 * standing in the middle of it.
 */
export function subtractPolygons(
  subject: Polygon,
  cutters: readonly Polygon[],
): { polygon: Polygon; split: boolean } {
  if (!cutters.length) return { polygon: subject, split: false }
  const pieces = differencePolygons(subject, cutters)
  if (!pieces.length) return { polygon: [], split: false }
  let best: Polygon = []
  let bestArea = -1
  for (const piece of pieces) {
    const ring = piece[0] ?? []
    const ringArea = area(ring)
    if (ringArea > bestArea) {
      best = ring
      bestArea = ringArea
    }
  }
  return { polygon: best, split: pieces.length > 1 }
}

/** `subject` with every cutter taken out of it, in the subject's own frame, so its rotation is kept. */
export function carveFootprint(
  subject: Footprint,
  cutters: readonly Footprint[],
): { footprint: Footprint; carved: boolean; split: boolean } {
  const frame = frameOf(subject)
  const local = cutters.map((cutter) => sheetToLocalPolygon(outlineOf(cutter), frame))
  const { polygon, split } = subtractPolygons(subject.polygon, local)
  if (polygon.length < 3) {
    return { footprint: { polygon: [], rotation: subject.rotation }, carved: true, split: false }
  }
  const carved = area(polygon) < area(subject.polygon) - 1e-9
  if (!carved) return { footprint: subject, carved: false, split }
  return { footprint: placeInFrame(polygon, frame, subject.rotation), carved: true, split }
}

/** The full-height and full-width strips left either side of a bite: a lower bound on the largest rectangle still inside. */
function freeStrips(rect: Rect, bite: Rect): { width: number; depth: number }[] {
  return [
    { width: Math.max(0, bite.left - rect.left), depth: rect.depth },
    { width: Math.max(0, rect.left + rect.width - (bite.left + bite.width)), depth: rect.depth },
    { width: rect.width, depth: Math.max(0, bite.top - rect.top) },
    { width: rect.width, depth: Math.max(0, rect.top + rect.depth - (bite.top + bite.depth)) },
  ]
}

/** What is missing from `polygon` relative to its own bounding rectangle. */
function biteOut(rect: Rect, polygon: Polygon): Rect {
  const missing = differencePolygons(rectangleToPolygon(rect), [polygon])
  const corners = missing.flatMap((piece) => piece[0] ?? [])
  return corners.length
    ? boundingBox(corners)
    : { left: rect.left, top: rect.top, width: 0, depth: 0 }
}

/**
 * Does `polygon` still hold a rectangle of at least `minWidth` by `minDepth`? Measured off the
 * strips either side of what has been bitten out, so it errs low: a shape is occasionally
 * refused that would have been fine, never accepted when it would not.
 */
export function holdsRectangle(polygon: Polygon, minWidth: number, minDepth: number): boolean {
  if (area(polygon) < minWidth * minDepth - TOLERANCE) return false
  const rect = boundingBox(polygon)
  if (rect.width < minWidth - TOLERANCE || rect.depth < minDepth - TOLERANCE) return false
  return freeStrips(rect, biteOut(rect, polygon)).some(
    (strip) => strip.width >= minWidth - TOLERANCE && strip.depth >= minDepth - TOLERANCE,
  )
}
