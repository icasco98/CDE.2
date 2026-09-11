import {
  centroid,
  nearestPointOnBoundary,
  nearestPointOnSegment,
  outwardWalls,
  sharedWalls,
  wallDirection,
  wallLength,
  wallMidpoint,
  WALL_TOLERANCE,
  type Point,
  type Polygon,
  type SharedWall,
} from '../../geometry'
import { EXTERIOR, type Edge, type EdgeKind, type Plot } from '../../model'

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

/** Two rooms of the storey, the longest wall they hold in common, and the room of the two that
 * reaches back the shorter way from it, so a handle on that wall is never wider than its rooms. */
export type WallPair = {
  readonly a: string
  readonly b: string
  readonly wall: SharedWall
  readonly across: number
}

type Segment = readonly [Point, Point]

function longest(walls: readonly SharedWall[]): SharedWall | undefined {
  let best: SharedWall | undefined
  let reach = 0
  for (const wall of walls) {
    const run = wallLength(wall)
    if (run > reach) {
      reach = run
      best = wall
    }
  }
  return best
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
      at: hint?.at ?? wallMidpoint(wall),
      along: wallDirection(wall),
    })
  }
  return { doors, tensions }
}

/** How far a room reaches from end to end across a wall, in metres. */
function reachAcross(outline: Polygon, wall: SharedWall): number {
  const along = wallDirection(wall)
  const across: Point = [-along[1], along[0]]
  let least = Infinity
  let most = -Infinity
  for (const corner of outline) {
    const off = (corner[0] - wall.from[0]) * across[0] + (corner[1] - wall.from[1]) * across[1]
    least = Math.min(least, off)
    most = Math.max(most, off)
  }
  return most - least
}

/**
 * Every pair of rooms on the storey that meet along a wall, with the longest run they share. The
 * proposal marks and the wall handles are both drawn from this one pass over the pairs.
 */
export function wallPairs(standing: readonly Standing[]): readonly WallPair[] {
  const pairs: WallPair[] = []
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = standing[i]
      const b = standing[j]
      if (!a || !b) continue
      const wall = longest(sharedWalls(a.outline, b.outline, WALL_TOLERANCE))
      if (!wall) continue
      const across = Math.min(reachAcross(a.outline, wall), reachAcross(b.outline, wall))
      pairs.push({ a: a.id, b: b.id, wall, across })
    }
  }
  return pairs
}

/**
 * A mark on every wall long enough for a door that no edge crosses. It is an offer and nothing
 * else: the graph changes only when a person clicks one.
 */
export function proposalsFrom(
  pairs: readonly WallPair[],
  edges: readonly Edge[],
  storey: number,
): readonly ProposalMark[] {
  const joined = new Set(
    edges
      .filter((edge) => edge.storey === storey)
      .map((edge) => (edge.a <= edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`)),
  )
  const marks: ProposalMark[] = []
  for (const pair of pairs) {
    const key = pair.a <= pair.b ? `${pair.a}|${pair.b}` : `${pair.b}|${pair.a}`
    if (joined.has(key)) continue
    if (wallLength(pair.wall) < PROPOSAL_M) continue
    marks.push({ a: pair.a, b: pair.b, at: wallMidpoint(pair.wall) })
  }
  return marks
}
