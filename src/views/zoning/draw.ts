import {
  GRID_M,
  angleOf,
  arcPoints,
  arcRun,
  exactArea,
  frameOf,
  arcThrough,
  placeInFrame,
  sheetToLocalPoint,
  snapPointToGrid,
  type Arc,
  type Footprint,
  type Point,
  type Polygon,
} from '../../geometry'

/** A shape this small is a slip of the hand rather than a room, in m². */
export const SMALLEST_DRAWN_M2 = 1

/** A circle's radius lands on whole steps of this many metres, once the hand is dragging it. */
const RADIUS_STEP_M = 0.25

/**
 * A circle drawn for the room's target area steps in this many metres instead: a centimetre, what
 * a builder sets a wall out to, rather than the grid the hand drags to. The area a step of `s`
 * gives up is about `2 * (s / 2) / r` of it (the radius error is at most half a step, and area
 * grows with the square of the radius), so it shrinks as the room grows; even at r ≈ 1 m — the
 * smallest rooms a person circles, like a 3 m² guest WC — that keeps the click under 1% of target.
 */
const TARGET_RADIUS_STEP_M = 0.01

/** A polygon needs three corners; below that a room has no inside. */
const FEWEST_CORNERS = 3

/**
 * A corner the hand has put down, with the point the wall arriving at it was dragged through
 * where that wall is a curve. The wall that closes the shape carries no such point: there is no
 * corner after it to hang one on, so a closing wall is always straight.
 */
export type Corner = { readonly at: Point; readonly through?: Point }

/** A radius to the nearest quarter metre, never under one step. */
export function snapRadius(metres: number): number {
  return Math.max(RADIUS_STEP_M, Math.round(metres / RADIUS_STEP_M) * RADIUS_STEP_M)
}

/** The radius of the circle of exactly `targetArea`, to the nearest 0.01 m (see the step above). */
export function targetRadius(targetArea: number): number {
  const exact = Math.sqrt(targetArea / Math.PI)
  return Math.max(
    TARGET_RADIUS_STEP_M,
    Math.round(exact / TARGET_RADIUS_STEP_M) * TARGET_RADIUS_STEP_M,
  )
}

/**
 * The corners walked into a polygon, every curved wall opened into its run of vertices and
 * remembered as an arc. The vertices of a curve come from the circle rather than from the hand,
 * so every one of them lies on it and the invariant holds.
 */
export function drawnPolygon(corners: readonly Corner[]): {
  readonly polygon: Polygon
  readonly arcs: readonly Arc[]
} {
  const polygon: Point[] = []
  const arcs: Arc[] = []
  for (const [index, corner] of corners.entries()) {
    const previous = corners[index - 1]
    if (!previous) {
      polygon.push(corner.at)
      continue
    }
    const circle = corner.through ? arcThrough(previous.at, corner.through, corner.at) : null
    if (!circle) {
      polygon.push(corner.at)
      continue
    }
    const from = polygon.length - 1
    const run = arcPoints(
      circle.centre,
      circle.radius,
      angleOf(circle.centre, previous.at),
      angleOf(circle.centre, corner.at),
      circle.clockwise,
    )
    for (const at of run.slice(1)) polygon.push(at)
    arcs.push({ ...circle, from, to: polygon.length - 1 })
  }
  return { polygon, arcs }
}

function withArcs(polygon: Polygon, arcs: readonly Arc[]): Footprint {
  return { polygon, rotation: 0, ...(arcs.length === 0 ? {} : { arcs }) }
}

/** The whole circle as a footprint: one arc from the first vertex round to itself. */
export function circleFootprint(centre: Point, radius: number): Footprint {
  const run = arcPoints(centre, radius, 0, 0, true)
  return withArcs(run.slice(0, -1), [{ from: 0, to: 0, centre, radius, clockwise: true }])
}

function segments(polygon: Polygon): [Point, Point][] {
  return polygon.map((at, index) => [at, polygon[(index + 1) % polygon.length] ?? at])
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point): number =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const one = side(a, b, c)
  const two = side(a, b, d)
  const three = side(c, d, a)
  const four = side(c, d, b)
  return one * two < 0 && three * four < 0
}

