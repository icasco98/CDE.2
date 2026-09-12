import { area, differencePolygons, outwardWalls, type Point, type Polygon } from '../geometry'

/** The plot as the setbacks read one: its boundary and which of its sides face a street. */
export type PlotShape = {
  readonly polygon: Polygon
  /** Indices of the polygon sides that face a street, side `i` running from vertex `i` to `i + 1`. */
  readonly street: readonly number[]
}

/** Where the Municipality's two bands of setback part, in m² of plot. */
export const LARGE_PLOT_M2 = 750

/**
 * Transcribed from rulebook/municipality-private-housing.md, البند الثاني: a plot under 750 m²
 * keeps 2 m from the service street and 1.5 m from every other boundary; 750 m² and above keeps
 * 3 m and 2 m. The sight-angle setback and building on the boundary are not read here.
 */
export const SETBACKS = {
  small: { street: 2, other: 1.5 },
  large: { street: 3, other: 2 },
} as const

export function setbackDepth(plotAreaM2: number, onStreet: boolean): number {
  const band = plotAreaM2 >= LARGE_PLOT_M2 ? SETBACKS.large : SETBACKS.small
  return onStreet ? band.street : band.other
}

/**
 * The strip of plot one side's setback takes: the side moved inward by its own depth, and carried
 * past each end by the depth of the side it meets there. That carry is what mitres the corners —
 * at a square corner the two strips together take exactly the corner the offset lines cut off,
 * and at a reflex corner they take the wedge the offset puts outside the line. Corners that are
 * not square are mitred approximately, which is as far as a rectangle, an L and a corner plot ask.
 */
function strip(
  from: Point,
  to: Point,
  inward: Point,
  depth: number,
  before: number,
  after: number,
): Polygon {
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (run < 1e-9 || depth <= 0) return []
  const along: Point = [(to[0] - from[0]) / run, (to[1] - from[1]) / run]
  const start: Point = [from[0] - along[0] * before, from[1] - along[1] * before]
  const end: Point = [to[0] + along[0] * after, to[1] + along[1] * after]
  return [
    start,
    end,
    [end[0] + inward[0] * depth, end[1] + inward[1] * depth],
    [start[0] + inward[0] * depth, start[1] + inward[1] * depth],
  ]
}

/**
 * The plot offset inward by the Municipality setbacks: what the main building may stand on. A
 * setback can pinch a plot in two, and the larger part is the one a house is drawn in.
 */
export function buildableArea(plot: PlotShape): Polygon {
  const walls = outwardWalls(plot.polygon)
  if (walls.length < 3) return []
  const plotArea = area(plot.polygon)
  const depths = walls.map((_wall, index) => setbackDepth(plotArea, plot.street.includes(index)))
  const strips = walls
    .map((wall, index) =>
      strip(
        wall.from,
        wall.to,
        [-wall.normal[0], -wall.normal[1]],
        depths[index] ?? 0,
        depths[(index + walls.length - 1) % walls.length] ?? 0,
        depths[(index + 1) % walls.length] ?? 0,
      ),
    )
    .filter((quad) => quad.length > 0)
  const left = differencePolygons(plot.polygon, strips)
  let largest: Polygon = []
  for (const piece of left) {
    const ring = piece[0]
    if (ring && area(ring) > area(largest)) largest = ring
  }
  return largest
}

/** How much floor a storey has to stand on, in m²; nought when the setbacks leave nothing. */
export function buildableAreaOf(plot: PlotShape): number {
  return area(buildableArea(plot))
}
