import { twinsOf, twinY, type Body, type Position } from '../../bubbles'
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
 * any twin that has been dragged outside them, so Fit frames every bubble and every band.
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
    for (const storey of twinsOf(body)) {
      const y = twinY(body, storey, bandHeight)
      top = Math.min(top, y - body.radius - MARGIN)
      bottom = Math.max(bottom, y + body.radius + MARGIN)
    }
  }
  const height = bottom - top
  const width = Math.max((Math.ceil(reach) + MARGIN) * 2, aspect > 0 ? height * aspect : 0)
  return { minX: -width / 2, minY: top, width, height }
}

/**
 * Whether a frame already holds what wants drawing. The sheet must not swim under the hand while
 * the forces run, so the frame is left alone until the picture stops or something leaves it.
 */
export function holds(frame: Extent, wanted: Extent): boolean {
  return (
    frame.minX <= wanted.minX &&
    frame.minY <= wanted.minY &&
    frame.minX + frame.width >= wanted.minX + wanted.width &&
    frame.minY + frame.height >= wanted.minY + wanted.height
  )
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

/** What the pointer is over, twins and all: a stair is reached at whichever of them was aimed at. */
export function bodyAt(
  bodies: readonly Body[],
  at: Position,
  bandHeight: number,
  skip: string | null = null,
): Body | undefined {
  return bodies.find(
    (body) =>
      body.id !== skip &&
      twinsOf(body).some(
        (storey) =>
          Math.hypot(body.x - at.x, twinY(body, storey, bandHeight) - at.y) <= body.radius,
      ),
  )
}
