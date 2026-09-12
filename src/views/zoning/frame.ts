import { boundingBox, type Point, type Polygon } from '../../geometry'
import type { Extent } from '../camera'

/** Air around the drawing in metres, so a label or a handle at the edge is not cut off. */
const MARGIN = 2.5

/** The plot and everything drawn on it, with room around the lot for the marks outside a wall. */
export function extentOf(plot: Polygon, outlines: readonly Polygon[]): Extent {
  const corners = [...plot, ...outlines.flat()]
  const bounds = boundingBox(corners.length > 0 ? corners : [[0, 0] as Point, [20, 25] as Point])
  return {
    minX: bounds.left - MARGIN,
    minY: bounds.top - MARGIN,
    width: Math.max(1, bounds.width + MARGIN * 2),
    height: Math.max(1, bounds.depth + MARGIN * 2),
  }
}

export function pointsOf(polygon: Polygon): string {
  return polygon.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
}
