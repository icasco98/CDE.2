import { expect, it } from 'vitest'
import { footprintsOverlap } from './overlap'
import { buildingOutline } from './outline'
import type { Footprint, Point, Polygon } from './types'

/**
 * A twenty-vertex room on a six-by-five grid of rooms that meet along their walls, five vertices
 * to a wall and a depth that alternates, so the walls only partly match and really have to be
 * resolved against each other.
 */
function room(index: number): Polygon {
  const left = (index % 6) * 5
  const top = Math.floor(index / 6) * 4
  const depth = index % 2 ? 4 : 3.5
  const along = (from: Point, to: Point): Point[] =>
    Array.from({ length: 5 }, (_unused, i): Point => {
      const s = i / 5
      return [from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s]
    })
  const nw: Point = [left, top]
  const ne: Point = [left + 5, top]
  const se: Point = [left + 5, top + depth]
  const sw: Point = [left, top + depth]
  return [...along(nw, ne), ...along(ne, se), ...along(se, sw), ...along(sw, nw)]
}

const rooms = Array.from({ length: 30 }, (_unused, i) => room(i))
const footprints: Footprint[] = rooms.map((polygon, i) => ({ polygon, rotation: i * 7 }))

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged to the budget. */
function milliseconds(work: () => void): number {
  for (let i = 0; i < 5; i++) work()
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

it('unions thirty twenty-vertex rooms in under 10 ms', () => {
  let rings = 0
  const took = milliseconds(() => {
    rings = buildingOutline(rooms).length
  })
  expect(rings).toBeGreaterThan(0)
  expect(took).toBeLessThan(10)
})

it('runs thirty pairwise overlap tests in under 10 ms', () => {
  let tested = 0
  const took = milliseconds(() => {
    tested = 0
    for (let i = 0; i < 30; i++) {
      const a = footprints[i]
      const b = footprints[(i + 1) % footprints.length]
      if (a && b) {
        footprintsOverlap(a, b)
        tested++
      }
    }
  })
  expect(tested).toBe(30)
  expect(took).toBeLessThan(10)
})
