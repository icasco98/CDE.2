import { describe, expect, it } from 'vitest'
import { angleOf, arcPoints, arcRun, arcSegments, arcThrough, exactArea, sheetArcs } from './arcs'
import { area } from './polygon'
import type { Arc, Point } from './types'

/** The furthest the straight chord between two arc points falls from the arc itself, in metres. */
function chordError(points: readonly Point[], centre: Point, radius: number): number {
  let worst = 0
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index] ?? centre
    const b = points[index + 1] ?? centre
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    worst = Math.max(worst, radius - Math.hypot(middle[0] - centre[0], middle[1] - centre[1]))
  }
  return worst
}

const centre: Point = [10, 10]

describe('the run of points an arc is drawn with', () => {
  it('keeps every chord within five millimetres of the arc', () => {
    for (const radius of [0.5, 2.5, 6, 20]) {
      const points = arcPoints(centre, radius, 0, 0, true)
      expect(chordError(points, centre, radius)).toBeLessThanOrEqual(0.005 + 1e-12)
    }
  })

  it('draws a quarter turn with at least eight segments however shallow it is', () => {
    expect(arcSegments(0.4, Math.PI / 2)).toBe(8)
    expect(arcPoints(centre, 0.4, 0, Math.PI / 2, true)).toHaveLength(9)
  })

  it('draws a five metre circle with at least forty-eight segments', () => {
    expect(arcSegments(2.5, Math.PI * 2)).toBeGreaterThanOrEqual(48)
    expect(arcSegments(2.5, Math.PI * 2)).toBe(50)
  })

  it('repeats its first point when the two ends land together, which is a whole turn', () => {
    const points = arcPoints(centre, 3, 0, 0, true)
    expect(points[0]).toEqual(points[points.length - 1])
    expect(points).toHaveLength(arcSegments(3, Math.PI * 2) + 1)
  })

  it('runs the other way round when it is not clockwise', () => {
    const [, second] = arcPoints(centre, 2, 0, Math.PI, false)
    expect(second?.[1]).toBeLessThan(centre[1])
  })
})

describe('the circle through three points', () => {
  it('finds the centre and the radius of a half turn', () => {
    const circle = arcThrough([0, 0], [2, 2], [4, 0])
    expect(circle?.centre[0]).toBeCloseTo(2, 12)
    expect(circle?.centre[1]).toBeCloseTo(0, 12)
    expect(circle?.radius).toBeCloseTo(2, 12)
    expect(circle?.clockwise).toBe(false)
  })

  it('names no circle for three points on a line', () => {
    expect(arcThrough([0, 0], [1, 0], [2, 0])).toBeNull()
  })
})

describe('the vertices an arc runs through', () => {
  it('walks from one index round to the other', () => {
    expect(arcRun({ from: 4, to: 1, centre, radius: 1, clockwise: true }, 6)).toEqual([4, 5, 0, 1])
  })

  it('walks the whole ring when both ends are the same vertex', () => {
    expect(arcRun({ from: 0, to: 0, centre, radius: 1, clockwise: true }, 4)).toEqual([
      0, 1, 2, 3, 0,
    ])
  })
})

describe('the area a room with arcs really covers', () => {
  const radius = 2.5
  const run = arcPoints(centre, radius, 0, 0, true)
  const circle = {
    polygon: run.slice(0, -1),
    rotation: 0,
    arcs: [{ from: 0, to: 0, centre, radius, clockwise: true }] as readonly Arc[],
  }

  it('measures a five metre circle as pi times its radius squared', () => {
    expect(exactArea(circle)).toBeCloseTo(Math.PI * 6.25, 9)
  })

  it('leaves the polygon within half a percent of it', () => {
    const polygon = area(circle.polygon)
    expect(polygon).toBeLessThan(exactArea(circle))
    expect((exactArea(circle) - polygon) / exactArea(circle)).toBeLessThan(0.005)
  })

  it('takes the same area back out of a curve that bows the other way', () => {
    const inward = { ...circle, arcs: circle.arcs.map((arc) => ({ ...arc, clockwise: false })) }
    expect(exactArea(inward)).toBeCloseTo(2 * area(circle.polygon) - Math.PI * 6.25, 9)
  })

  it('is the polygon area alone where no arc is remembered', () => {
    expect(exactArea({ polygon: circle.polygon, rotation: 0 })).toBeCloseTo(
      area(circle.polygon),
      12,
    )
  })
})

describe('where the arcs stand on the sheet', () => {
  it('turns the centre with the room and leaves the radius alone', () => {
    const polygon = arcPoints([2, 2], 1, 0, 0, true).slice(0, -1)
    const arcs = sheetArcs({
      polygon,
      rotation: 90,
      arcs: [{ from: 0, to: 0, centre: [2, 2], radius: 1, clockwise: true }],
    })
    expect(arcs[0]?.radius).toBe(1)
    expect(arcs[0]?.centre[0]).toBeCloseTo(2, 9)
    expect(arcs[0]?.centre[1]).toBeCloseTo(2, 9)
  })
})

describe('the angle a point stands at', () => {
  it('grows clockwise, which is the way y runs down the sheet', () => {
    expect(angleOf([0, 0], [1, 0])).toBeCloseTo(0, 12)
    expect(angleOf([0, 0], [0, 1])).toBeCloseTo(Math.PI / 2, 12)
  })
})
