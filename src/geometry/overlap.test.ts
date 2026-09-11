import { describe, expect, it } from 'vitest'
import { footprintsOverlap, obbOf, obbsSeparated, sharedArea, OVERLAP_TOLERANCE } from './overlap'
import { rectangleToPolygon } from './polygon'
import type { Footprint, Polygon } from './types'

function rectangle(
  left: number,
  top: number,
  width: number,
  depth: number,
  rotation = 0,
): Footprint {
  return { polygon: rectangleToPolygon({ left, top, width, depth }), rotation }
}

/** A regular polygon of `sides`, standing in for a room drawn round. */
function circle(cx: number, cy: number, radius: number, sides = 48): Footprint {
  const polygon = Array.from({ length: sides }, (_unused, i): [number, number] => {
    const t = (i / sides) * Math.PI * 2
    return [cx + radius * Math.cos(t), cy + radius * Math.sin(t)]
  })
  return { polygon, rotation: 0 }
}

describe('two footprints overlap', () => {
  it('when one is drawn over the other', () => {
    expect(footprintsOverlap(rectangle(0, 0, 5, 5), rectangle(4, 4, 3, 3))).toBe(true)
  })

  it('but not when they only meet along a shared wall', () => {
    expect(footprintsOverlap(rectangle(0, 0, 4, 4), rectangle(4, 0, 4, 4))).toBe(false)
  })

  it('and not when they are a hair short of it either', () => {
    const gap = OVERLAP_TOLERANCE / 2
    expect(footprintsOverlap(rectangle(0, 0, 4, 4), rectangle(4 - gap, 0, 4, 4))).toBe(false)
  })

  it('when they are pushed past the tolerance into one another', () => {
    expect(footprintsOverlap(rectangle(0, 0, 4, 4), rectangle(3.99, 0, 4, 4))).toBe(true)
  })
})

describe('a turned footprint', () => {
  // A 4 x 4 room turned 45 degrees reaches 2.83 m from its centre at (2, 2);
  // the square's corner at (3.5, 3.5) is 2.12 + 2.12 = 3 m away along the diagonal.
  const diamond = rectangle(0, 0, 4, 4, 45)

  it('does not overlap a square standing in its bounding box but clear of its own outline', () => {
    const square = rectangle(3.5, 3.5, 4, 4)
    expect(obbsSeparated(obbOf(diamond), obbOf(square))).toBe(true)
    expect(footprintsOverlap(diamond, square)).toBe(false)
  })

  it('overlaps the same square slid in to meet it', () => {
    expect(footprintsOverlap(diamond, rectangle(2.8, 2.8, 4, 4))).toBe(true)
  })

  it('meets a neighbour turned the same way flush, wall to wall, without overlapping', () => {
    const a = rectangle(-1, -1, 2, 2, 45)
    const b = rectangle(Math.SQRT2 - 1, Math.SQRT2 - 1, 2, 2, 45)
    expect(footprintsOverlap(a, b)).toBe(false)
  })
})

describe('a room drawn round', () => {
  it('is not overlapped by a square touching only its bounding box', () => {
    expect(footprintsOverlap(circle(2, 2, 2), rectangle(3.5, 3.5, 2, 2))).toBe(false)
  })

  it('is overlapped by the same square slid onto it', () => {
    expect(footprintsOverlap(circle(2, 2, 2), rectangle(2.5, 2.5, 2, 2))).toBe(true)
  })
})

describe('the oriented bounding box', () => {
  it('carries the centre, the half extents and the turned axes', () => {
    const obb = obbOf(rectangle(0, 0, 4, 2, 90))
    expect([obb.cx, obb.cy]).toEqual([2, 1])
    expect([obb.halfWidth, obb.halfDepth]).toEqual([2, 1])
    expect(obb.ax[0]).toBeCloseTo(0, 12)
    expect(obb.ax[1]).toBeCloseTo(1, 12)
  })

  it('reads two boxes a whole metre apart as separated', () => {
    expect(obbsSeparated(obbOf(rectangle(0, 0, 4, 4)), obbOf(rectangle(5, 0, 4, 4)))).toBe(true)
  })
})

describe('the area two rooms really hold in common', () => {
  it('is nothing for rooms standing apart or brought flush wall to wall', () => {
    expect(sharedArea(rectangle(0, 0, 4, 4), rectangle(9, 0, 4, 4))).toBe(0)
    expect(sharedArea(rectangle(0, 0, 4, 4), rectangle(4, 0, 4, 4))).toBeCloseTo(0, 9)
  })

  it('is the overlap itself where two rooms really lie over each other', () => {
    expect(sharedArea(rectangle(0, 0, 4, 4), rectangle(3, 3, 4, 4))).toBeCloseTo(1, 9)
  })

  it('is nothing for a cutter sitting in the notch it made, which the cheap test calls a maybe', () => {
    const notched: Polygon = [
      [0, 0],
      [1, 0],
      [1, 1],
      [3, 1],
      [3, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const room: Footprint = { polygon: notched, rotation: 0 }
    const cutter = rectangle(1, -1, 2, 2)
    expect(footprintsOverlap(room, cutter)).toBe(true)
    expect(sharedArea(room, cutter)).toBeCloseTo(0, 9)
  })

  it('counts a bite taken out of the middle, where the difference leaves a hole', () => {
    const withHole: Polygon = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]
    const ring: Footprint = { polygon: withHole, rotation: 0 }
    expect(sharedArea(ring, rectangle(2, 2, 2, 2))).toBeCloseTo(4, 9)
  })
})
