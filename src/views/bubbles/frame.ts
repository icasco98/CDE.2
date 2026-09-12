import { twinsOf, type Body, type Position } from '../../bubbles'
import { nearestPointOnSegment, type Point, type Polygon } from '../../geometry'
import type { Extent } from '../camera'
import { extentOf as sheetExtentOf } from '../frame'

/** The fill is bubbles.css's to choose, so a bubble and the legend that names it take one class. */
export function categoryClass(category: string | undefined): string {
  return category ? `category-${category}` : 'category-none'
}

/**
 * The plot with the bubbles on it, framed exactly as the plan sheet frames the same plot, so the
 * two tabs draw one picture at one scale. A bubble held inside the buildable line is already
 * inside the plot; one dragged out of it opens the frame rather than being cut off.
 */
export function extentOf(plot: Polygon, bodies: readonly Body[]): Extent {
  // The four points of the compass on each circle, which is exactly what its own box stands on:
  // the corners of a square round it would reach further and widen the sheet for nothing.
  return sheetExtentOf(
    plot,
    bodies.map((body) => [
      [body.x - body.radius, body.y],
      [body.x, body.y - body.radius],
      [body.x + body.radius, body.y],
      [body.x, body.y + body.radius],
    ]),
  )
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

/**
 * What the pointer is over on the storey being worked on. Every storey is drawn on the one plot,
 * so a bubble on another floor is never what the hand meant.
 */
export function bodyAt(
  bodies: readonly Body[],
  at: Position,
  storey: number,
  skip: string | null = null,
): Body | undefined {
  return bodies.find(
    (body) =>
      body.id !== skip &&
      twinsOf(body).includes(storey) &&
      Math.hypot(body.x - at.x, body.y - at.y) <= body.radius,
  )
}

/**
 * Where a link to the outside leaves the plot: the nearest point on a street side, or on any side
 * where the plot has no street. The outside is not a bubble, so the kerb is what a door to it is
 * drawn to.
 */
export function nearestOutside(polygon: Polygon, street: readonly number[], at: Position): Point {
  let nearest: Point = [at.x, at.y]
  let away = Infinity
  const wanted = polygon.map((_corner, index) => street.includes(index))
  const anyStreet = wanted.some(Boolean)
  for (let index = 0; index < polygon.length; index++) {
    if (anyStreet && !wanted[index]) continue
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    if (!from || !to) continue
    const point = nearestPointOnSegment([at.x, at.y], from, to)
    const distance = Math.hypot(point[0] - at.x, point[1] - at.y)
    if (distance < away) {
      away = distance
      nearest = point
    }
  }
  return nearest
}

/** The label on a roomy bubble, in metres of cap height; the stylesheet holds it to a band of pixels. */
const LABEL_M = 1.15

/** A small room's label shrinks with it, so a short name still sits inside its own circle. */
export function labelSize(radius: number): number {
  return Math.min(LABEL_M, Math.max(0.55, radius * 0.42))
}

/**
 * Whether a name fits inside its own bubble at the scale the sheet is drawn at. The stylesheet
 * holds a label between eight and fourteen pixels, so its size on the sheet is known here; a
 * letter comes to a little over half a cap height in this type, and the chord a line of it sits
 * on, clear of the rim above and below, is a little over the radius and a half.
 */
export function nameFits(name: string, radius: number, perPixel: number): boolean {
  const size = Math.min(Math.max(labelSize(radius), perPixel * 8), perPixel * 14)
  return name.length * size * 0.55 <= radius * 1.6
}

/** What is drawn in a bubble too small for its name: the initials, or the first letters of one word. */
export function shortMark(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean)
  if (words.length > 1)
    return words
      .slice(0, 3)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  return (words[0] ?? name).slice(0, 3)
}
