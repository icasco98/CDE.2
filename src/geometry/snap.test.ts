import { describe, expect, it } from 'vitest'
import {
  GRID_M,
  nearestNeighbourPoint,
  snapPointToGrid,
  snapRectangleToNeighbours,
  snapToGrid,
  wallSnapOffset,
} from './snap'
import type { Polygon } from './types'

describe('the grid', () => {
  it('is a quarter of a metre', () => {
    expect(GRID_M).toBe(0.25)
  })

  it('rounds to the nearest quarter metre', () => {
    expect(snapToGrid(1.13)).toBeCloseTo(1.25, 9)
    expect(snapToGrid(1.12)).toBeCloseTo(1.0, 9)
    expect(snapToGrid(-0.6)).toBeCloseTo(-0.5, 9)
  })

  it('rounds both coordinates of a point', () => {
    const [x, y] = snapPointToGrid([1.13, 2.99])
    expect(x).toBeCloseTo(1.25, 9)
    expect(y).toBeCloseTo(3.0, 9)
  })
})

describe('snapping a moved rectangle to a neighbour', () => {
  const neighbour = { left: 0, top: 0, width: 4, depth: 4 }

  it('closes a 0.6 m gap to a facing neighbour', () => {
    const moved = snapRectangleToNeighbours(
      { left: 4.6, top: 1, width: 3, depth: 3 },
      [neighbour],
      1,
    )
    expect(moved.left).toBeCloseTo(4, 9)
    expect(moved.top).toBe(1)
  })

  it('leaves a gap wider than the reach', () => {
    const rect = { left: 5.6, top: 1, width: 3, depth: 3 }
    expect(snapRectangleToNeighbours(rect, [neighbour], 1)).toEqual(rect)
  })

  it('leaves a neighbour that is not facing it at all', () => {
    const rect = { left: 4.6, top: 6, width: 3, depth: 3 }
    expect(snapRectangleToNeighbours(rect, [neighbour], 1)).toEqual(rect)
  })

  it('closes on both axes at once', () => {
    const corner = { left: 4.5, top: 4.5, width: 3, depth: 3 }
    const others = [
      { left: 0, top: 4.5, width: 4, depth: 3 },
      { left: 4, top: 0, width: 4, depth: 4 },
    ]
    const moved = snapRectangleToNeighbours(corner, others, 1)
    expect(moved.left).toBeCloseTo(4, 9)
    expect(moved.top).toBeCloseTo(4, 9)
  })

  it('leaves one already touching where it stands', () => {
    const rect = { left: 4, top: 1, width: 3, depth: 3 }
    expect(snapRectangleToNeighbours(rect, [neighbour], 1)).toEqual(rect)
  })
})

describe('snapping a corner or a wall to a neighbour', () => {
  const neighbour: Polygon = [
    [5, 0],
    [8, 0],
    [8, 3],
    [5, 3],
  ]

  it('lands a dragged corner exactly on the corner of a neighbour within reach', () => {
    expect(nearestNeighbourPoint([5.1, 0.1], [neighbour], 0.25)).toEqual([5, 0])
  })

  it('lands it on the wall, not the corner, mid-wall', () => {
    const snapped = nearestNeighbourPoint([5.1, 1.5], [neighbour], 0.25)
    expect(snapped?.[0]).toBeCloseTo(5, 9)
    expect(snapped?.[1]).toBeCloseTo(1.5, 9)
  })

  it('does not snap once the neighbour is out of reach', () => {
    expect(nearestNeighbourPoint([5.5, 1.5], [neighbour], 0.25)).toBeNull()
  })

  it('pulls a wall the last 0.1 m flush against a parallel neighbour wall', () => {
    expect(wallSnapOffset([4.9, 0], [4.9, 3], [1, 0], [neighbour], 0.25)).toBeCloseTo(0.1, 9)
  })

  it('ignores a neighbour wall that is not parallel to it', () => {
    expect(wallSnapOffset([4, 0], [4.3, 0.4], [0.8, -0.6], [neighbour], 0.25)).toBe(0)
  })

  it('ignores a parallel wall beyond the reach', () => {
    expect(wallSnapOffset([4.5, 0], [4.5, 3], [1, 0], [neighbour], 0.25)).toBe(0)
  })
})
