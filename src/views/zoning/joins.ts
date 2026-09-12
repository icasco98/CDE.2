import {
  area,
  centroid,
  sharedWalls,
  unionPolygons,
  WALL_TOLERANCE,
  type Point,
  type Polygon,
} from '../../geometry'
import type { Edge } from '../../model'
import { metres2 } from '../requirements/format'

/** A room standing on the storey, as a join reads it. */
type Joinable = {
  readonly id: string
  readonly name: string
  readonly outline: Polygon
  /** The area the room really covers, so a curved wall is read by its curve and not its chords. */
  readonly measure: number
}

/**
 * Rooms an open connection runs between that also meet along a wall. They stay two rooms in the
 * graph with two footprints and two areas; only the drawing changes, to the one outline the two
 * of them make.
 */
export type Join = {
  /** The rooms of the join, in the order they stand on the storey, `a:b`. */
  readonly key: string
  readonly ids: readonly string[]
  /** The open edges inside the join: their wall is gone, so their doors are not drawn. */
  readonly edgeIds: readonly string[]
  /** The union's rings, each piece's outer ring before its holes. */
  readonly rings: readonly Polygon[]
  /** The largest of those rings, which the one label is placed and sized inside. */
  readonly outline: Polygon
  /** Where that label stands. */
  readonly at: Point
  /** Every name and every area, because a join is one space and still two rooms. */
  readonly label: string
}

function reach(next: Map<string, string[]>, from: string, to: string): void {
  const standing = next.get(from)
  if (standing) standing.push(to)
  else next.set(from, [to])
}

/** The largest ring of the union: the rooms meet along a wall, so all but one is a sliver. */
function largest(rings: readonly Polygon[]): Polygon {
  let best: Polygon = []
  let widest = -Infinity
  for (const ring of rings) {
    const measure = area(ring)
    if (measure <= widest) continue
    widest = measure
    best = ring
  }
  return best
}

/**
 * Every set of rooms on the storey chained by open edges across walls they share. An open edge
 * between rooms that have come apart is no join: the edge is drawn as a tension, as it is for
 * any other kind, and the two rooms are drawn as themselves again.
 */
export function joinsOf(standing: readonly Joinable[], edges: readonly Edge[]): readonly Join[] {
  const rooms = new Map(standing.map((room) => [room.id, room]))
  const open = edges.filter((edge) => {
    if (edge.kind !== 'open') return false
    const a = rooms.get(edge.a)
    const b = rooms.get(edge.b)
    if (!a || !b) return false
    return sharedWalls(a.outline, b.outline, WALL_TOLERANCE).length > 0
  })
  if (open.length === 0) return []

  const next = new Map<string, string[]>()
  for (const edge of open) {
    reach(next, edge.a, edge.b)
    reach(next, edge.b, edge.a)
  }

  const seen = new Set<string>()
  const joins: Join[] = []
  for (const room of standing) {
    if (seen.has(room.id) || !next.has(room.id)) continue
    const group = new Set<string>([room.id])
    const queue: string[] = [room.id]
    for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
      for (const other of next.get(id) ?? []) {
        if (group.has(other)) continue
        group.add(other)
        queue.push(other)
      }
    }
    for (const id of group) seen.add(id)
    const members = standing.filter((entry) => group.has(entry.id))
    const rings = unionPolygons(members.map((member) => member.outline)).flatMap((piece) =>
      piece.filter((ring) => ring.length >= 3),
    )
    const outline = largest(rings)
    joins.push({
      key: members.map((member) => member.id).join(':'),
      ids: members.map((member) => member.id),
      edgeIds: open.filter((edge) => group.has(edge.a)).map((edge) => edge.id),
      rings,
      outline,
      at: centroid(outline),
      label: members.map((member) => `${member.name} ${metres2(member.measure)} m²`).join(' · '),
    })
  }
  return joins
}
