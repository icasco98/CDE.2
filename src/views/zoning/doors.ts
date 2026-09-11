import {
  centroid,
  nearestPointOnBoundary,
  nearestPointOnSegment,
  outwardWalls,
  sharedWalls,
  type Point,
  type Polygon,
  type SharedWall,
} from '../../geometry'
import { EXTERIOR, type Edge, type EdgeKind, type Plot } from '../../model'

/** How far apart two walls may lie and still be read as the one wall, in metres. */
const WALL_TOLERANCE = 0.05

/** How near a stored hint must be to a shared wall for the door to be drawn where it says. */
const HINT_TOLERANCE = 0.1

/** The shortest shared wall a door is worth proposing through, in metres. */
const PROPOSAL_M = 0.9

/** A room standing on the storey being drawn. */
export type Standing = { readonly id: string; readonly outline: Polygon }

/** Where a door is drawn: the point on the wall and the wall's own direction. */
export type DoorMark = {
  readonly edgeId: string
  readonly kind: EdgeKind
  readonly at: Point
  readonly along: Point
}

/** An edge whose two rooms are placed but share no wall. */
export type TensionMark = {
  readonly edgeId: string
  readonly kind: EdgeKind
  readonly from: Point
  readonly to: Point
}

/** A wall two rooms share with no edge across it. */
export type ProposalMark = { readonly a: string; readonly b: string; readonly at: Point }

type Segment = readonly [Point, Point]

function lengthOf(wall: SharedWall): number {
  return Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
}

function longest(walls: readonly SharedWall[]): SharedWall | undefined {
  let best: SharedWall | undefined
  let reach = 0
  for (const wall of walls) {
    const run = lengthOf(wall)
    if (run > reach) {
      reach = run
      best = wall
    }
  }
  return best
}

function directionOf(wall: SharedWall): Point {
  const run = lengthOf(wall)
  if (run < 1e-9) return [1, 0]
  return [(wall.to[0] - wall.from[0]) / run, (wall.to[1] - wall.from[1]) / run]
}

function midpointOf(wall: SharedWall): Point {
  return [(wall.from[0] + wall.to[0]) / 2, (wall.from[1] + wall.to[1]) / 2]
}

/** The wall the hint sits on, where one is within reach, so a door stays where it was drawn. */
function hinted(walls: readonly SharedWall[], at: Point): { wall: SharedWall; at: Point } | null {
  for (const wall of walls) {
    const on = nearestPointOnSegment(at, wall.from, wall.to)
    if (Math.hypot(on[0] - at[0], on[1] - at[1]) <= HINT_TOLERANCE) return { wall, at: on }
  }
  return null
}

/** The sides of the plot that face a street, or every side where none is marked. */
export function streetSides(plot: Plot): readonly Segment[] {
  const { polygon } = plot
  if (polygon.length < 3) return []
  const wanted = plot.street.length > 0 ? plot.street : polygon.map((_unused, index) => index)
  const sides: Segment[] = []
  for (const index of wanted) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    if (from && to) sides.push([from, to])
  }
  return sides
}

/**
 * The point of `outline` nearest any street side. For two segments the nearest pair always has an
 * end of one of them in it, so walking the outline's corners against each side and each side's
 * ends against the outline finds it exactly.
 */
function nearestToStreet(outline: Polygon, streets: readonly Segment[]): Point | null {
  let best: Point | null = null
  let reach = Infinity
  for (const [from, to] of streets) {
    for (const corner of outline) {
      const on = nearestPointOnSegment(corner, from, to)
      const distance = Math.hypot(on[0] - corner[0], on[1] - corner[1])
      if (distance < reach) {
        reach = distance
        best = corner
      }
    }
    for (const end of [from, to]) {
      const on = nearestPointOnBoundary(outline, end)
      const distance = Math.hypot(on[0] - end[0], on[1] - end[1])
      if (distance < reach) {
        reach = distance
        best = on
      }
    }
  }
  return best
}

/** The run of wall the point sits on, so a door on an outline is drawn along it. */
function directionAt(outline: Polygon, at: Point): Point {
  let best: Point = [1, 0]
  let reach = Infinity
  for (const wall of outwardWalls(outline)) {
    const on = nearestPointOnSegment(at, wall.from, wall.to)
    const distance = Math.hypot(on[0] - at[0], on[1] - at[1])
    if (distance >= reach) continue
    reach = distance
    best = [-wall.normal[1], wall.normal[0]]
  }
  return best
}

function outlineFor(standing: readonly Standing[], id: string): Polygon | undefined {
  return standing.find((room) => room.id === id)?.outline
}

/**
 * Every edge of the storey drawn: a door on the wall its two rooms share, or a tension between
 * their centroids where they share none. A door is the drawing of an edge and never the other way
 * about, so an edge with a room missing from the storey draws nothing.
 */
export function edgeMarks(
  standing: readonly Standing[],
  edges: readonly Edge[],
  plot: Plot,
): { readonly doors: readonly DoorMark[]; readonly tensions: readonly TensionMark[] } {
  const doors: DoorMark[] = []
  const tensions: TensionMark[] = []
  const streets = streetSides(plot)
  for (const edge of edges) {
    const outside = edge.a === EXTERIOR || edge.b === EXTERIOR
    if (outside) {
      const outline = outlineFor(standing, edge.a === EXTERIOR ? edge.b : edge.a)
      const at = outline ? nearestToStreet(outline, streets) : null
      if (at && outline)
        doors.push({ edgeId: edge.id, kind: edge.kind, at, along: directionAt(outline, at) })
      continue
    }
    const a = outlineFor(standing, edge.a)
    const b = outlineFor(standing, edge.b)
    if (!a || !b) continue
    const walls = sharedWalls(a, b, WALL_TOLERANCE)
    const hint = edge.hint ? hinted(walls, edge.hint.at) : null
    const wall = hint?.wall ?? longest(walls)
    if (!wall) {
      tensions.push({
        edgeId: edge.id,
        kind: edge.kind,
        from: centroid(a),
        to: centroid(b),
      })
      continue
    }
    doors.push({
      edgeId: edge.id,
      kind: edge.kind,
      at: hint?.at ?? midpointOf(wall),
      along: directionOf(wall),
    })
  }
  return { doors, tensions }
}

/**
 * A mark on every wall long enough for a door that no edge crosses. It is an offer and nothing
 * else: the graph changes only when a person clicks one.
 */
export function proposalsFrom(
  standing: readonly Standing[],
  edges: readonly Edge[],
  storey: number,
): readonly ProposalMark[] {
  const joined = new Set(
    edges
      .filter((edge) => edge.storey === storey)
      .map((edge) => (edge.a <= edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`)),
  )
  const marks: ProposalMark[] = []
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = standing[i]
      const b = standing[j]
      if (!a || !b) continue
      const key = a.id <= b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (joined.has(key)) continue
      const wall = longest(sharedWalls(a.outline, b.outline, WALL_TOLERANCE))
      if (!wall || lengthOf(wall) < PROPOSAL_M) continue
      marks.push({ a: a.id, b: b.id, at: midpointOf(wall) })
    }
  }
  return marks
}
