import { describe, expect, it } from 'vitest'
import { rectangleToPolygon, type Polygon } from '../geometry'
import type { Room } from '../model'
import { envelopeOf } from './numbers'

function room(id: string, polygon: Polygon, storey = 0, storeysSpanned = 1): Room {
  return {
    id,
    name: id,
    type: 'bedroom',
    storey,
    storeysSpanned,
    targetArea: 20,
    pinned: false,
    footprint: { polygon, rotation: 0 },
  }
}

const square = rectangleToPolygon({ left: 0, top: 0, width: 10, depth: 10 })

function envelope(rooms: readonly Room[], heights: readonly number[], plotArea = 0) {
  return envelopeOf({ rooms, storeys: heights.length, heights, plotArea })
}

describe('one 10 by 10 room on one storey of 3.5 m', () => {
  const numbers = envelope([room('a', square)], [3.5])

  it('has 100 m² of floor, 140 m² of wall, 100 m² of roof and 350 m³', () => {
    expect(numbers.grossFloorArea).toBeCloseTo(100, 6)
    expect(numbers.perStorey[0]?.outlinePerimeter).toBeCloseTo(40, 6)
    expect(numbers.wallArea).toBeCloseTo(140, 6)
    expect(numbers.roofArea).toBeCloseTo(100, 6)
    expect(numbers.volume).toBeCloseTo(350, 6)
  })

  it('has a surface-to-volume ratio of 0.6857 and stands 3.5 m', () => {
    expect(Number(numbers.surfaceToVolume.toFixed(4))).toBe(0.6857)
    expect(numbers.buildingHeight).toBeCloseTo(3.5, 6)
  })
})

describe('the same room on two storeys of 3.5 m each', () => {
  const numbers = envelope([room('a', square), room('b', square, 1)], [3.5, 3.5])

  it('doubles the floor and the walls, keeps one roof, and doubles the volume', () => {
    expect(numbers.grossFloorArea).toBeCloseTo(200, 6)
    expect(numbers.wallArea).toBeCloseTo(280, 6)
    expect(numbers.roofArea).toBeCloseTo(100, 6)
    expect(numbers.volume).toBeCloseTo(700, 6)
  })

  it('has a surface-to-volume ratio of 0.5429', () => {
    expect(Number(numbers.surfaceToVolume.toFixed(4))).toBe(0.5429)
  })
})

describe('a first storey of 10 by 5 sitting on a ground of 10 by 10', () => {
  const first = rectangleToPolygon({ left: 0, top: 0, width: 10, depth: 5 })
  const numbers = envelope([room('a', square), room('b', first, 1)], [3.5, 3.5])

  it('has 140 + 105 m² of wall, 50 + 50 m² of roof and 350 + 175 m³', () => {
    expect(numbers.wallArea).toBeCloseTo(245, 6)
    expect(numbers.roofArea).toBeCloseTo(100, 6)
    expect(numbers.volume).toBeCloseTo(525, 6)
  })
})

describe('two 5 by 4 rooms sharing a 4 m wall on one storey', () => {
  const left = rectangleToPolygon({ left: 0, top: 0, width: 5, depth: 4 })
  const right = rectangleToPolygon({ left: 5, top: 0, width: 5, depth: 4 })
  const numbers = envelope([room('a', left), room('b', right)], [3.5])

  it('measures the outline once round, 28 m and not 36 m', () => {
    expect(numbers.perStorey[0]?.outlinePerimeter).toBeCloseTo(28, 6)
    expect(numbers.wallArea).toBeCloseTo(98, 6)
  })

  it('keeps the floor area of both rooms', () => {
    expect(numbers.grossFloorArea).toBeCloseTo(40, 6)
    expect(numbers.perStorey[0]?.outlineArea).toBeCloseTo(40, 6)
  })
})

it('reads 600 m² of gross floor on a 500 m² plot as 120%', () => {
  const wide = rectangleToPolygon({ left: 0, top: 0, width: 30, depth: 20 })
  const numbers = envelope([room('a', wide)], [3.5], 500)
  expect(numbers.grossFloorArea).toBeCloseTo(600, 6)
  expect(numbers.plotRatioPercent).toBeCloseTo(120, 6)
})

it('counts a stair that spans two storeys on both of them', () => {
  const stair = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 3 })
  const numbers = envelope([room('s', stair, 0, 2)], [3.5, 3.5])
  expect(numbers.grossFloorArea).toBeCloseTo(24, 6)
  expect(numbers.volume).toBeCloseTo(84, 6)
  expect(numbers.roofArea).toBeCloseTo(12, 6)
})

it('leaves a courtyard out of the covered area and counts its walls', () => {
  const ring = [
    room('n', rectangleToPolygon({ left: 0, top: 0, width: 10, depth: 2 })),
    room('s', rectangleToPolygon({ left: 0, top: 8, width: 10, depth: 2 })),
    room('w', rectangleToPolygon({ left: 0, top: 2, width: 2, depth: 6 })),
    room('e', rectangleToPolygon({ left: 8, top: 2, width: 2, depth: 6 })),
  ]
  const numbers = envelope(ring, [3.5])
  expect(numbers.perStorey[0]?.outlineArea).toBeCloseTo(64, 6)
  expect(numbers.perStorey[0]?.outlinePerimeter).toBeCloseTo(64, 6)
})

it('says nothing at all when no room is placed', () => {
  const numbers = envelope([], [3.5, 3.5])
  expect(numbers.grossFloorArea).toBe(0)
  expect(numbers.surfaceToVolume).toBe(0)
  expect(numbers.buildingHeight).toBeCloseTo(7, 6)
})
