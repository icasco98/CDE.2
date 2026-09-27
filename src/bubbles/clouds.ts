/**
 * The soft outline behind each category's rooms on a storey, like the zones of a hand-drawn bubble
 * diagram: the convex hull of the group's circles, each grown by a margin, its corners rounded.
 * Rooms of one category far apart on a column get a cloud each rather than one across the others.
 */

import type { Spot as Circle } from './arrange'

type Point = { readonly x: number; readonly y: number }

type Cloud = {
  readonly key: string
  readonly category: string
  readonly storey: number
  /** An SVG path, closed. */
  readonly path: string
  /** Where the category's name is written: over the middle of the cloud's top. */
  readonly label: Point
}

/** How far a cloud stands out from its circles, in the diagram's units. */
const MARGIN = 12

/** Two circles of a category share a cloud when their centres are this close: neighbours in a row. */
const JOIN = 160

/** Points taken round each grown circle; enough that the hull reads as round, cheap for forty rooms. */
const ROUND = 16

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** The convex hull, counter-clockwise, by the monotone chain. */
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

const round = (value: number): number => Math.round(value * 10) / 10

/** A closed path through the midpoints of the hull's sides, bending at each corner. */
function smooth(points: readonly Point[]): string {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const start = mid(points.at(-1)!, points[0]!)
  let path = `M${round(start.x)} ${round(start.y)}`
  for (const [index, corner] of points.entries()) {
    const next = mid(corner, points[(index + 1) % points.length]!)
    path += `Q${round(corner.x)} ${round(corner.y)} ${round(next.x)} ${round(next.y)}`
  }
  return `${path}Z`
}

/** Circles in groups where each is within `JOIN` of another in its group, in the order given. */
function clusters(circles: readonly Circle[]): Circle[][] {
  const groups: Circle[][] = []
  for (const circle of circles) {
    const touching = groups.filter((group) =>
      group.some((other) => Math.hypot(other.x - circle.x, other.y - circle.y) <= JOIN),
    )
    const merged = [...touching.flat(), circle]
    for (const group of touching) groups.splice(groups.indexOf(group), 1)
    groups.push(merged)
  }
  return groups
}

export function cloudsOf(
  circles: readonly Circle[],
  categoryOf: (id: string) => string | undefined,
): readonly Cloud[] {
  const groups = new Map<string, Circle[]>()
  for (const circle of circles) {
    const category = categoryOf(circle.id)
    if (category === undefined) continue
    const key = `${circle.storey} ${category}`
    groups.set(key, [...(groups.get(key) ?? []), circle])
  }
  const clouds: Cloud[] = []
  for (const [key, members] of groups) {
    const category = categoryOf(members[0]!.id)!
    for (const group of clusters(members)) {
      const points = group.flatMap((circle) =>
        Array.from({ length: ROUND }, (_, step) => {
          const angle = (step / ROUND) * 2 * Math.PI
          const reach = circle.r + MARGIN
          return { x: circle.x + reach * Math.cos(angle), y: circle.y + reach * Math.sin(angle) }
        }),
      )
      const outline = hull(points)
      const top = Math.min(...outline.map((point) => point.y))
      const middle = group.reduce((sum, circle) => sum + circle.x, 0) / group.length
      clouds.push({
        key: `${key} ${group[0]!.id}`,
        category,
        storey: group[0]!.storey,
        path: smooth(outline),
        label: { x: round(middle), y: round(top) },
      })
    }
  }
  return clouds
}