/** True where two walls that do not meet at a corner cross each other, which is no room at all. */
export function selfIntersects(polygon: Polygon): boolean {
  const walls = segments(polygon)
  for (let i = 0; i < walls.length; i += 1) {
    for (let j = i + 2; j < walls.length; j += 1) {
      if (i === 0 && j === walls.length - 1) continue
      const [a, b] = walls[i] ?? []
      const [c, d] = walls[j] ?? []
      if (a && b && c && d && crosses(a, b, c, d)) return true
    }
  }
  return false
}

export type Drawn =
  | { readonly ok: true; readonly footprint: Footprint }
  | { readonly ok: false; readonly reason: string }

/** The shape the hand closed, or the sentence saying why it is no room. */
export function closedFootprint(corners: readonly Corner[]): Drawn {
  if (corners.length < FEWEST_CORNERS)
    return { ok: false, reason: 'a room needs at least three corners' }
  const { polygon, arcs } = drawnPolygon(corners)
  if (selfIntersects(polygon)) return { ok: false, reason: 'its walls cross one another' }
  const footprint = withArcs(polygon, arcs)
  if (exactArea(footprint) < SMALLEST_DRAWN_M2)
    return { ok: false, reason: `it covers less than ${SMALLEST_DRAWN_M2} m²` }
  return { ok: true, footprint }
}

/** The arcs an edit leaves standing: `gone` reads each arc's run, and `move` puts its ends back. */
function arcsLeft(
  footprint: Footprint,
  gone: (run: readonly number[]) => boolean,
  move: (at: number) => number,
): Arc[] {
  const arcs = footprint.arcs
  if (!arcs) return []
  const vertices = footprint.polygon.length
  return arcs
    .filter((arc) => !gone(arcRun(arc, vertices)))
    .map((arc) => ({ ...arc, from: move(arc.from), to: move(arc.to) }))
}

/** The footprint rewritten in its own frame, so the room keeps the rotation it stands at. */
function reshaped(footprint: Footprint, polygon: Polygon, arcs: readonly Arc[]): Footprint {
  return placeInFrame(
    polygon,
    frameOf(footprint),
    footprint.rotation,
    arcs.length === 0 ? undefined : arcs,
  )
}

/** One vertex taken to a point on the sheet, on the grid, and any curve through it made straight. */
export function movedVertex(footprint: Footprint, index: number, to: Point): Footprint {
  const local = sheetToLocalPoint(snapPointToGrid(to), frameOf(footprint))
  const polygon = footprint.polygon.map((at, where) => (where === index ? local : at))
  return reshaped(
    footprint,
    polygon,
    arcsLeft(
      footprint,
      (run) => run.includes(index),
      (at) => at,
    ),
  )
}

/** A corner put in at the middle of the wall that leaves vertex `index`. */
export function addedVertex(footprint: Footprint, index: number): Footprint {
  const polygon = footprint.polygon
  const a = polygon[index]
  const b = polygon[(index + 1) % polygon.length]
  if (!a || !b) return footprint
  const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const grown = [...polygon.slice(0, index + 1), middle, ...polygon.slice(index + 1)]
  // The new corner sits on the wall that leaves `index`, so the curve running along that wall is
  // the one that goes: a run that ends at `index` does not reach the wall and is kept. Every arc
  // that stays keeps its run, one vertex further along where it follows the corner put in.
  return reshaped(
    footprint,
    grown,
    arcsLeft(
      footprint,
      (run) => run.slice(0, -1).includes(index),
      (at) => (at > index ? at + 1 : at),
    ),
  )
}

/** A corner taken out, or nothing where the room would be left with fewer than three. */
export function removedVertex(footprint: Footprint, index: number): Footprint | null {
  if (footprint.polygon.length <= FEWEST_CORNERS) return null
  const polygon = footprint.polygon.filter((_unused, where) => where !== index)
  const arcs = arcsLeft(
    footprint,
    (run) => run.includes(index),
    (at) => (at > index ? at - 1 : at),
  )
  return reshaped(footprint, polygon, arcs)
}

/** How close to the first corner the hand has to come for a click to close the shape, in metres. */
const CLOSE_REACH_M = GRID_M * 2

export function closesAt(corners: readonly Corner[], at: Point): boolean {
  const first = corners[0]
  if (!first || corners.length < FEWEST_CORNERS) return false
  return Math.hypot(at[0] - first.at[0], at[1] - first.at[1]) <= CLOSE_REACH_M
}
