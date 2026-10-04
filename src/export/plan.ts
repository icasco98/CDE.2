/**
 * What both drawings read from a sheet: the plot, the setback line, the shapes standing on one
 * storey and the openings in their edges, in plot metres with y running south, as the sheet holds
 * them. Nothing here writes to the sheet.
 */

import {
  allPlaced,
  areaOf,
  boxCorners,
  centreOfFootprint,
  drawnDoors,
  loopsOf,
  placedZones,
  toWorld,
  worldCorners,
  type Box,
  type Point,
  type Side,
  type Poly,
  type Zone,
  type Sheet,
} from '../sheet'

/** A zone as it stands on the storey being drawn: its outline, where its name goes, and its area. */
export type Placed = {
  readonly zone: Zone
  readonly loops: readonly Poly[]
  readonly labelAt: Point
  readonly area: number
}

const toWorldPoint = (zone: Zone, local: Point): Point => toWorld(zone, local[0], local[1])

export function standingOn(sheet: Sheet, storey: number): readonly Placed[] {
  return placedZones(sheet, storey).map((zone) => {
    const loops = loopsOf(zone) ?? []
    const rectangle: Poly = [
      [0, 0],
      [zone.w, 0],
      [zone.w, zone.h],
      [0, zone.h],
    ]
    const outlines =
      loops.length > 0 ? loops.map((loop) => loop.map((edge) => edge.a)) : [rectangle]
    return {
      zone,
      loops: outlines.map((loop) => loop.map((corner) => toWorldPoint(zone, corner))),
      labelAt: toWorldPoint(zone, zone.labelAt ?? centreOfFootprint(zone)),
      area: areaOf(zone),
    }
  })
}

/** A door as a gap: where it sits in the world, the way its edge runs, and how wide the gap is. */
export type Opening = {
  readonly at: Point
  readonly along: Point
  readonly width: number
}

export function openingsOn(sheet: Sheet, storey: number): readonly Opening[] {
  const openings: Opening[] = []
  for (const { zone, pl: place, w } of drawnDoors(sheet, storey)) {
    const from = toWorldPoint(zone, place.seg.a)
    const to = toWorldPoint(zone, place.seg.b)
    const run = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (run < 1e-9) continue
    openings.push({
      at: toWorldPoint(zone, place.p),
      along: [(to[0] - from[0]) / run, (to[1] - from[1]) / run],
      width: w,
    })
  }
  return openings
}

export const plotCorners = (sheet: Sheet): readonly Point[] => boxCorners(sheet.plot.box)

export const setbackCorners = (sheet: Sheet): readonly Point[] => boxCorners(sheet.plot.build)

/** The sides on a street, drawn heavy, each as the run of boundary it takes. */
export function streetSides(sheet: Sheet): readonly (readonly [Point, Point])[] {
  const { w, h } = sheet.plot
  const runs: Record<Side, readonly [Point, Point]> = {
    west: [
      [0, 0],
      [0, h],
    ],
    east: [
      [w, 0],
      [w, h],
    ],
    north: [
      [0, 0],
      [w, 0],
    ],
    street: [
      [0, h],
      [w, h],
    ],
  }
  return sheet.plot.streets.map((side) => runs[side])
}

/** Everything a drawing has to hold: the plot, and every zone placed on any storey. */
export function contentBounds(sheet: Sheet): Box {
  const corners: Point[] = [...plotCorners(sheet)]
  for (const zone of allPlaced(sheet)) corners.push(...worldCorners(zone))
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
