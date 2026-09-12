import { describe, expect, it } from 'vitest'
import {
  anchorPointOf,
  frameOf,
  localToSheetPoint,
  outlineOf,
  placeInFrame,
  resizeFromAnchor,
  sheetToLocalPoint,
  sheetToLocalPolygon,
  sheetToLocalVector,
  translateFootprint,
  type Handle,
} from './footprint'
import { area, boundingBox, rectangleToPolygon } from './polygon'
import type { Footprint } from './types'

function rectangle(
  left: number,
  top: number,
  width: number,
  depth: number,
  rotation = 0,
): Footprint {
  return { polygon: rectangleToPolygon({ left, top, width, depth }), rotation }
}

describe('the placed outline', () => {
  it('is the polygon itself when nothing is turned', () => {
    const footprint = rectangle(1, 2, 4, 6)
    expect(outlineOf(footprint)).toEqual(footprint.polygon)
  })

  it('needs 7.07 m of width for a 4 x 6 m room turned 45 degrees', () => {
    const bounds = boundingBox(outlineOf(rectangle(0, 0, 4, 6, 45)))
    expect(bounds.width).toBeCloseTo(10 / Math.SQRT2, 6)
    expect(bounds.depth).toBeCloseTo(10 / Math.SQRT2, 6)
  })

  it('turns about the centre of the bounding box, so the area and centre keep', () => {
    const turned = outlineOf(rectangle(0, 0, 4, 6, 37))
    expect(area(turned)).toBeCloseTo(24, 9)
    expect(boundingBox(turned).left + boundingBox(turned).width / 2).toBeCloseTo(2, 9)
  })

  it('turns clockwise on the sheet, where y runs down', () => {
    // A 4 x 2 room turned a quarter turn stands 2 wide and 4 deep about the same centre.
    const bounds = boundingBox(outlineOf(rectangle(0, 0, 4, 2, 90)))
    expect(bounds.left).toBeCloseTo(1, 9)
    expect(bounds.top).toBeCloseTo(-1, 9)
    expect(bounds.width).toBeCloseTo(2, 9)
    expect(bounds.depth).toBeCloseTo(4, 9)
  })
})

describe('the frame', () => {
  it('carries the centre and the turn', () => {
    const frame = frameOf(rectangle(0, 0, 4, 2, 90))
    expect([frame.cx, frame.cy]).toEqual([2, 1])
    expect(frame.cos).toBeCloseTo(0, 12)
    expect(frame.sin).toBeCloseTo(1, 12)
    expect(frame.rotated).toBe(true)
  })

  it('takes a point to the sheet and back again', () => {
    const frame = frameOf(rectangle(1, 2, 4, 6, 23))
    const there = localToSheetPoint([3, 5], frame)
    const back = sheetToLocalPoint(there, frame)
    expect(back[0]).toBeCloseTo(3, 9)
    expect(back[1]).toBeCloseTo(5, 9)
  })

  it('takes a whole polygon into the frame of a turned footprint', () => {
    const frame = frameOf(rectangle(0, 0, 4, 4, 90))
    // The quarter turn is about (2, 2): the sheet corner (4, 0) reads as (0, 0) locally.
    const local = sheetToLocalPolygon([[4, 0]], frame)
    expect(local[0]?.[0]).toBeCloseTo(0, 9)
    expect(local[0]?.[1]).toBeCloseTo(0, 9)
  })

  it('turns a drag delta into the axes of the footprint, with no translation', () => {
    const frame = frameOf(rectangle(10, 10, 4, 2, 90))
    const [dx, dy] = sheetToLocalVector(1, 0, frame)
    expect(dx).toBeCloseTo(0, 9)
    expect(dy).toBeCloseTo(-1, 9)
  })
})

describe('moving a footprint', () => {
  it('shifts every vertex and keeps the turn', () => {
    const moved = translateFootprint(rectangle(0, 0, 4, 2, 30), [1, -2])
    expect(boundingBox(moved.polygon)).toEqual({ left: 1, top: -2, width: 4, depth: 2 })
    expect(moved.rotation).toBe(30)
  })

  it('returns the very same footprint for no move at all', () => {
    const footprint = rectangle(0, 0, 4, 2)
    expect(translateFootprint(footprint, [0, 0])).toBe(footprint)
  })
})

