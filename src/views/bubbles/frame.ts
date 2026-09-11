import type { Body, Position } from '../../bubbles'
import type { Point } from '../../geometry'
import type { Extent } from '../camera'

/** Air around the bubbles so a label at the edge is not cut off. */
const MARGIN = 3

/** The fill is bubbles.css's to choose, so a bubble and the legend that names it take one class. */
export function categoryClass(category: string | undefined): string {
  return category ? `category-${category}` : 'category-none'
}

/**
 * Kept symmetric about the centre line the cloud is pulled to, so a bubble in flight does not swing
 * the whole sheet, widened to the container's shape so the bands run right across it, and opened to
 * any bubble that has been dragged outside them, so Fit frames every bubble and every band.
 */
export function extentOf(
  bodies: readonly Body[],
  storeys: number,
  bandHeight: number,
  aspect = 0,
): Extent {
  let top = -MARGIN
  let bottom = Math.max(1, storeys) * bandHeight + MARGIN
  let reach = (bottom - top) / 4
  for (const body of bodies) {
    reach = Math.max(reach, Math.abs(body.x) + body.radius)
    top = Math.min(top, body.y - body.radius - MARGIN)
    bottom = Math.max(bottom, body.y + body.radius + MARGIN)
  }
  const height = bottom - top
  const width = Math.max((Math.ceil(reach) + MARGIN) * 2, aspect > 0 ? height * aspect : 0)
  return { minX: -width / 2, minY: top, width, height }
}

export function pointerAt(svg: SVGSVGElement, clientX: number, clientY: number): Position {
  const screen = svg.getScreenCTM()
  if (!screen) return { x: 0, y: 0 }
  const at = new DOMPoint(clientX, clientY).matrixTransform(screen.inverse())
  return { x: at.x, y: at.y }
}

/** The camera counts in the geometry's pairs and the bubbles in x and y; one word stands between. */
export function asPoint(at: Position): Point {
  return [at.x, at.y]
}

export function bodyAt(
  bodies: readonly Body[],
  at: Position,
  skip: string | null = null,
): Body | undefined {
  return bodies.find(
    (body) => body.id !== skip && Math.hypot(body.x - at.x, body.y - at.y) <= body.radius,
  )
}
