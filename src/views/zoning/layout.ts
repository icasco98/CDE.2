import { storeyLabel } from '../../rulebook'
import {
  area,
  boundingBox,
  centroid,
  footprintsOverlap,
  isOutsideBoundary,
  outlineOf,
  rectangleToPolygon,
  sharedArea,
  shiftFootprintInside,
  translateFootprint,
  type Footprint,
  type Point,
  type Polygon,
} from '../../geometry'
import { occupiedStoreys, type Edge, type Plot, type Room } from '../../model'
import { defaultProportion, startingRectangle, type RoomSizes } from './defaults'
import type { Attempt } from './gestures'
import type { Placement } from './types'

/** How many rounds of parting a storey is given before it is called too crowded to lay out. */
const ROUNDS = 200

/** Less common ground than this is the rounding of the booleans, not one room over another, in m². */
const OVERLAP_AREA_M2 = 1e-6

/** A room as the relaxation moves it: its outline now, and the weight it carries in a push. */
type Body = {
  readonly id: string
  readonly name: string
  /** Its floor, which fixes how much of a push it takes: the larger room gives way less. */
  readonly weight: number
  readonly moves: boolean
  footprint: Footprint
}

type Reach = { readonly min: number; readonly max: number }

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The cheap test rejects the many, and only a maybe is settled against the real common area. */
function overlaps(a: Footprint, b: Footprint): boolean {
  if (!footprintsOverlap(a, b)) return false
  // Four corners make a convex outline, on which the separating-axis test is exact; only the
  // shapes a carve has left concave are worth asking the booleans about.
  if (a.polygon.length === 4 && b.polygon.length === 4) return true
  try {
    return sharedArea(a, b) > OVERLAP_AREA_M2
  } catch {
    return true
  }
}

/** How far `polygon` reaches along `u`, which is all a push along one line needs to know of it. */
function reachAlong(polygon: Polygon, u: Point): Reach {
  let min = Infinity
  let max = -Infinity
  for (const p of polygon) {
    const d = p[0] * u[0] + p[1] * u[1]
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return { min, max }
}

/** Every way a wall between the two could face: the normal of each wall of either outline, both ways. */
function facings(a: Polygon, b: Polygon): Point[] {
  const out: Point[] = []
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]
      const q = polygon[(i + 1) % polygon.length]
      if (!p || !q) continue
      const nx = q[1] - p[1]
      const ny = -(q[0] - p[0])
      const length = Math.hypot(nx, ny)
      if (length < 1e-9) continue
      out.push([nx / length, ny / length], [-nx / length, -ny / length])
    }
  return out
}

/**
 * How far `a` and `b` lie over one another along `u`: the shortest travel along that one line
 * that leaves a wall they do not both cross. Taken over every facing rather than along `u` itself,
 * so two rooms meeting at a corner are parted by the corner and not by their whole diagonal.
 */
function overlapAlong(a: Polygon, b: Polygon, u: Point): number {
  let least = Infinity
  for (const facing of facings(a, b)) {
    const towards = u[0] * facing[0] + u[1] * facing[1]
    if (towards <= 1e-9) continue
    const over = reachAlong(a, facing).max - reachAlong(b, facing).min
    if (over <= 0) return 0
    least = Math.min(least, over / towards)
  }
  return Number.isFinite(least) ? least : 0
}

/** Two rooms exactly on top of each other need a direction to part along; their order fixes one. */
function apart(from: Point, to: Point, seed: number): Point {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const distance = Math.hypot(dx, dy)
  if (distance > 1e-9) return [dx / distance, dy / distance]
  return [Math.cos(seed), Math.sin(seed)]
}

/**
 * One pair parted: both are pushed along the line between their centres until they lie over each
 * other no longer, the push split by inverse area and a fixed room taking none of it. A grid step
 * is added to the push because two rooms left exactly touching are put straight back over one
 * another by the next pair parted, and a crowded storey then churns without ever coming to rest.
 * Answers whether they were lying over one another at all.
 */
