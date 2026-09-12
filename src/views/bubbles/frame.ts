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

/** The line a row of type sits on, as a share of its own cap height. */
export const LINE = 1.3

/** What a letter of the sheet's type comes to, as a share of the cap height it is set at. */
const LETTER = 0.55

/**
 * The size a label is really drawn at, in metres. The stylesheet holds a label between eight and
 * fourteen pixels whatever the room asks for, so the size on the sheet is known here and a line
 * can be measured against the circle it has to sit in.
 */
export function labelSizeOn(radius: number, perPixel: number): number {
  return Math.min(Math.max(labelSize(radius), perPixel * 8), perPixel * 14)
}

/** One row of a bubble's label: what it says and which voice says it. */
export type LabelRow = { readonly text: string; readonly kind: 'name' | 'mark' | 'area' | 'span' }

export type BubbleLabel = {
  readonly rows: readonly LabelRow[]
  readonly size: number
  /** Whether the name gave way to its initials, which is when the full name waits on the hand. */
  readonly short: boolean
}

/**
 * Whether every row of a stack sits inside the circle. A row is measured where it really lies:
 * the further from the middle it sits, the narrower the circle is there, so a second line has
 * less room than the first and the last line of three has least of all.
 */
function stackFits(rows: readonly string[], size: number, radius: number): boolean {
  return rows.every((row, index) => {
    const middle = (index - (rows.length - 1) / 2) * size * LINE
    const reach = Math.abs(middle) + size / 2
    const across = radius * radius - reach * reach
    return across > 0 && (row.length * size * LETTER) / 2 <= Math.sqrt(across)
  })
}

/** A name broken at the space nearest its middle; nothing for a name of one word. */
function inTwo(name: string): readonly string[] | null {
  const spaces: number[] = []
  for (let at = name.indexOf(' '); at >= 0; at = name.indexOf(' ', at + 1)) spaces.push(at)
  if (spaces.length === 0) return null
  const middle = name.length / 2
  const at = spaces.reduce((best, each) =>
    Math.abs(each - middle) < Math.abs(best - middle) ? each : best,
  )
  return [name.slice(0, at), name.slice(at + 1)]
}

/**
 * What a bubble says, at the scale the sheet is drawn at: its name on one line or two, then its
 * area and the storeys it spans for as long as there is room under the name for them. A name that
 * will not go inside the circle at all gives way to the room's initials, and waits on the hand.
 */
export function labelFor(
  room: { readonly name: string; readonly area: string; readonly span?: string },
  mark: string,
  radius: number,
  perPixel: number,
): BubbleLabel {
  const size = labelSizeOn(radius, perPixel)
  const fits = (rows: readonly string[]): boolean => stackFits(rows, size, radius)
  const broken = inTwo(room.name)
  const lines = fits([room.name]) ? [room.name] : broken && fits(broken) ? broken : null
  if (!lines) return { rows: [{ text: mark, kind: 'mark' }], size, short: true }
  const rows: LabelRow[] = lines.map((text) => ({ text, kind: 'name' as const }))
  const said = [...lines]
  if (fits([...said, room.area])) {
    rows.push({ text: room.area, kind: 'area' })
    said.push(room.area)
    // A room drawn on more than one storey must say so, but never at the cost of its own name.
    if (room.span && fits([...said, room.span])) rows.push({ text: room.span, kind: 'span' })
  }
  return { rows, size, short: false }
}

/** A bubble as the labels are measured against one another: where it is, and how big. */
export type LabelledBubble = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly storey: number
  readonly storeysSpanned: number
}

/** How wide and how deep a label is drawn, in metres, about the middle of its own bubble. */
function boxOf(label: BubbleLabel): { readonly across: number; readonly down: number } {
  const widest = label.rows.reduce((most, row) => Math.max(most, row.text.length), 0)
  return { across: widest * label.size * LETTER, down: label.rows.length * label.size * LINE }
}

function together(one: LabelledBubble, other: LabelledBubble): boolean {
  const span = (each: LabelledBubble): number => Math.max(1, Math.trunc(each.storeysSpanned))
  return one.storey < other.storey + span(other) && other.storey < one.storey + span(one)
}

/**
 * The labels with no two of them crossing. Two names drawn over one another read as a third that
 * is neither: "Master Bedroom" under "Bedroom 1" reads "ster Bedroom", and a reader has no way of
 * telling which room either half belongs to. Where two would cross, the smaller bubble gives its
 * name up for its mark and waits on the hand, because the smaller room is the one with least room
 * to say it in; where two are the same size the one named later gives way, so the picture is the
 * same picture every time it is drawn.
 */
export function apart(
  labels: ReadonlyMap<string, BubbleLabel>,
  bubbles: readonly LabelledBubble[],
  markOf: (id: string) => string,
): ReadonlyMap<string, BubbleLabel> {
  const out = new Map(labels)
  const shown = bubbles.filter((bubble) => out.has(bubble.id))
  for (let pass = 0; pass < shown.length; pass++) {
    let crossed = false
    for (const [index, one] of shown.entries())
      for (let next = index + 1; next < shown.length; next++) {
        const other = shown[next]
        const a = out.get(one.id)
        const b = other && out.get(other.id)
        if (!other || !a || !b || (a.short && b.short) || !together(one, other)) continue
        const boxA = boxOf(a)
        const boxB = boxOf(b)
        if (Math.abs(one.x - other.x) >= (boxA.across + boxB.across) / 2) continue
        if (Math.abs(one.y - other.y) >= (boxA.down + boxB.down) / 2) continue
        const gives =
          a.short || b.short
            ? a.short
              ? other
              : one
            : one.radius === other.radius
              ? one.id < other.id
                ? other
                : one
              : one.radius < other.radius
                ? one
                : other
        const label = out.get(gives.id)
        if (!label || label.short) continue
        out.set(gives.id, {
          rows: [{ text: markOf(gives.id), kind: 'mark' }],
          size: label.size,
          short: true,
        })
        crossed = true
      }
    if (!crossed) break
  }
  return out
}

/**
 * The initials a bubble too small for its name wears, no two of them the same. A name gives one
 * letter per word; where that would leave two rooms with the same mark, the rooms that clash take
 * another letter from their first word, so a formal living room and a family living room read
 * "FoL" and "FaL" rather than "FL" twice over.
 */
export function shortMarks(names: readonly string[]): ReadonlyMap<string, string> {
  const marks = new Map<string, string>()
  let depth = 1
  let left = [...new Set(names)]
  while (left.length > 0 && depth <= 4) {
    for (const name of left) marks.set(name, initials(name, depth))
    const shared = new Map<string, string[]>()
    for (const [name, mark] of marks) shared.set(mark, [...(shared.get(mark) ?? []), name])
    left = [...shared.values()].filter((names) => names.length > 1).flat()
    depth += 1
  }
  return marks
}

/** The first letters of a name: `first` of them from the first word, one from each word after. */
function initials(name: string, first: number): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const head = words[0] ?? name
  const rest = words.slice(1, 3).map((word) => word.charAt(0).toUpperCase())
  return [head.charAt(0).toUpperCase() + head.slice(1, first).toLowerCase(), ...rest].join('')
}
