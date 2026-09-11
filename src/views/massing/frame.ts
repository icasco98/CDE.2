import type { Point, Polygon } from '../../geometry'
import {
  MAX_ELEVATION_DEG,
  MIN_ELEVATION_DEG,
  project,
  type Point3,
  type View,
} from '../../massing'
import type { Extent } from '../camera'

/** Air around the drawing in metres, so a label at the edge is not cut off. */
const MARGIN = 2.5

/** How far the view turns or tilts for a drag of one pixel: a drag across a sheet comes most of the way round. */
const DEGREES_PER_PIXEL = 0.45

/** The plot laid flat on the ground. */
export function groundOf(polygon: Polygon): readonly Point3[] {
  return polygon.map((corner): Point3 => [corner[0], corner[1], 0])
}

export function extentOf(points: readonly Point3[], view: View): Extent {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    const [u, v] = project(point, view)
    minX = Math.min(minX, u)
    maxX = Math.max(maxX, u)
    minY = Math.min(minY, v)
    maxY = Math.max(maxY, v)
  }
  if (!Number.isFinite(minX)) return { minX: -10, minY: -10, width: 20, height: 20 }
  return {
    minX: minX - MARGIN,
    minY: minY - MARGIN,
    width: Math.max(1, maxX - minX + MARGIN * 2),
    height: Math.max(1, maxY - minY + MARGIN * 2),
  }
}

/** The middle of the box these points stand in, which is the point a turn happens about. */
export function centreOf(points: readonly Point3[]): Point3 {
  let leastX = Infinity
  let leastY = Infinity
  let leastZ = Infinity
  let mostX = -Infinity
  let mostY = -Infinity
  let mostZ = -Infinity
  for (const [x, y, z] of points) {
    leastX = Math.min(leastX, x)
    leastY = Math.min(leastY, y)
    leastZ = Math.min(leastZ, z)
    mostX = Math.max(mostX, x)
    mostY = Math.max(mostY, y)
    mostZ = Math.max(mostZ, z)
  }
  if (!Number.isFinite(leastX)) return [0, 0, 0]
  return [(leastX + mostX) / 2, (leastY + mostY) / 2, (leastZ + mostZ) / 2]
}

/** Where the view stands after a drag of `pixels` across the screen, kept inside one turn. */
export function orbitBy(azimuth: number, pixels: number): number {
  const turned = (azimuth + pixels * DEGREES_PER_PIXEL) % 360
  return turned < 0 ? turned + 360 : turned
}

/**
 * Where the viewer stands after a drag of `pixels` down the screen: pulling the hand down brings
 * the viewer up over the mass, the way a model tips toward you when its near edge is pulled down.
 */
export function tiltBy(elevation: number, pixels: number): number {
  const raised = elevation + pixels * DEGREES_PER_PIXEL
  return Math.min(MAX_ELEVATION_DEG, Math.max(MIN_ELEVATION_DEG, raised))
}

/**
 * The frame slid so the point a turn is about is drawn where it was drawn when the turn began.
 * The frame is held through the turn, so the mass revolves about that point rather than swinging
 * across the sheet.
 */
export function frameAbout(held: Extent, pivot: Point3, was: View, now: View): Extent {
  const before = project(pivot, was)
  const after = project(pivot, now)
  return {
    ...held,
    minX: held.minX + after[0] - before[0],
    minY: held.minY + after[1] - before[1],
  }
}

/** The azimuth that draws the plot's north straight up the screen: the viewer stands opposite it. */
export function planAzimuth(north: number): number {
  const opposite = (north + 180) % 360
  return opposite < 0 ? opposite + 360 : opposite
}

export function pointsOf(corners: readonly Point3[], view: View): string {
  return corners
    .map((corner) => {
      const at = project(corner, view)
      return `${at[0].toFixed(3)},${at[1].toFixed(3)}`
    })
    .join(' ')
}

/** The direction north points on the sheet: up, turned by the plot's own north. */
export function northOf(north: number): Point {
  const angle = (north * Math.PI) / 180
  return [Math.sin(angle), -Math.cos(angle)]
}
