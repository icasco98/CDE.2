import { describe, expect, it } from 'vitest'
import { buildingOutline, ringsToPath } from './outline'
import { area, rectangleToPolygon } from './polygon'

describe('the building outline', () => {
  it('is one ring around two rooms that share a wall, of area 8', () => {
    const rings = buildingOutline([
      rectangleToPolygon({ left: 0, top: 0, width: 2, depth: 2 }),
      rectangleToPolygon({ left: 2, top: 0, width: 2, depth: 2 }),
    ])
    expect(rings).toHaveLength(1)
    expect(area(rings[0] ?? [])).toBeCloseTo(8, 9)
  })

  it('counts the shared part of two overlapping rooms once', () => {
    const rings = buildingOutline([
      rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 4 }),
      rectangleToPolygon({ left: 3, top: 0, width: 4, depth: 4 }),
    ])
    expect(rings).toHaveLength(1)
    expect(area(rings[0] ?? [])).toBeCloseTo(28, 9)
  })

  it('gives two rings for two rooms standing apart', () => {
    const rings = buildingOutline([
      rectangleToPolygon({ left: 0, top: 0, width: 2, depth: 2 }),
      rectangleToPolygon({ left: 10, top: 0, width: 2, depth: 2 }),
    ])
    expect(rings).toHaveLength(2)
  })

  it('puts a courtyard after the outer ring it sits in', () => {
    const rings = buildingOutline([
      rectangleToPolygon({ left: 0, top: 0, width: 6, depth: 1 }),
      rectangleToPolygon({ left: 0, top: 5, width: 6, depth: 1 }),
      rectangleToPolygon({ left: 0, top: 0, width: 1, depth: 6 }),
      rectangleToPolygon({ left: 5, top: 0, width: 1, depth: 6 }),
    ])
    expect(rings).toHaveLength(2)
    expect(area(rings[0] ?? [])).toBeCloseTo(36, 9)
    expect(area(rings[1] ?? [])).toBeCloseTo(16, 9)
  })

  it('is empty for nothing drawn yet', () => {
    expect(buildingOutline([])).toEqual([])
  })
})

describe('rings as an SVG path', () => {
  it('closes every ring, to the millimetre', () => {
    expect(ringsToPath([rectangleToPolygon({ left: 0, top: 0, width: 1, depth: 2 })])).toBe(
      'M 0.000,0.000 L 1.000,0.000 L 1.000,2.000 L 0.000,2.000 Z',
    )
  })

  it('runs the rings together, outer then hole', () => {
    const path = ringsToPath([
      rectangleToPolygon({ left: 0, top: 0, width: 2, depth: 2 }),
      rectangleToPolygon({ left: 0.5, top: 0.5, width: 1, depth: 1 }),
    ])
    expect(path.match(/Z/g)).toHaveLength(2)
    expect(path).toContain('M 0.500,0.500')
  })
})
