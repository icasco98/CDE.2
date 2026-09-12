import type { Point } from '../geometry'

/** A point in sheet metres stood up: x east, y south on the sheet, z up from the ground. */
export type Point3 = readonly [number, number, number]

/** How far above the horizon a mass is read from at a corner preset. */
export const ELEVATION_DEG = 30

/** Looking all but straight down, which reads as a plan while a wall still shows a hair of itself. */
export const PLAN_ELEVATION_DEG = 89

/** The viewer never sinks to the horizon, where a storey would have no height, nor passes overhead, where the walls would vanish. */
export const MIN_ELEVATION_DEG = 10
export const MAX_ELEVATION_DEG = PLAN_ELEVATION_DEG

/** Where the viewer stands: degrees clockwise from north on the sheet, and degrees above the horizon. */
export type View = { readonly azimuth: number; readonly elevation: number }

export type Preset = { readonly id: string; readonly azimuth: number; readonly elevation: number }

/** The four corners a mass is read from, named for the quarter the viewer stands in. */
export const presets: readonly Preset[] = [
  { id: 'NE', azimuth: 45, elevation: ELEVATION_DEG },
  { id: 'SE', azimuth: 135, elevation: ELEVATION_DEG },
  { id: 'SW', azimuth: 225, elevation: ELEVATION_DEG },
  { id: 'NW', azimuth: 315, elevation: ELEVATION_DEG },
]

const RADIANS = Math.PI / 180

type Angles = {
  readonly sin: number
  readonly cos: number
  readonly sinUp: number
  readonly cosUp: number
}

/** The four numbers a projection needs, taken once for the view rather than once for each corner. */
function anglesOf(view: View): Angles {
  const round = view.azimuth * RADIANS
  const up = view.elevation * RADIANS
  return { sin: Math.sin(round), cos: Math.cos(round), sinUp: Math.sin(up), cosUp: Math.cos(up) }
}

/**
 * Parallel projection to the screen, in metres: u runs to the viewer's right along the ground,
 * v runs down the screen, so a point that is higher up or further away is drawn higher.
 */
export function project(point: Point3, view: View): Point {
  const angles = anglesOf(view)
  return [
    point[0] * angles.cos + point[1] * angles.sin,
    (point[0] * angles.sin - point[1] * angles.cos) * angles.sinUp - point[2] * angles.cosUp,
  ]
}

/**
 * The point of the plane at height `z` that the drawing puts at `at`. A parallel projection
 * inverts exactly: the run toward the viewer comes back out of v once the height is taken off it,
 * and the two sheet axes come back out of that run and u. The viewer is never at the horizon, so
 * the run is never divided by nothing.
 */
export function unproject(at: Point, view: View, z: number): Point {
  const angles = anglesOf(view)
  const towards = (at[1] + z * angles.cosUp) / angles.sinUp
  return [at[0] * angles.cos + towards * angles.sin, at[0] * angles.sin - towards * angles.cos]
}

/** How far the point lies from the viewer: larger is further away, so the painter starts there. */
export function depthOf(point: Point3, view: View): number {
  const angles = anglesOf(view)
  return -((point[0] * angles.sin - point[1] * angles.cos) * angles.cosUp + point[2] * angles.sinUp)
}
