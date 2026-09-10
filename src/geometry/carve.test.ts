import { describe, expect, it } from 'vitest'
import { carveFootprint, holdsRectangle, subtractPolygons } from './carve'
import { outlineOf } from './footprint'
import { area, boundingBox, rectangleToPolygon } from './polygon'
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

describe('subtracting polygons', () => {
  it('takes a 1 x 1 bite out of a 3 x 3 room, leaving 8 m2 in one piece', () => {
    const subject = rectangleToPolygon({ left: 0, top: 0, width: 3, depth: 3 })
    const bite = rectangleToPolygon({ left: 2, top: 2, width: 1, depth: 1 })
    const { polygon, split } = subtractPolygons(subject, [bite])
    expect(area(polygon)).toBeCloseTo(8, 9)
    expect(split).toBe(false)
    expect(polygon).toHaveLength(6)
  })

  it('keeps the larger piece and reports the cut in two', () => {
    const subject = rectangleToPolygon({ left: 0, top: 0, width: 10, depth: 2 })
    const bar = rectangleToPolygon({ left: 3, top: -1, width: 1, depth: 4 })
    const { polygon, split } = subtractPolygons(subject, [bar])
    expect(split).toBe(true)
    expect(area(polygon)).toBeCloseTo(12, 9)
  })

  it('takes two bites at once', () => {
    const subject = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 4 })
    const cutters = [
      rectangleToPolygon({ left: 0, top: 0, width: 1, depth: 1 }),
      rectangleToPolygon({ left: 3, top: 3, width: 1, depth: 1 }),
    ]
    expect(area(subtractPolygons(subject, cutters).polygon)).toBeCloseTo(14, 9)
  })

  it('returns the subject itself when nothing cuts it', () => {
    const subject = rectangleToPolygon({ left: 0, top: 0, width: 3, depth: 3 })
    expect(subtractPolygons(subject, [])).toEqual({ polygon: subject, split: false })
  })

  it('leaves nothing when the subject is covered outright', () => {
    const subject = rectangleToPolygon({ left: 1, top: 1, width: 2, depth: 2 })
    const cover = rectangleToPolygon({ left: 0, top: 0, width: 6, depth: 6 })
    expect(subtractPolygons(subject, [cover]).polygon).toEqual([])
  })
})

describe('carving one footprint out of another', () => {
  it('cuts the corner and says so', () => {
    const result = carveFootprint(rectangle(0, 0, 3, 3), [rectangle(2, 2, 1, 1)])
    expect(result.carved).toBe(true)
    expect(result.split).toBe(false)
    expect(area(outlineOf(result.footprint))).toBeCloseTo(8, 9)
  })

  it('leaves a footprint nothing reaches exactly as it was', () => {
    const room = rectangle(0, 0, 3, 3)
    expect(carveFootprint(room, [rectangle(20, 20, 3, 3)]).footprint).toBe(room)
    expect(carveFootprint(room, []).carved).toBe(false)
  })

  it('keeps the turn, and puts the remainder back where the cut left it', () => {
    // A 4 x 4 room turned a quarter turn covers the same square; a 1 x 4 strip
    // taken off its east side must leave exactly the 3 x 4 rectangle beside it.
    const result = carveFootprint(rectangle(0, 0, 4, 4, 90), [rectangle(3, 0, 1, 4)])
    expect(result.footprint.rotation).toBe(90)
    const outline = outlineOf(result.footprint)
    expect(area(outline)).toBeCloseTo(12, 6)
    const box = boundingBox(outline)
    expect(box.left).toBeCloseTo(0, 6)
    expect(box.top).toBeCloseTo(0, 6)
    expect(box.width).toBeCloseTo(3, 6)
    expect(box.depth).toBeCloseTo(4, 6)
  })

  it('leaves an empty polygon when the cutter covers the room outright', () => {
    const result = carveFootprint(rectangle(1, 1, 2, 2), [rectangle(0, 0, 6, 6)])
    expect(result.footprint.polygon).toEqual([])
    expect(result.carved).toBe(true)
  })

  it('cuts a slanted notch when the cutter is the turned one', () => {
    const result = carveFootprint(rectangle(0, 0, 5, 5), [rectangle(4, 4, 3, 3, 30)])
    expect(result.carved).toBe(true)
    expect(area(outlineOf(result.footprint))).toBeLessThan(25)
    expect(outlineOf(result.footprint).length).toBeGreaterThan(4)
  })

  it('reports the room cut in two, keeping its larger half', () => {
    const result = carveFootprint(rectangle(0, 0, 10, 2), [rectangle(6, -1, 1, 4)])
    expect(result.split).toBe(true)
    expect(area(outlineOf(result.footprint))).toBeCloseTo(12, 9)
  })
})

describe('does the remainder still hold a rectangle', () => {
  const square: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 4 })

  it('holds 2.7 x 3 in an untouched 4 x 4 room', () => {
    expect(holdsRectangle(square, 2.7, 3)).toBe(true)
  })

  it('refuses a shape of the same area that is far too thin', () => {
    expect(
      holdsRectangle(rectangleToPolygon({ left: 0, top: 0, width: 8.1, depth: 1 }), 2.7, 3),
    ).toBe(false)
  })

  it('still holds it once a small corner is bitten out', () => {
    const bitten = subtractPolygons(square, [
      rectangleToPolygon({ left: 3, top: 3, width: 1, depth: 1 }),
    ]).polygon
    expect(holdsRectangle(bitten, 2.7, 3)).toBe(true)
  })

  it('refuses once the bite leaves no strip wide enough', () => {
    const bitten = subtractPolygons(square, [
      rectangleToPolygon({ left: 1.5, top: 0, width: 1, depth: 4 }),
    ]).polygon
    expect(holdsRectangle(bitten, 2.7, 3)).toBe(false)
    expect(holdsRectangle(bitten, 1.5, 3)).toBe(true)
  })
})