function part(a: Body, b: Body, seed: number, clearance: number): boolean {
  if (!overlaps(a.footprint, b.footprint)) return false
  const outlineA = outlineOf(a.footprint)
  const outlineB = outlineOf(b.footprint)
  const u = apart(centroid(outlineA), centroid(outlineB), seed)
  const reached = overlapAlong(outlineA, outlineB, u)
  const over = reached <= 0 ? reached : reached + clearance
  if (over <= 0) return true
  const share = !b.moves ? 1 : !a.moves ? 0 : b.weight / (a.weight + b.weight)
  if (a.moves) {
    a.footprint = translateFootprint(a.footprint, [-u[0] * over * share, -u[1] * over * share])
  }
  if (b.moves) {
    const rest = 1 - share
    b.footprint = translateFootprint(b.footprint, [u[0] * over * rest, u[1] * over * rest])
  }
  return true
}

/** Who each room is linked to on this storey, so a room the diagram never drew can stand with its own. */
function linksOn(
  edges: readonly Edge[],
  storey: number,
  ids: ReadonlySet<string>,
): Map<string, string[]> {
  const links = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.storey !== storey || !ids.has(edge.a) || !ids.has(edge.b)) continue
    links.set(edge.a, [...(links.get(edge.a) ?? []), edge.b])
    links.set(edge.b, [...(links.get(edge.b) ?? []), edge.a])
  }
  return links
}

/** The plot's own range along one axis, pulled in by half a room so nothing opens over the boundary. */
function inset(low: number, length: number, room: number): Reach {
  if (length <= room) return { min: low + length / 2, max: low + length / 2 }
  return { min: low + room / 2, max: low + length - room / 2 }
}

/** How far a set of places spreads along one axis; an empty set has no width and lands on the middle. */
function spread(places: readonly Point[], axis: 0 | 1): Reach {
  let min = Infinity
  let max = -Infinity
  for (const at of places) {
    min = Math.min(min, at[axis])
    max = Math.max(max, at[axis])
  }
  return { min, max }
}

/** A place in the diagram read across into the plot; a range with no width lands on the middle. */
function across(value: number, from: Reach, to: Reach): number {
  if (!(from.max - from.min > 1e-9)) return (to.min + to.max) / 2
  return to.min + ((value - from.min) / (from.max - from.min)) * (to.max - to.min)
}

function sizeOf(room: Room, sizes: ReadonlyMap<string, RoomSizes>) {
  return startingRectangle(room.targetArea, sizes.get(room.type)?.proportion ?? defaultProportion)
}

function rectangleAt(
  at: Point,
  size: { readonly width: number; readonly depth: number },
): Footprint {
  return {
    polygon: rectangleToPolygon({
      left: at[0] - size.width / 2,
      top: at[1] - size.depth / 2,
      width: size.width,
      depth: size.depth,
    }),
    rotation: 0,
  }
}

/** The names read as a person would say them: one, two joined by "and", more by commas and "and". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Where the bubbles put every room of the storey. A bubble is already a point on the plot, the
 * frame a footprint uses, so a stair reads at the same point on every storey it serves. The whole
 * storey is taken, placed rooms included, so the same diagram reads across into the same plot
 * however many rooms have already been put down by hand.
 */
function spotsOn(
  onStorey: readonly Room[],
  edges: readonly Edge[],
  storey: number,
): Map<string, Point> {
  const spots = new Map<string, Point>()
  for (const room of onStorey) {
    if (!room.bubble) continue
    spots.set(room.id, [room.bubble.x, room.bubble.y])
  }
  // A room the diagram drew no bubble for stands with whatever it is linked to on this storey;
  // only a room linked to nothing with a bubble is left without a place and opens at the centre.
  const links = linksOn(edges, storey, new Set(onStorey.map((room) => room.id)))
  const borrowed = new Map<string, Point>()
  for (const room of onStorey) {
    if (spots.has(room.id)) continue
    const near = (links.get(room.id) ?? [])
      .map((id) => spots.get(id))
      .filter((at) => at !== undefined)
    if (near.length === 0) continue
    const sum = near.reduce((total, at) => [total[0] + at[0], total[1] + at[1]] as Point, [
      0, 0,
    ] as Point)
    borrowed.set(room.id, [sum[0] / near.length, sum[1] / near.length])
  }
  for (const [id, at] of borrowed) spots.set(id, at)
  return spots
}

/**
 * The plan the bubble diagram already draws: every unplaced room on the storey opened at its
 * target size where its bubble stands, then parted from whatever it landed over and held inside
 * the plot. Nothing is rotated, resized or carved, and nothing is searched for: the same diagram
 * gives the same plan every time. A storey too crowded to part is refused whole.
 */
