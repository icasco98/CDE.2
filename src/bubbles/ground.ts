import { centroid, pointInPolygon, signedArea, type Point, type Polygon } from '../geometry'
import type { Plot, Site } from '../model'
import { buildableArea, sidesOf, type PlotSides } from '../rulebook'
import { nearestOnSegment, type Placed } from './capsule'

/** One side of the buildable line, with the way into the floor from it. */
export type Side = { readonly from: Point; readonly to: Point; readonly inward: Point }

/**
 * The buildable line as a frame reads it: its sides one at a time with the way in from each, the
 * middle of the floor, and how deep the floor is at that middle, all worked out once when the
 * picture is built so that no frame ever measures the polygon again.
 */
export type Buildable = {
  readonly polygon: Polygon
  readonly sides: readonly Side[]
  readonly middle: Point
  /** The largest bubble the floor holds at its middle; a bigger one rests there rather than jam. */
  readonly deepest: number
}

/** The floor a picture is settled on: the line that holds it, the sides, and the client's answers. */
export type Ground = {
  readonly inside: Buildable
  readonly sides: PlotSides
  readonly site: Site
}

/** How far the nearest side of the buildable line is from a point, and where on it. */
function nearestSide(
  sides: readonly Side[],
  fallback: Point,
  x: number,
  y: number,
): { readonly at: Point; readonly away: number } {
  let at = fallback
  let away = Infinity
  for (const side of sides) {
    const q = nearestOnSegment(side.from, side.to, x, y)
    const distance = Math.hypot(q[0] - x, q[1] - y)
    if (distance < away) {
      away = distance
      at = q
    }
  }
  return { at, away }
}

/**
 * The buildable line read once for the whole run. The setbacks are the Municipality's, so the line
 * holds the bubbles in whatever the plot's own boundary is set to do with footprints; a polygon of
 * fewer than three corners is a plot the setbacks swallowed whole, and holds nothing in.
 */
export function buildableOf(polygon: Polygon): Buildable {
  const sides: Side[] = []
  const outward = signedArea(polygon) >= 0 ? 1 : -1
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]
    const to = polygon[(i + 1) % polygon.length]
    if (!from || !to) continue
    const run = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (run < 1e-12) continue
    // The way in, read from the ring's own winding, as the geometry reads a wall's outward normal.
    const inward: Point = [
      (-outward * (to[1] - from[1])) / run,
      (outward * (to[0] - from[0])) / run,
    ]
    sides.push({ from, to, inward })
  }
  const enough = polygon.length >= 3
  const middle: Point = enough ? centroid(polygon) : [0, 0]
  if (!enough) return { polygon, sides: [], middle, deepest: 0 }
  return {
    polygon,
    sides,
    middle,
    deepest: nearestSide(sides, middle, middle[0], middle[1]).away,
  }
}

/** The plot and the client's two answers, read once into everything the forces and walls need. */
export function groundOf(plot: Plot, site: Site): Ground {
  return { inside: buildableOf(buildableArea(plot)), sides: sidesOf(plot), site }
}

/** Twice round the sides squares a bubble up in a corner; a third go is the margin. */
const SIDE_PASSES = 3

/** An overlap this small is a rounding error, not a bubble resting on another. */
export const CLEARED = 1e-9

/**
 * A point put inside the buildable line with a radius to spare, clear of every side rather than of
 * the nearest one, or a bubble in a corner would be pushed off one side into the other. The line is
 * a wall and is never traded. A room too big for the floor comes to rest at the middle instead,
 * which is the one place a bubble wider than the ground it stands on can settle.
 */
export function putInside(inside: Buildable, at: Point, radius: number): Point {
  if (inside.sides.length < 3) return at
  const room = Math.min(radius, inside.deepest)
  let [x, y] = at
  if (!pointInPolygon(inside.polygon, [x, y])) {
    // Off the floor altogether: back to the nearest line and a radius in towards the middle.
    const { at: edge } = nearestSide(inside.sides, inside.middle, x, y)
    const toX = inside.middle[0] - edge[0]
    const toY = inside.middle[1] - edge[1]
    const length = Math.hypot(toX, toY) || 1
    x = edge[0] + (toX / length) * room
    y = edge[1] + (toY / length) * room
  }
  for (let pass = 0; pass < SIDE_PASSES; pass++) {
    let clear = true
    for (const side of inside.sides) {
      const q = nearestOnSegment(side.from, side.to, x, y)
      const dx = x - q[0]
      const dy = y - q[1]
      const away = Math.hypot(dx, dy)
      if (away >= room - CLEARED) continue
      clear = false
      // Standing on the line itself there is no direction to come back along; the side's own way
      // in gives one, and past the end of a side it is the corner that pushes the bubble off.
      const ux = away < 1e-9 ? side.inward[0] : dx / away
      const uy = away < 1e-9 ? side.inward[1] : dy / away
      x = q[0] + ux * room
      y = q[1] + uy * room
    }
    if (clear) break
  }
  return [x, y]
}

/**
 * A whole body held inside the line: a disc by its own centre, a corridor by each of its ends, and
 * the move a corridor makes is the mean of what its two ends ask, so it slides in rather than turns.
 */
export function holdInside(inside: Buildable, placed: Placed, radius: number): Point {
  if (placed.half < 1e-9) return putInside(inside, [placed.x, placed.y], radius)
  const dx = Math.cos(placed.angle) * placed.half
  const dy = Math.sin(placed.angle) * placed.half
  const one = putInside(inside, [placed.x - dx, placed.y - dy], radius)
  const other = putInside(inside, [placed.x + dx, placed.y + dy], radius)
  return [(one[0] + other[0]) / 2, (one[1] + other[1]) / 2]
}
