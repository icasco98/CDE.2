import { frameOf, localToSheetPoint } from './footprint'
import { area, signedArea } from './polygon'
import type { Arc, Circle, Footprint, Point, Polygon } from './types'

/** How far a chord may fall from the arc it stands for, in metres. */
const CHORD_ERROR_M = 0.005

/** However shallow the curve, a quarter turn is drawn with at least this many segments. */
const PER_QUARTER = 8

const TURN = Math.PI * 2

/**
 * An angle is `atan2(y, x)` on the sheet, where y runs down, so an angle that grows turns
 * clockwise as the plan is drawn. That is the way `clockwise` means throughout.
 */
export function angleOf(centre: Point, at: Point): number {
  return Math.atan2(at[1] - centre[1], at[0] - centre[0])
}

function turned(angle: number): number {
  const within = angle % TURN
  return within < 0 ? within + TURN : within
}

/** How far clockwise it is from one angle round to the other, in radians, never negative. */
function sweepBetween(from: number, to: number, clockwise: boolean): number {
  const way = turned(clockwise ? to - from : from - to)
  // The two angles landing together is a whole turn, which is how a circle asks for its own run.
  return way < 1e-12 ? TURN : way
}

/**
 * How many segments a sweep is drawn with: enough that no chord falls further than 5 mm from the
 * arc, and never fewer than eight to the quarter turn, so a shallow curve still reads as a curve.
 */
export function arcSegments(radius: number, sweep: number): number {
  const widest = 2 * Math.acos(Math.max(-1, 1 - CHORD_ERROR_M / Math.max(radius, 1e-9)))
  const byError = Math.ceil(sweep / widest)
  const byQuarter = Math.ceil((sweep / (Math.PI / 2)) * PER_QUARTER)
  return Math.max(1, byError, byQuarter)
}

/** The polygon run one arc stands for, both ends included, so a closed circle repeats its first point. */
export function arcPoints(
  centre: Point,
  radius: number,
  fromAngle: number,
  toAngle: number,
  clockwise: boolean,
): Polygon {
  const sweep = sweepBetween(fromAngle, toAngle, clockwise)
  const segments = arcSegments(radius, sweep)
  const step = ((clockwise ? 1 : -1) * sweep) / segments
  return Array.from({ length: segments + 1 }, (_unused, index): Point => {
    const angle = fromAngle + step * index
    return [centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)]
  })
}

/**
 * The circle through three points, and which way round it runs from the first to the last through
 * the middle one. Three points on a line name no circle, and the caller draws a straight wall.
 */
export function arcThrough(from: Point, through: Point, to: Point): Circle | null {
  const twiceArea =
    2 *
    (from[0] * (through[1] - to[1]) +
      through[0] * (to[1] - from[1]) +
      to[0] * (from[1] - through[1]))
  if (Math.abs(twiceArea) < 1e-9) return null
  const a = from[0] * from[0] + from[1] * from[1]
  const b = through[0] * through[0] + through[1] * through[1]
  const c = to[0] * to[0] + to[1] * to[1]
  const centre: Point = [
    (a * (through[1] - to[1]) + b * (to[1] - from[1]) + c * (from[1] - through[1])) / twiceArea,
    (a * (to[0] - through[0]) + b * (from[0] - to[0]) + c * (through[0] - from[0])) / twiceArea,
  ]
  const radius = Math.hypot(from[0] - centre[0], from[1] - centre[1])
  if (!Number.isFinite(radius) || radius <= 0) return null
  const start = angleOf(centre, from)
  const clockwise =
    sweepBetween(start, angleOf(centre, through), true) <
    sweepBetween(start, angleOf(centre, to), true)
  return { centre, radius, clockwise }
}

/** The vertex indices an arc runs through, `from` round to `to`; equal ends are the whole ring. */
export function arcRun(arc: Arc, vertices: number): readonly number[] {
  if (vertices <= 0) return []
  const from = ((arc.from % vertices) + vertices) % vertices
  const to = ((arc.to % vertices) + vertices) % vertices
  const steps = from === to ? vertices : (to - from + vertices) % vertices
  return Array.from({ length: steps + 1 }, (_unused, index) => (from + index) % vertices)
}

/** The whole circle less the triangle under its chord, for a chord subtending `sweep`. */
function segmentArea(radius: number, sweep: number): number {
  return ((radius * radius) / 2) * (sweep - Math.sin(sweep))
}

/**
 * What an arc adds to the polygon's own signed area: the circular segment standing over each
 * chord of its run. An arc drawn clockwise bulges the way the polygon winds and adds; one drawn
 * the other way takes the same area back out.
 */
function bulgeArea(polygon: Polygon, arc: Arc): number {
  const run = arcRun(arc, polygon.length)
  const way = arc.clockwise ? 1 : -1
  let total = 0
  for (let index = 0; index + 1 < run.length; index += 1) {
    const a = polygon[run[index] ?? 0]
    const b = polygon[run[index + 1] ?? 0]
    if (!a || !b) continue
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1])
    const sweep = 2 * Math.asin(Math.min(1, chord / (2 * arc.radius)))
    total += way * segmentArea(arc.radius, sweep)
  }
  return total
}

/**
 * The area the room really covers: the polygon's area with every arc's segments put back, so a
 * circle measures πr² rather than the area of the many-sided figure standing for it.
 */
export function exactArea(footprint: Footprint): number {
  const arcs = footprint.arcs
  if (!arcs || arcs.length === 0) return area(footprint.polygon)
  let signed = signedArea(footprint.polygon)
  for (const arc of arcs) signed += bulgeArea(footprint.polygon, arc)
  return Math.abs(signed)
}

/** The arcs where the footprint stands on the sheet: the centres turned with the polygon. */
export function sheetArcs(footprint: Footprint): readonly Arc[] {
  const arcs = footprint.arcs
  if (!arcs || arcs.length === 0) return []
  const frame = frameOf(footprint)
  if (!frame.rotated) return arcs
  return arcs.map((arc) => ({ ...arc, centre: localToSheetPoint(arc.centre, frame) }))
}
