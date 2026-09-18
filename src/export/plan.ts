/**
 * What both drawings read from a sheet: the plot, the setback line, the shapes standing on one
 * storey and the openings in their walls, in plot metres with y running south, as the sheet holds
 * them. Nothing here writes to the sheet.
 */

import {
  BUILD,
  PLOT_BOX,
  allPlaced,
  areaOf,
  boxCorners,
  centreOfFootprint,
  doorPlace,
  doorsOf,
  loopsOf,
  placedRooms,
  toWorld,
  worldCorners,
  type Box,
  type Point,
  type Poly,
  type Room,
  type Sheet,
} from '../sheet'

/** A room as it stands on the storey being drawn: its outline, where its name goes, and its area. */
export type Placed = {
  readonly room: Room
  readonly loops: readonly Poly[]
  readonly labelAt: Point
  readonly area: number
}

const toWorldPoint = (room: Room, local: Point): Point => toWorld(room, local[0], local[1])

export function standingOn(sheet: Sheet, storey: number): readonly Placed[] {
  return placedRooms(sheet, storey).map((room) => {
    const loops = loopsOf(room) ?? []
    const rectangle: Poly = [
      [0, 0],
      [room.w, 0],
      [room.w, room.h],
      [0, room.h],
    ]
    const outlines =
      loops.length > 0 ? loops.map((loop) => loop.map((wall) => wall.a)) : [rectangle]
    return {
      room,
      loops: outlines.map((loop) => loop.map((corner) => toWorldPoint(room, corner))),
      labelAt: toWorldPoint(room, room.labelAt ?? centreOfFootprint(room)),
      area: areaOf(room),
    }
  })
}

/** A door as a gap: where it sits in the world, the way its wall runs, and how wide the gap is. */
export type Opening = {
  readonly at: Point
  readonly along: Point
  readonly width: number
}

export function openingsOn(sheet: Sheet, storey: number): readonly Opening[] {
  const openings: Opening[] = []
  for (const room of placedRooms(sheet, storey)) {
    for (const door of doorsOf(room)) {
      const place = doorPlace(room, door)
      if (!place) continue
      const from = toWorldPoint(room, place.seg.a)
      const to = toWorldPoint(room, place.seg.b)
      const run = Math.hypot(to[0] - from[0], to[1] - from[1])
      if (run < 1e-9) continue
      openings.push({
        at: toWorldPoint(room, place.p),
        along: [(to[0] - from[0]) / run, (to[1] - from[1]) / run],
        width: door.w,
      })
    }
  }
  return openings
}

export const plotCorners: readonly Point[] = boxCorners(PLOT_BOX)

export const setbackCorners: readonly Point[] = boxCorners(BUILD)

/** The sides on a street, drawn heavy: the service street to the south, the side street to the east. */
export const streetSides: readonly (readonly [Point, Point])[] = [
  [
    [0, PLOT_BOX.h],
    [PLOT_BOX.w, PLOT_BOX.h],
  ],
  [
    [PLOT_BOX.w, 0],
    [PLOT_BOX.w, PLOT_BOX.h],
  ],
]

/** Everything a drawing has to hold: the plot, and every room placed on any storey. */
export function contentBounds(sheet: Sheet): Box {
  const corners: Point[] = [...plotCorners]
  for (const room of allPlaced(sheet)) corners.push(...worldCorners(room))
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
