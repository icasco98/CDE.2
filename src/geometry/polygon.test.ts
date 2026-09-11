import { describe, expect, it } from 'vitest'
import {
  area,
  boundingBox,
  centroid,
  differencePolygons,
  edgesOf,
  nearestPointOnBoundary,
  nearestPointOnSegment,
  pointInPolygon,
  pointOnBoundary,
  rectangleToPolygon,
  ringToPolygon,
  signedArea,
  unionPolygons,
} from './polygon'
import type { Polygon } from './types'

const room: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 6 })

/** An L: the 6 x 4 rectangle less its bottom-right 3 x 2 quarter. */
const lShape: Polygon = [
  [0, 0],
  [6, 0],
  [6, 2],
  [3, 2],
  [3, 4],
  [0, 4],
]

describe('area', () => {
  it('measures a 4 x 6 m room as 24 m2', () => {
    expect(area(room)).toBe(24)
  })

  it('signs a clockwise ring on the sheet positive and its reverse negative', () => {
    expect(signedArea(room)).toBe(24)
    expect(signedArea([...room].reverse())).toBe(-24)
    expect(area([...room].reverse())).toBe(24)
  })

  it('measures the L as its rectangle less the missing quarter', () => {
    expect(area(lShape)).toBe(6 * 4 - 3 * 2)
  })
})

describe('centroid', () => {
  it('puts the centroid of a rectangle at its centre', () => {
    expect(centroid(room)).toEqual([2, 3])
  })

  it('puts the centroid of a triangle at the mean of its corners', () => {
    const triangle: Polygon = [
      [0, 0],
      [6, 0],
      [0, 3],
    ]
    const [x, y] = centroid(triangle)
    expect(x).toBeCloseTo(2, 12)
    expect(y).toBeCloseTo(1, 12)
  })

  it('falls back to the mean vertex for a polygon with no area', () => {
    expect(
      centroid([
        [0, 0],
        [2, 0],
        [4, 0],
      ]),
    ).toEqual([2, 0])
  })
})

describe('bounding box', () => {
  it('is the extent of the vertices', () => {
    expect(boundingBox(lShape)).toEqual({ left: 0, top: 0, width: 6, depth: 4 })
  })

  it('is empty for no vertices at all', () => {
    expect(boundingBox([])).toEqual({ left: 0, top: 0, width: 0, depth: 0 })
  })
})

describe('rectangle to polygon', () => {
  it('winds clockwise on the sheet, from the top-left corner', () => {
    expect(rectangleToPolygon({ left: 1, top: 2, width: 3, depth: 4 })).toEqual([
      [1, 2],
      [4, 2],
      [4, 6],
      [1, 6],
    ])
  })
})

describe('edges', () => {
  it('closes the ring, last vertex back to first', () => {
    expect(edgesOf(room)).toHaveLength(4)
    expect(edgesOf(room)[3]).toEqual([
      [0, 6],
      [0, 0],
    ])
  })
})

describe('point in polygon', () => {
  it('is true inside the L and false in the quarter it is missing', () => {
    expect(pointInPolygon(lShape, [1, 1])).toBe(true)
    expect(pointInPolygon(lShape, [5, 1])).toBe(true)
    expect(pointInPolygon(lShape, [5, 3])).toBe(false)
    expect(pointInPolygon(lShape, [7, 1])).toBe(false)
  })
})

describe('the boundary', () => {
  it('finds the nearest point on a wall, not merely somewhere inside', () => {
    expect(nearestPointOnBoundary(room, [1, 3])).toEqual([0, 3])
    expect(nearestPointOnBoundary(room, [10, 10])).toEqual([4, 6])
  })

  it('finds the real nearest wall of the L, not a side of its bounding box', () => {
    expect(nearestPointOnBoundary(lShape, [5, 3])).toEqual([5, 2])
  })

  it('reads a point within the tolerance of a wall as on it', () => {
    expect(pointOnBoundary(room, [0.01, 3], 0.05)).toBe(true)
    expect(pointOnBoundary(room, [0.1, 3], 0.05)).toBe(false)
  })

  it('holds a point to the ends of one segment', () => {
    expect(nearestPointOnSegment([2, 5], [0, 0], [4, 0])).toEqual([2, 0])
    expect(nearestPointOnSegment([9, 5], [0, 0], [4, 0])).toEqual([4, 0])
    expect(nearestPointOnSegment([-9, 5], [0, 0], [4, 0])).toEqual([0, 0])
    expect(nearestPointOnSegment([1, 1], [2, 2], [2, 2])).toEqual([2, 2])
  })
})

describe('rings from the clipping library', () => {
  it('drops the repeated closing vertex', () => {
    expect(
      ringToPolygon([
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
    ])
  })
})

describe('union', () => {
  it('joins two touching 2 x 2 squares into one ring of area 8', () => {
    const a = rectangleToPolygon({ left: 0, top: 0, width: 2, depth: 2 })
    const b = rectangleToPolygon({ left: 2, top: 0, width: 2, depth: 2 })
    const pieces = unionPolygons([a, b])
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toHaveLength(1)
    expect(area(pieces[0]?.[0] ?? [])).toBeCloseTo(8, 9)
  })

  it('counts the shared part of two overlapping squares once', () => {
    const a = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 4 })
    const b = rectangleToPolygon({ left: 3, top: 0, width: 4, depth: 4 })
    const pieces = unionPolygons([a, b])
    expect(pieces).toHaveLength(1)
    expect(area(pieces[0]?.[0] ?? [])).toBeCloseTo(28, 9)
  })

  it('keeps a courtyard as a hole after the outer ring', () => {
    const bars = [
      rectangleToPolygon({ left: 0, top: 0, width: 6, depth: 1 }),
      rectangleToPolygon({ left: 0, top: 5, width: 6, depth: 1 }),
      rectangleToPolygon({ left: 0, top: 0, width: 1, depth: 6 }),
      rectangleToPolygon({ left: 5, top: 0, width: 1, depth: 6 }),
    ]
    const pieces = unionPolygons(bars)
    expect(pieces).toHaveLength(1)
    const rings = pieces[0] ?? []
    expect(rings).toHaveLength(2)
    expect(area(rings[0] ?? [])).toBeCloseTo(36, 9)
    expect(area(rings[1] ?? [])).toBeCloseTo(16, 9)
  })

  it('is empty for nothing at all', () => {
    expect(unionPolygons([])).toEqual([])
  })
})

describe('difference', () => {
  it('takes a 1 x 1 bite out of a 3 x 3 room and leaves 8 m2', () => {
    const subject = rectangleToPolygon({ left: 0, top: 0, width: 3, depth: 3 })
    const bite = rectangleToPolygon({ left: 2, top: 2, width: 1, depth: 1 })
    const pieces = differencePolygons(subject, [bite])
    expect(pieces).toHaveLength(1)
    expect(area(pieces[0]?.[0] ?? [])).toBeCloseTo(8, 9)
  })

  it('returns the subject untouched when nothing cuts it', () => {
    expect(differencePolygons(room, [])).toEqual([[room]])
  })
})
