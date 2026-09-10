import type { Body, Position } from '../../bubbles'

export type Extent = {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

/** Air around the bubbles so a label at the edge is not cut off. */
const MARGIN = 3

const NEUTRAL = '#d6d9d3'

const BY_CATEGORY: Readonly<Record<string, string>> = {
  private: '#a9c2d2',
  shared: '#e2c48f',
  service: '#c4bfb2',
  reception: '#d7a6a1',
}

export function fillFor(category: string | undefined): string {
  return (category && BY_CATEGORY[category]) || NEUTRAL
}

/**
 * Kept symmetric about the centre line the cloud is pulled to, so a bubble in flight does not swing
 * the whole sheet, and widened to the container's shape so the bands run right across it.
 */
export function extentOf(
  bodies: readonly Body[],
  storeys: number,
  bandHeight: number,
  aspect = 0,
): Extent {
  const height = Math.max(1, storeys) * bandHeight + MARGIN * 2
  let reach = height / 4
  for (const body of bodies) reach = Math.max(reach, Math.abs(body.x) + body.radius)
  const width = Math.max((Math.ceil(reach) + MARGIN) * 2, aspect > 0 ? height * aspect : 0)
  return { minX: -width / 2, minY: -MARGIN, width, height }
}

export function viewBoxOf(extent: Extent): string {
  return `${extent.minX} ${extent.minY} ${extent.width} ${extent.height}`
}

export function pointerAt(svg: SVGSVGElement, clientX: number, clientY: number): Position {
  const screen = svg.getScreenCTM()
  if (!screen) return { x: 0, y: 0 }
  const at = new DOMPoint(clientX, clientY).matrixTransform(screen.inverse())
  return { x: at.x, y: at.y }
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
