import { describe, expect, it } from 'vitest'
import { outlineOf } from './footprint'
import { rectangleToPolygon } from './polygon'
import { outwardWalls, sharedWalls } from './walls'
import type { Footprint, Polygon } from './types'

const room = (left: number, top: number, width: number, depth: number): Polygon =>
  rectangleToPolygon({ left, top, width, depth })

describe('shared walls', () => {
  it('finds the run two rooms hold in common', () => {
    const walls = sharedWalls(room(0, 0, 4, 4), room(4, 1, 3, 3), 0.04)
    expect(walls).toHaveLength(1)
    expect(walls[0]?.from).toEqual([4, 1])
    expect(walls[0]?.to).toEqual([4, 4])
  })

  it('finds nothing where two rooms only meet at a corner', () => {
    expect(sharedWalls(room(0, 0, 4, 4), room(4, 4, 3, 3), 0.04)).toHaveLength(0)
  })

  it('finds nothing between rooms standing apart', () => {
    expect(sharedWalls(room(0, 0, 4, 4), room(5, 0, 4, 4), 0.04)).toHaveLength(0)
  })

  it('reads two walls a hair apart as one wall, within the tolerance', () => {
    expect(sharedWalls(room(0, 0, 4, 4), room(4.02, 0, 4, 4), 0.04)).toHaveLength(1)
    expect(sharedWalls(room(0, 0, 4, 4), room(4.02, 0, 4, 4), 0.01)).toHaveLength(0)
  })

  it('finds the wall between two rooms turned to the same angle', () => {
    const a: Footprint = { polygon: room(-1, -1, 2, 2), rotation: 45 }
    const b: Footprint = { polygon: room(Math.SQRT2 - 1, Math.SQRT2 - 1, 2, 2), rotation: 45 }
    const walls = sharedWalls(outlineOf(a), outlineOf(b), 0.01)
    expect(walls).toHaveLength(1)
    const [wall] = walls
    const length = wall ? Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]) : 0
    expect(length).toBeCloseTo(2, 4)
  })

  it('reads the wall a shape that is not a rectangle actually shares', () => {
    // A right triangle whose vertical edge matches the room's east wall exactly;
    // its other two edges share nothing with the room at all.
    const triangle: Polygon = [
      [4, 0],
      [7, 0],
      [4, 4],
    ]
    const walls = sharedWalls(room(0, 0, 4, 4), triangle, 0.04)
    expect(walls).toHaveLength(1)
    expect(walls[0]?.from).toEqual([4, 0])
    expect(walls[0]?.to).toEqual([4, 4])
  })

  it('finds both runs where a carve leaves two rooms meeting twice', () => {
    // A U: the room's east wall meets the neighbour above and below a notch.
    const u: Polygon = [
      [0, 0],
      [4, 0],
      [4, 1],
      [3, 1],
      [3, 3],
      [4, 3],
      [4, 4],
      [0, 4],
    ]
    expect(sharedWalls(u, room(4, 0, 2, 4), 0.01)).toHaveLength(2)
  })
})

describe('outward walls', () => {
  const normals = (polygon: Polygon): number[][] =>
    outwardWalls(polygon).map((wall) => [wall.normal[0] + 0, wall.normal[1] + 0])

  it('points every normal away from the inside of a rectangle', () => {
    expect(normals(room(0, 0, 4, 3))).toEqual([
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
  })

  it('points them out of the shape whichever way the ring is wound', () => {
    expect(normals([...room(0, 0, 4, 3)].reverse())).toEqual([
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ])
  })

  it('leaves out an edge of no length', () => {
    expect(
      outwardWalls([
        [0, 0],
        [0, 0],
        [4, 0],
        [4, 3],
      ]),
    ).toHaveLength(3)
  })
})