export function layOut(
  rooms: readonly Room[],
  edges: readonly Edge[],
  plot: Plot,
  storey: number,
  sizes: ReadonlyMap<string, RoomSizes>,
  gridM: number,
): Attempt<readonly Placement[]> {
  const onStorey = rooms.filter((room) => occupiedStoreys(room).includes(storey))
  const moving = onStorey.filter((room) => !room.footprint).sort(byId)
  if (moving.length === 0) return { ok: true, value: [] }

  const spots = spotsOn(onStorey, edges, storey)
  const bounds = boundingBox(plot.polygon)
  const centre: Point = [bounds.left + bounds.width / 2, bounds.top + bounds.depth / 2]
  const opens = new Map(moving.map((room) => [room.id, sizeOf(room, sizes)]))
  let widest = 0
  let deepest = 0
  for (const size of opens.values()) {
    widest = Math.max(widest, size.width)
    deepest = Math.max(deepest, size.depth)
  }
  const places = [...spots.values()]
  const fromX = spread(places, 0)
  const fromY = spread(places, 1)
  const toX = inset(bounds.left, bounds.width, widest)
  const toY = inset(bounds.top, bounds.depth, deepest)

  const bodies: Body[] = moving.map((room) => {
    const bubble = spots.get(room.id)
    const at: Point = bubble
      ? [across(bubble[0], fromX, toX), across(bubble[1], fromY, toY)]
      : centre
    const size = opens.get(room.id) ?? { width: gridM, depth: gridM }
    return {
      id: room.id,
      name: room.name,
      weight: size.width * size.depth,
      moves: true,
      footprint: rectangleAt(at, size),
    }
  })
  const obstacles: Body[] = [...onStorey].sort(byId).flatMap((room) =>
    room.footprint
      ? [
          {
            id: room.id,
            name: room.name,
            weight: area(outlineOf(room.footprint)),
            moves: false,
            footprint: room.footprint,
          },
        ]
      : [],
  )

  const hold = (): void => {
    if (!plot.on) return
    for (const body of bodies) {
      body.footprint = translateFootprint(
        body.footprint,
        shiftFootprintInside(body.footprint, plot.polygon),
      )
    }
  }

  const clearance = gridM > 0 ? gridM : 0
  hold()
  for (let round = 0; round < ROUNDS; round++) {
    let parted = false
    for (const [index, body] of bodies.entries()) {
      for (let other = index + 1; other < bodies.length; other++) {
        const against = bodies[other]
        if (against && part(body, against, index + other, clearance)) parted = true
      }
      for (const [count, obstacle] of obstacles.entries())
        if (part(body, obstacle, index + count, clearance)) parted = true
    }
    if (!parted) break
    hold()
  }

  snapCorners(bodies, obstacles, plot, gridM)

  const crowded = bodies.filter((body) =>
    [...bodies, ...obstacles].some(
      (other) => other !== body && overlaps(body.footprint, other.footprint),
    ),
  )
  if (crowded.length > 0) {
    return {
      ok: false,
      reason: `Not enough room on ${storeyLabel(storey)} for ${listed(crowded.map((body) => body.name))}; enlarge the plot or unplace something`,
    }
  }
  return { ok: true, value: bodies.map((body) => ({ id: body.id, footprint: body.footprint })) }
}

/**
 * Each room's north-west corner taken to the nearest grid line, in room order by id, and the snap
 * undone where it would put the room over a neighbour or outside a plot that binds: the grid is a
 * tidiness, never a reason to break the layout it is tidying.
 */
function snapCorners(bodies: Body[], obstacles: readonly Body[], plot: Plot, gridM: number): void {
  if (!(gridM > 0)) return
  const to = (value: number): number => Math.round(value / gridM) * gridM
  for (const body of bodies) {
    const corner = boundingBox(outlineOf(body.footprint))
    const snapped = translateFootprint(body.footprint, [
      to(corner.left) - corner.left,
      to(corner.top) - corner.top,
    ])
    const was = body.footprint
    body.footprint = snapped
    const spoiled =
      (plot.on && isOutsideBoundary(snapped, plot.polygon)) ||
      [...bodies, ...obstacles].some(
        (other) => other !== body && overlaps(snapped, other.footprint),
      )
    if (spoiled) body.footprint = was
  }
}
