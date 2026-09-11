import { boundingBox, type Point, type Polygon } from '../../geometry'

/** Air around the drawing in metres, so a label or a handle at the edge is not cut off. */
const MARGIN = 2.5

/** A box on the sheet in metres: what is drawn, or the part of it a camera shows. */
export type Extent = {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

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

/** Where a pointer event lands on the sheet, in metres. */
export function pointerAt(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const screen = svg.getScreenCTM()
  if (!screen) return [0, 0]
  const at = new DOMPoint(clientX, clientY).matrixTransform(screen.inverse())
  return [at.x, at.y]
}

export function pointsOf(polygon: Polygon): string {
  return polygon.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
}
