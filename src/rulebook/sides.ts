import { area, outwardWalls, pointInPolygon, type Point, type Polygon } from '../geometry'
import { buildableArea, setbackDepth, type PlotShape } from './setbacks'

/**
 * One side of the plot as the walls and the forces read it: not the boundary itself but the line
 * the setback leaves inside it, which is where a room at that boundary really stands.
 */
export type PlotSide = {
  /** The plot polygon's own side number, which is what `Plot.street` names. */
  readonly index: number
  readonly from: Point
  readonly to: Point
  /** The unit normal pointing into the floor. */
  readonly inward: Point
  readonly street: boolean
  readonly length: number
}

/**
 * The plot's sides under the names forces.md gives them: the street sides are the ones the plot
 * marks, the back is the side opposite the service street, and a side is any of the others.
 */
export type PlotSides = {
  readonly every: readonly PlotSide[]
  readonly street: readonly PlotSide[]
  /** The frontage a villa addresses; absent on a plot with no street at all. */
  readonly service?: PlotSide
  readonly back?: PlotSide
  readonly sides: readonly PlotSide[]
  /** Where the service street meets another street, on a plot with two of them. */
  readonly corner?: Point
}

function lengthOf(from: Point, to: Point): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1])
}

/**
 * The part of a segment that lies inside a polygon, as the longest unbroken run of it. The line is
 * a boundary of that polygon wherever the setbacks were square, so each run is tested a little way
 * in from the line rather than on it, where inside and outside cannot be told apart.
 */
function insideRun(from: Point, to: Point, inward: Point, polygon: Polygon): [Point, Point] | null {
  const run = lengthOf(from, to)
  if (run < 1e-9 || polygon.length < 3) return null
  const cuts = [0, 1]
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const denominator = dx * ey - dy * ex
    if (Math.abs(denominator) < 1e-12) continue
    const t = ((a[0] - from[0]) * ey - (a[1] - from[1]) * ex) / denominator
    const s = ((a[0] - from[0]) * dy - (a[1] - from[1]) * dx) / denominator
    if (t > 0 && t < 1 && s >= 0 && s <= 1) cuts.push(t)
  }
  cuts.sort((one, other) => one - other)
  let best: [Point, Point] | null = null
  let longest = 0
  for (let i = 0; i + 1 < cuts.length; i++) {
    const low = cuts[i] ?? 0
    const high = cuts[i + 1] ?? 0
    const middle = (low + high) / 2
    const probe: Point = [
      from[0] + dx * middle + inward[0] * 0.01,
      from[1] + dy * middle + inward[1] * 0.01,
    ]
    if (!pointInPolygon(polygon, probe)) continue
    const span = (high - low) * run
    if (span <= longest) continue
    longest = span
    best = [
      [from[0] + dx * low, from[1] + dy * low],
      [from[0] + dx * high, from[1] + dy * high],
    ]
  }
  return best
}

/** Where two lines cross, or nothing when they run together. */
function meetingOf(one: PlotSide, other: PlotSide): Point | undefined {
  const ax = one.to[0] - one.from[0]
  const ay = one.to[1] - one.from[1]
  const bx = other.to[0] - other.from[0]
  const by = other.to[1] - other.from[1]
  const denominator = ax * by - ay * bx
  if (Math.abs(denominator) < 1e-9) return undefined
  const t = ((other.from[0] - one.from[0]) * by - (other.from[1] - one.from[1]) * bx) / denominator
  return [one.from[0] + ax * t, one.from[1] + ay * t]
}

/**
 * The plot read into the sides the forces pull toward. The service street is the first of the
 * sides the plot marks, going round the boundary: on a corner plot that is the frontage the villa
 * addresses, and the other is the side street the service entrance goes on.
 */
export function sidesOf(plot: PlotShape): PlotSides {
  const walls = outwardWalls(plot.polygon)
  const inside = buildableArea(plot)
  if (walls.length < 3 || inside.length < 3) return { every: [], street: [], sides: [] }
  const plotArea = area(plot.polygon)
  const every: PlotSide[] = []
  for (const [index, wall] of walls.entries()) {
    const street = plot.street.includes(index)
    const inward: Point = [-wall.normal[0], -wall.normal[1]]
    const depth = setbackDepth(plotArea, street)
    const run = insideRun(
      [wall.from[0] + inward[0] * depth, wall.from[1] + inward[1] * depth],
      [wall.to[0] + inward[0] * depth, wall.to[1] + inward[1] * depth],
      inward,
      inside,
    )
    if (!run) continue
    every.push({
      index,
      from: run[0],
      to: run[1],
      inward,
      street,
      length: lengthOf(run[0], run[1]),
    })
  }
  const street = every.filter((side) => side.street)
  const service = [...street].sort((one, other) => one.index - other.index)[0]
  if (!service) return { every, street, sides: every }
  // The back is the side that faces the service street across the floor, which on any plot is the
  // one whose way in points most nearly the other way.
  const back = every
    .filter((side) => side !== service)
    .sort(
      (one, other) =>
        one.inward[0] * service.inward[0] +
        one.inward[1] * service.inward[1] -
        (other.inward[0] * service.inward[0] + other.inward[1] * service.inward[1]),
    )[0]
  const sides = every.filter((side) => side !== service && side !== back)
  const other = street.find((side) => side !== service)
  const corner = other ? meetingOf(service, other) : undefined
  return {
    every,
    street,
    service,
    ...(back === undefined ? {} : { back }),
    sides,
    ...(corner === undefined ? {} : { corner }),
  }
}

/** The nearest point of a side to somewhere on the floor. */
export function nearestOn(side: PlotSide, x: number, y: number): Point {
  const dx = side.to[0] - side.from[0]
  const dy = side.to[1] - side.from[1]
  const run = dx * dx + dy * dy
  if (run < 1e-12) return side.from
  const along = Math.min(1, Math.max(0, ((x - side.from[0]) * dx + (y - side.from[1]) * dy) / run))
  return [side.from[0] + dx * along, side.from[1] + dy * along]
}
