/**
 * The plot the zoning sheet stands on, and the one place its numbers are worked out: the size, the
 * sides that face a street, north, the setback line the rulebook gives a plot that size, the run of
 * boundary each side may be built on, and the floor area the ratio allows. The default is the fresh
 * brief's 500 m² corner plot — 20 m on the service street to the south, 25 m on the side street to
 * the east, neighbours west and north — which stands until a project hands the sheet one of its own.
 */

import { allowedFloorArea, setbackDepth } from '../rulebook'

export type Box = { x: number; y: number; w: number; h: number }

export type Side = 'west' | 'east' | 'north' | 'street'

export const SIDES: readonly Side[] = ['west', 'north', 'east', 'street']

/** On the boundary toward a street: half its run, and no more than this however long it is. */
const STREET_CAP = 15

/** The plot as the sheet draws one: a rectangle, the sides that face a street, and north. */
export type PlotRect = {
  readonly w: number
  readonly h: number
  /** Degrees the north arrow turns clockwise from the sheet's up. */
  readonly north: number
  /** Which sides face a street. */
  readonly streets: readonly Side[]
}

/** Everything about the plot that the sheet, the report and the drawing ask for. */
export type PlotSpec = {
  readonly w: number
  readonly h: number
  readonly north: number
  readonly streets: readonly Side[]
  /** The frontage the house addresses, which takes the deeper setback; none on an inner plot. */
  readonly service: Side | null
  readonly box: Box
  /** Inside the setback line: what the main building may stand on. */
  readonly build: Box
  readonly buildable: number
  readonly budget: Record<Side, number>
  readonly name: Record<Side, string>
  /** The gross floor area the Municipality allows on a plot this size, in m². */
  readonly allowed: number
}

const runOf = (shape: { w: number; h: number }, side: Side): number =>
  side === 'west' || side === 'east' ? shape.h : shape.w

const nameOf = (side: Side, service: Side | null, streets: readonly Side[]): string =>
  side === service || (side === 'street' && !streets.includes('street'))
    ? 'street boundary'
    : streets.includes(side)
      ? 'side-street boundary'
      : `${side} boundary`

/** The plot worked out from its shape: the setback, the budgets and the ratio all follow from it. */
export function plotFrom(shape: PlotRect): PlotSpec {
  const streets = SIDES.filter((side) => shape.streets.includes(side))
  // The sheet draws the service street along the south, so a street there is the frontage the
  // house addresses; on a plot with none, the first street it has stands in for it.
  const service = streets.find((side) => side === 'street') ?? streets[0] ?? null
  const area = shape.w * shape.h
  // The rulebook sets the deeper band back from the service street alone; every other boundary,
  // a side street included, keeps the shallower one.
  const depth = (side: Side): number => setbackDepth(area, side === service)
  const build: Box = {
    x: depth('west'),
    y: depth('north'),
    w: shape.w - depth('west') - depth('east'),
    h: shape.h - depth('north') - depth('street'),
  }
  const budget = (side: Side): number =>
    Math.min(runOf(shape, side) / 2, streets.includes(side) ? STREET_CAP : Infinity)
  return {
    w: shape.w,
    h: shape.h,
    north: shape.north,
    streets,
    service,
    box: { x: 0, y: 0, w: shape.w, h: shape.h },
    build,
    buildable: build.w * build.h,
    budget: {
      west: budget('west'),
      east: budget('east'),
      north: budget('north'),
      street: budget('street'),
    },
    name: {
      west: nameOf('west', service, streets),
      east: nameOf('east', service, streets),
      north: nameOf('north', service, streets),
      street: nameOf('street', service, streets),
    },
    allowed: allowedFloorArea(area),
  }
}

/** The fresh brief's corner plot, which the sheet stands on until a project hands it another. */
export const FRESH_PLOT: PlotRect = { w: 20, h: 25, north: 25, streets: ['street', 'east'] }

export const DEFAULT_PLOT: PlotSpec = plotFrom(FRESH_PLOT)

/** The rulebook: three floors, roof annexes included. */
export const MAX_STOREYS = 3

export const STOREY_NAME = ['Ground', 'First', 'Second', 'Third'] as const

export const STOREY_MARK = ['G', '1st', '2nd', '3rd'] as const

/** The building ratio the sentence quotes: 210 % of the plot area. */
export const RATIO = 2.1

export const boxCorners = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
]
