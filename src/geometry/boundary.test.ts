import { describe, expect, it } from 'vitest'
import {
  clampDrawnRectangle,
  clampGroupInside,
  isOutsideBoundary,
  limitResize,
  shiftFootprintInside,
  shiftInside,
} from './boundary'
import { anchorPointOf, outlineOf, resizeFromAnchor } from './footprint'
import { boundingBox, rectangleToPolygon } from './polygon'
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

/** A 20 x 12 m plot at the sheet's origin. */
const plot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 12 })

describe('shifting a footprint inside the plot', () => {
  it('reports no shift for one already in', () => {
    expect(shiftFootprintInside(rectangle(5, 5, 2, 2), plot)).toEqual([0, 0])
  })

  it('brings one pushed 4 m past the east edge back exactly 4 m, and not at all on the other axis', () => {
    const [dx, dy] = shiftFootprintInside(rectangle(20, 4, 4, 3), plot)
    expect(dx).toBeCloseTo(-4, 9)
    expect(dy).toBeCloseTo(0, 9)
  })

  it('takes the offset of a plot that does not start at the origin', () => {
    const offset = rectangleToPolygon({ left: 4, top: 3, width: 10, depth: 8 })
    const [dx, dy] = shiftFootprintInside(rectangle(0, 0, 2, 2), offset)
    expect(dx).toBeCloseTo(4, 9)
    expect(dy).toBeCloseTo(3, 9)
  })

  it('holds a turned footprint by its corners, not by its rectangle', () => {
    const upright = rectangle(0, 4, 4, 4)
    expect(isOutsideBoundary(upright, plot)).toBe(false)
    const turned = { ...upright, rotation: 45 }
    expect(isOutsideBoundary(turned, plot)).toBe(true)
    const [slid] = clampGroupInside([turned], plot)
    expect(slid?.rotation).toBe(45)
    expect(slid && isOutsideBoundary(slid, plot)).toBe(false)
    // A 4 x 4 room turned 45 degrees reaches 2.83 m from its centre, so it slides 0.83 m east.
    expect(boundingBox(outlineOf(slid ?? upright)).left).toBeCloseTo(0, 6)
  })

  it('does not fight a footprint too big for the plot: it leaves that axis alone', () => {
    const huge = rectangle(-5, 2, 40, 4)
    expect(isOutsideBoundary(huge, plot)).toBe(true)
    expect(shiftFootprintInside(huge, plot)).toEqual([0, 0])
  })

  it('still clamps the axis that does fit when the other cannot', () => {
    const [dx, dy] = shiftFootprintInside(rectangle(-5, -3, 40, 4), plot)
    expect(dx).toBe(0)
    expect(dy).toBeCloseTo(3, 9)
  })

  it('holds a room inside a plot that is not a rectangle', () => {
    // A right-angled plot: the hypotenuse runs from (12, 0) to (0, 12), so x + y = 12.
    const triangle: Polygon = [
      [0, 0],
      [12, 0],
      [0, 12],
    ]
    const [dx, dy] = shiftInside(
      rectangleToPolygon({ left: 9, top: 9, width: 2, depth: 2 }),
      triangle,
    )
    expect(dx).toBeCloseTo(-5, 6)
    expect(dy).toBeCloseTo(-5, 6)
  })
})

describe('clamping a whole selection', () => {
  it('moves every footprint by the one shift, so the arrangement does not deform', () => {
    const a = rectangle(2, 10, 3, 3)
    const b = rectangle(6, 10, 3, 5)
    const out = clampGroupInside([a, b], plot)
    const da = boundingBox(out[0]?.polygon ?? []).top - 10
    const db = boundingBox(out[1]?.polygon ?? []).top - 10
    expect(da).toBeCloseTo(db, 9)
    // The deeper of the two ends flush against the south boundary.
    const box = boundingBox(out[1]?.polygon ?? [])
    expect(box.top + box.depth).toBeCloseTo(12, 6)
  })

  it('returns the footprints as they are when the selection is already inside', () => {
    const a = rectangle(1, 1, 2, 2)
    expect(clampGroupInside([a], plot)).toEqual([a])
  })
})

describe('a rectangle being drawn', () => {
  it('is cut back to the boundary', () => {
    expect(clampDrawnRectangle({ left: 17, top: 10, width: 8, depth: 6 }, plot)).toEqual({
      left: 17,
      top: 10,
      width: 3,
      depth: 2,
    })
  })

  it('is left alone while it stays inside', () => {
    const rect = { left: 2, top: 2, width: 4, depth: 4 }
    expect(clampDrawnRectangle(rect, plot)).toEqual(rect)
  })
})

describe('limiting a resize', () => {
  it('lets one that stays inside through untouched', () => {
    const from = rectangle(2, 2, 3, 3)
    const to = resizeFromAnchor(from, anchorPointOf(from, -1, -1), -1, -1, 6, 3)
    expect(limitResize(from, to, plot)).toBe(to)
  })

  it('stops one at the wall without moving the anchored corner', () => {
    const from = rectangle(16, 2, 3, 3)
    const anchor = anchorPointOf(from, -1, -1)
    const to = resizeFromAnchor(from, anchor, -1, -1, 9, 3)
    const held = limitResize(from, to, plot)
    const box = boundingBox(held.polygon)
    expect(box.left).toBeCloseTo(16, 9)
    // 4 m to within the boundary's own millimetre.
    expect(box.width).toBeCloseTo(4, 2)
    expect(isOutsideBoundary(held, plot)).toBe(false)
  })

  it('holds a dragged corner at the boundary and leaves every other corner alone', () => {
    const from: Footprint = {
      polygon: [
        [2, 2],
        [6, 2],
        [6, 6],
        [2, 6],
      ],
      rotation: 0,
    }
    const to: Footprint = {
      polygon: [
        [2, 2],
        [26, 2],
        [6, 6],
        [2, 6],
      ],
      rotation: 0,
    }
    const held = limitResize(from, to, plot)
    expect(held.polygon[1]?.[0]).toBeLessThanOrEqual(20 + 1e-3)
    expect(held.polygon[1]?.[0]).toBeGreaterThan(19.9)
    expect(held.polygon[1]?.[1]).toBeCloseTo(2, 9)
    expect(held.polygon[0]).toEqual([2, 2])
    expect(held.polygon[2]).toEqual([6, 6])
    expect(held.polygon[3]).toEqual([2, 6])
  })

  it('leaves a footprint that was already outside to be edited freely', () => {
    const from = rectangle(40, 40, 3, 3)
    const to = resizeFromAnchor(from, anchorPointOf(from, -1, -1), -1, -1, 9, 3)
    expect(limitResize(from, to, plot)).toBe(to)
  })
})
