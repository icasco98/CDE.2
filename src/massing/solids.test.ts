import { describe, expect, it } from 'vitest'
import { arcPoints, rectangleToPolygon, type Polygon } from '../geometry'
import type { Room } from '../model'
import { facesOf } from './solids'

function room(polygon: Polygon, storey = 0, storeysSpanned = 1): Room {
  return {
    id: 'r',
    name: 'Room',
    type: 'bedroom',
    storey,
    storeysSpanned,
    targetArea: 20,
    pinned: false,
    footprint: { polygon, rotation: 0 },
  }
}

const box = rectangleToPolygon({ left: 0, top: 0, width: 4, depth: 3 })

function levels(faces: readonly { readonly corners: readonly (readonly number[])[] }[]): number[] {
  const found = new Set<number>()
  for (const face of faces) for (const corner of face.corners) found.add(corner[2] ?? 0)
  return [...found].sort((a, b) => a - b)
}

describe('one placed room', () => {
  const faces = facesOf(room(box), 1, [3.5])

  it('stands as one top and one wall per side of its outline', () => {
    expect(faces.filter((face) => face.kind === 'side')).toHaveLength(4)
    expect(faces.filter((face) => face.kind === 'top')).toHaveLength(1)
    expect(faces.every((face) => face.roomId === 'r')).toBe(true)
  })

  it('runs from the ground to the storey height', () => {
    expect(levels(faces)).toEqual([0, 3.5])
  })

  it('carries the whole outline round the top', () => {
    const top = faces.find((face) => face.kind === 'top')
    expect(top?.corners.map((corner) => [corner[0], corner[1]])).toEqual(
      box.map((point) => [point[0], point[1]]),
    )
  })
})

it('stands a room on the first storey on top of the ground storey height', () => {
  expect(levels(facesOf(room(box, 1), 2, [3, 4]))).toEqual([3, 7])
})

it('makes one prism of a stair through every storey it spans', () => {
  const faces = facesOf(room(box, 0, 2), 2, [3, 4])
  expect(levels(faces)).toEqual([0, 7])
  expect(faces.filter((face) => face.kind === 'top')).toHaveLength(1)
})

it('turns a footprint before it stands it up', () => {
  const turned = { ...room(box), footprint: { polygon: box, rotation: 90 } }
  const top = facesOf(turned, 1, [3.5]).find((face) => face.kind === 'top')
  const xs = (top?.corners ?? []).map((corner) => corner[0])
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3, 9)
})

it('draws nothing for a room that is not placed', () => {
  const bare: Room = { ...room(box) }
  delete (bare as { footprint?: unknown }).footprint
  expect(facesOf(bare, 1, [3.5])).toEqual([])
})

it('draws nothing for a room standing past the top of the project', () => {
  expect(facesOf(room(box, 2), 2, [3.5, 3.5])).toEqual([])
})

it('stands a circular room up as a faceted prism of one wall per polygon side', () => {
  const centre = [10, 12] as const
  const ring = arcPoints(centre, 2.5, 0, 0, true).slice(0, -1)
  const circle: Room = {
    ...room(ring),
    footprint: {
      polygon: ring,
      rotation: 0,
      arcs: [{ from: 0, to: 0, centre, radius: 2.5, clockwise: true }],
    },
  }
  const faces = facesOf(circle, 1, [3.5])
  expect(faces.filter((face) => face.kind === 'side')).toHaveLength(ring.length)
  expect(faces.filter((face) => face.kind === 'top')[0]?.corners).toHaveLength(ring.length)
})
