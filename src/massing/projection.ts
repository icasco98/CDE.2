import type { Point } from '../geometry'

/** A point in sheet metres stood up: x east, y south on the sheet, z up from the ground. */
export type Point3 = readonly [number, number, number]

/** How far above the horizon the drawing is seen from. Fixed: the orbit is horizontal (decision 16). */
export const ELEVATION_DEG = 30

/** Where the viewer stands, in degrees clockwise from north on the sheet. */
export type View = { readonly azimuth: number }

export type Preset = { readonly id: string; readonly azimuth: number }

/** The four corners a mass is read from, named for the quarter the viewer stands in. */
export const presets: readonly Preset[] = [
  { id: 'NE', azimuth: 45 },
  { id: 'SE', azimuth: 135 },
  { id: 'SW', azimuth: 225 },
  { id: 'NW', azimuth: 315 },
]

const RADIANS = Math.PI / 180
const SIN_UP = Math.sin(ELEVATION_DEG * RADIANS)
const COS_UP = Math.cos(ELEVATION_DEG * RADIANS)

/** How far a point lies toward the viewer along the sheet, before the elevation is applied. */
function towards(point: Point3, view: View): number {
  const angle = view.azimuth * RADIANS
  return point[0] * Math.sin(angle) - point[1] * Math.cos(angle)
}

/**
 * Parallel projection to the screen, in metres: u runs to the viewer's right along the ground,
 * v runs down the screen, so a point that is higher up or further away is drawn higher.
 */
export function project(point: Point3, view: View): Point {
  const angle = view.azimuth * RADIANS
  return [
    point[0] * Math.cos(angle) + point[1] * Math.sin(angle),
    towards(point, view) * SIN_UP - point[2] * COS_UP,
  ]
}

/** How far the point lies from the viewer: larger is further away, so the painter starts there. */
export function depthOf(point: Point3, view: View): number {
  return -(towards(point, view) * COS_UP + point[2] * SIN_UP)
}
