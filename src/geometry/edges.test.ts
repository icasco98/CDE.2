import { describe, expect, it } from 'vitest'
import { outlineOf } from './footprint'
import { rectangleToPolygon } from './polygon'
import {
  outwardEdges,
  sharedEdges,
  edgeDirection,
  edgeLength,
  edgeMidpoint,
  EDGE_TOLERANCE,
} from './edges'
import type { Footprint, Polygon } from './types'

const room = (left: number, top: number, width: number, depth: number): Polygon =>
  rectangleToPolygon({ left, top, width, depth })

describe('shared edges', () => {
  it('finds the run two rooms hold in common', () => {
    const edges = sharedEdges(room(0, 0, 4, 4), room(4, 1, 3, 3), 0.04)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.from).toEqual([4, 1])
    expect(edges[0]?.to).toEqual([4, 4])
  })

  it('finds nothing where two rooms only meet at a corner', () => {
    expect(sharedEdges(room(0, 0, 4, 4), room(4, 4, 3, 3), 0.04)).toHaveLength(0)
  })

  it('finds nothing between rooms standing apart', () => {
    expect(sharedEdges(room(0, 0, 4, 4), room(5, 0, 4, 4), 0.04)).toHaveLength(0)
  })

  it('reads two edges a hair apart as one edge, within the tolerance', () => {
    expect(sharedEdges(room(0, 0, 4, 4), room(4.02, 0, 4, 4), 0.04)).toHaveLength(1)
    expect(sharedEdges(room(0, 0, 4, 4), room(4.02, 0, 4, 4), 0.01)).toHaveLength(0)
  })

  it('finds the edge between two rooms turned to the same angle', () => {
    const a: Footprint = { polygon: room(-1, -1, 2, 2), rotation: 45 }
    const b: Footprint = { polygon: room(Math.SQRT2 - 1, Math.SQRT2 - 1, 2, 2), rotation: 45 }
    const edges = sharedEdges(outlineOf(a), outlineOf(b), 0.01)
    expect(edges).toHaveLength(1)
    const [edge] = edges
    const length = edge ? Math.hypot(edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]) : 0
    expect(length).toBeCloseTo(2, 4)
  })

  it('reads the edge a shape that is not a rectangle actually shares', () => {
    // A right triangle whose vertical edge matches the room's east edge exactly;
    // its other two edges share nothing with the room at all.
    const triangle: Polygon = [
      [4, 0],
      [7, 0],
      [4, 4],
    ]
    const edges = sharedEdges(room(0, 0, 4, 4), triangle, 0.04)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.from).toEqual([4, 0])
    expect(edges[0]?.to).toEqual([4, 4])
  })

  it('finds both runs where a carve leaves two rooms meeting twice', () => {
    // A U: the room's east edge meets the neighbour above and below a notch.
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
    expect(sharedEdges(u, room(4, 0, 2, 4), 0.01)).toHaveLength(2)
  })
})

describe('outward edges', () => {
  const normals = (polygon: Polygon): number[][] =>
    outwardEdges(polygon).map((edge) => [edge.normal[0] + 0, edge.normal[1] + 0])

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
      outwardEdges([
        [0, 0],
        [0, 0],
        [4, 0],
        [4, 3],
      ]),
    ).toHaveLength(3)
  })
})

describe('reading one shared edge', () => {
  const edge = { from: [4, 1] as const, to: [4, 4] as const }

  it('measures its run, its middle and the way it points', () => {
    expect(edgeLength(edge)).toBeCloseTo(3, 9)
    expect(edgeMidpoint(edge)).toEqual([4, 2.5])
    expect(edgeDirection(edge)).toEqual([0, 1])
  })

  it('reads an edge of no length as running east rather than nowhere', () => {
    expect(edgeDirection({ from: [2, 2], to: [2, 2] })).toEqual([1, 0])
  })

  it('holds two edges five centimetres apart to be the one edge', () => {
    expect(sharedEdges(room(0, 0, 4, 4), room(4.04, 1, 3, 3), EDGE_TOLERANCE)).toHaveLength(1)
    expect(sharedEdges(room(0, 0, 4, 4), room(4.2, 1, 3, 3), EDGE_TOLERANCE)).toHaveLength(0)
  })
})
