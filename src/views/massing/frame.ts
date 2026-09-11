import type { Point, Polygon } from '../../geometry'
import { project, type Point3, type View } from '../../massing'

/** Air around the drawing in metres, so a label at the edge is not cut off. */
const MARGIN = 2.5

/** How far the view turns for a drag of one pixel: a drag across a sheet comes most of the way round. */
const DEGREES_PER_PIXEL = 0.45

export type Extent = {
  readonly minU: number
  readonly minV: number
  readonly width: number
  readonly height: number
}

/** The plot laid flat on the ground. */
export function groundOf(polygon: Polygon): readonly Point3[] {
  return polygon.map((corner): Point3 => [corner[0], corner[1], 0])
}

export function extentOf(points: readonly Point3[], view: View): Extent {
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const point of points) {
    const [u, v] = project(point, view)
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }
  if (!Number.isFinite(minU)) return { minU: -10, minV: -10, width: 20, height: 20 }
  return {
    minU: minU - MARGIN,
    minV: minV - MARGIN,
    width: Math.max(1, maxU - minU + MARGIN * 2),
    height: Math.max(1, maxV - minV + MARGIN * 2),
  }
}

export function viewBoxOf(extent: Extent): string {
  return `${extent.minU} ${extent.minV} ${extent.width} ${extent.height}`
}

/** Where the view stands after a drag of `pixels` across the screen, kept inside one turn. */
export function orbitBy(azimuth: number, pixels: number): number {
  const turned = (azimuth + pixels * DEGREES_PER_PIXEL) % 360
  return turned < 0 ? turned + 360 : turned
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
