/**
 * The plot the zoning sheet stands on: the fresh brief's 500 m² corner plot, 20 m on the service
 * street to the south, 25 m on the side street to the east, neighbours west and north. Constants
 * for now; T5 makes them data.
 */

export type Box = { x: number; y: number; w: number; h: number }

export const PLOT = { w: 20, h: 25 } as const

/** Degrees the north arrow turns clockwise from the sheet's up. */
export const NORTH = 25

/** 2 m from the service street, 1.5 m elsewhere (rulebook, plots under 750 m²): 365.5 m². */
export const BUILD: Box = { x: 1.5, y: 1.5, w: 17, h: 21.5 }

export const PLOT_BOX: Box = { x: 0, y: 0, w: PLOT.w, h: PLOT.h }

/** On the boundary toward the street: half the frontage, at most 15 m. */
export const STREET_BUDGET = Math.min(PLOT.w / 2, 15)

export type Side = 'west' | 'east' | 'north' | 'street'

/** Every side's budget is half its length (owner's correction, 16 September), the street capped. */
export const SIDE_BUDGET: Record<Side, number> = {
  west: PLOT.h / 2,
  east: PLOT.h / 2,
  north: PLOT.w / 2,
  street: STREET_BUDGET,
}

export const SIDE_NAME: Record<Side, string> = {
  west: 'west boundary',
  east: 'side-street boundary',
  north: 'north boundary',
  street: 'street boundary',
}

export const SIDES: readonly Side[] = ['west', 'north', 'east', 'street']

/** The rulebook: three floors, roof annexes included. */
export const MAX_STOREYS = 3

export const STOREY_NAME = ['Ground', 'First', 'Second', 'Third'] as const

export const STOREY_MARK = ['G', '1st', '2nd', '3rd'] as const

/** The building ratio: 210 % of the plot area. */
export const RATIO = 2.1

export const RATIO_ALLOWED = RATIO * PLOT.w * PLOT.h

/** Inside the setback line, in m². */
export const BUILDABLE_AREA = BUILD.w * BUILD.h

export const boxCorners = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
]
