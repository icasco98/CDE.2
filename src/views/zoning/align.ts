import { isOutsideBoundary, type Footprint, type Point, type Polygon } from '../../geometry'
import type { Plot } from '../../model'
import { normaliseAngle, overlaps } from './gestures'
import type { Placement } from './types'

/**
 * The four square orientations a room may take to a direction. A room is turned to whichever of
 * them it already stands nearest, so aligning never spins it a quarter turn it did not ask for:
 * 92° under a north of 0 comes to 90°, not to 0°.
 */
const QUARTERS = [0, 90, 180, 270] as const

/** A rotation this near the one it would be given is left where it is, in degrees. */
const SQUARE_TOLERANCE = 0.5

/** A room an alignment may turn: where it stands and what a refusal calls it. */
export type Turnable = {
  readonly id: string
  readonly name: string
  readonly footprint: Footprint
}

/** What one press of an alignment button leaves the storey with. */
type Aligning = {
  readonly placements: readonly Placement[]
  /** A room that could not be turned where it stands, with the sentence that says why. */
  readonly skipped: readonly { readonly name: string; readonly reason: string }[]
}

/** The turn from one rotation to another, between -180° and 180°. */
function turnBetween(from: number, to: number): number {
  const around = normaliseAngle(to - from)
  return around > 180 ? around - 360 : around
}

/** The side running from one corner of the plot to the next, as a rotation: clockwise from east. */
function sideAngle(from: Point, to: Point): number {
  return normaliseAngle((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI)
}

function sidesOf(polygon: Polygon): { readonly from: Point; readonly to: Point }[] {
  const sides: { from: Point; to: Point }[] = []
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    if (from && to) sides.push({ from, to })
  }
  return sides
}

/** North on the sheet, as a rotation: a room turned this far runs its axes with the north arrow. */
export function northAngle(plot: Plot): number {
  return normaliseAngle(plot.north)
}

/**
 * The direction the plot's first street side runs, or its longest side where no side of it is on
 * a street: a house squares up to the street it is entered from, and to the plot itself when the
 * plot says nothing about a street.
 */
export function plotAngle(plot: Plot): number {
  const sides = sidesOf(plot.polygon)
  if (sides.length === 0) return 0
  const street = plot.street[0] === undefined ? undefined : sides[plot.street[0]]
  if (street) return sideAngle(street.from, street.to)
  let longest = sides[0]
  let run = -Infinity
  for (const side of sides) {
    const length = Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1])
    if (length <= run) continue
    run = length
    longest = side
  }
  return longest ? sideAngle(longest.from, longest.to) : 0
}

/** The square orientation to `target` that `rotation` already stands nearest. */
export function squaredTo(rotation: number, target: number): number {
  let best = normaliseAngle(target)
  let nearest = Infinity
  for (const quarter of QUARTERS) {
    const candidate = normaliseAngle(target + quarter)
    const off = Math.abs(turnBetween(rotation, candidate))
    // A room exactly between two of them takes the target itself, which comes first.
    if (off >= nearest - 1e-9) continue
    nearest = off
    best = candidate
  }
  return best
}

export function alreadySquare(rotation: number, target: number): boolean {
  return Math.abs(turnBetween(rotation, squaredTo(rotation, target))) <= SQUARE_TOLERANCE
}

/**
 * Every room in `turning` turned about its own centre to the square orientation nearest `target`.
 * A room already there is left alone rather than written again. A room that would come to lie
 * over another or to leave the plot is skipped with the sentence that says which; the rooms
 * already turned in this pass are what the rest are measured against, so the storey they leave
 * behind has no two footprints over one another.
 */
export function alignRooms(
  turning: readonly Turnable[],
  standing: readonly Turnable[],
  boundary: Polygon,
  target: number,
): Aligning {
  const placements: Placement[] = []
  const skipped: { name: string; reason: string }[] = []
  const where = new Map(standing.map((room) => [room.id, room.footprint]))
  for (const room of turning) {
    if (alreadySquare(room.footprint.rotation, target)) continue
    const rotation = squaredTo(room.footprint.rotation, target)
    const turned: Footprint = { polygon: room.footprint.polygon, rotation }
    if (boundary.length >= 3 && isOutsideBoundary(turned, boundary)) {
      skipped.push({ name: room.name, reason: 'it would leave the plot' })
      continue
    }
    const hit = standing.find(
      (other) => other.id !== room.id && overlaps(turned, where.get(other.id) ?? other.footprint),
    )
    if (hit) {
      skipped.push({ name: room.name, reason: `it would overlap ${hit.name}` })
      continue
    }
    where.set(room.id, turned)
    placements.push({ id: room.id, footprint: turned })
  }
  return { placements, skipped }
}