describe('resizing about an anchor', () => {
  it('reads the corner of an unturned footprint off its bounding box', () => {
    expect(anchorPointOf(rectangle(0, 0, 4, 2), -1, -1)).toEqual([0, 0])
    expect(anchorPointOf(rectangle(0, 0, 4, 2), 1, 1)).toEqual([4, 2])
  })

  it('reads the corner of a quarter-turned footprint off the sheet', () => {
    const anchor = anchorPointOf(rectangle(0, 0, 4, 2, 90), -1, -1)
    expect(anchor[0]).toBeCloseTo(3, 9)
    expect(anchor[1]).toBeCloseTo(-1, 9)
  })

  it('keeps the far corner still while an unturned footprint grows', () => {
    const footprint = rectangle(0, 0, 4, 2)
    const resized = resizeFromAnchor(footprint, anchorPointOf(footprint, -1, -1), -1, -1, 6, 5)
    expect(boundingBox(resized.polygon)).toEqual({ left: 0, top: 0, width: 6, depth: 5 })
  })

  it('keeps the far corner still at any angle, on every corner', () => {
    const footprint = rectangle(1, 2, 5, 3, 37)
    const corners: [Handle, Handle][] = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]
    for (const [sx, sy] of corners) {
      const anchor = anchorPointOf(footprint, sx, sy)
      const resized = resizeFromAnchor(footprint, anchor, sx, sy, 8, 6)
      const held = anchorPointOf(resized, sx, sy)
      expect(held[0]).toBeCloseTo(anchor[0], 9)
      expect(held[1]).toBeCloseTo(anchor[1], 9)
      expect(boundingBox(resized.polygon).width).toBeCloseTo(8, 9)
      expect(boundingBox(resized.polygon).depth).toBeCloseTo(6, 9)
    }
  })

  it('keeps the midpoint of the opposite wall still for a wall drag on a turned footprint', () => {
    const footprint = rectangle(0, 0, 4, 2, 30)
    const anchor = anchorPointOf(footprint, -1, 0)
    const resized = resizeFromAnchor(footprint, anchor, -1, 0, 9, 2)
    const held = anchorPointOf(resized, -1, 0)
    expect(held[0]).toBeCloseTo(anchor[0], 9)
    expect(held[1]).toBeCloseTo(anchor[1], 9)
    expect(boundingBox(resized.polygon).width).toBeCloseTo(9, 9)
  })

  it('scales the vertices of a shape that is not a rectangle', () => {
    const triangle: Footprint = {
      polygon: [
        [0, 0],
        [4, 0],
        [0, 2],
      ],
      rotation: 0,
    }
    const resized = resizeFromAnchor(triangle, [0, 0], -1, -1, 8, 6)
    expect(resized.polygon).toEqual([
      [0, 0],
      [8, 0],
      [0, 6],
    ])
  })
})

describe('what a change to a footprint does to the arcs it remembers', () => {
  const curved: Footprint = {
    polygon: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ],
    rotation: 0,
    arcs: [{ from: 1, to: 2, centre: [4, 1.5], radius: 1.5, clockwise: true }],
  }

  it('carries them along with a move, centres and all', () => {
    const moved = translateFootprint(curved, [2, 5])
    expect(moved.arcs).toEqual([{ from: 1, to: 2, centre: [6, 6.5], radius: 1.5, clockwise: true }])
  })

  it('leaves them behind on a resize, which no longer holds their circle', () => {
    expect(resizeFromAnchor(curved, [0, 0], -1, -1, 8, 6).arcs).toBeUndefined()
  })

  it('carries them through a polygon rewritten in the same frame', () => {
    const placed = placeInFrame(curved.polygon, frameOf(curved), 0, curved.arcs)
    expect(placed.arcs).toEqual(curved.arcs)
  })
})
