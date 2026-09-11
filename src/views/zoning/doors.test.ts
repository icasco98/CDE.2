import { describe, expect, it } from 'vitest'
import { outlineOf, rectangleToPolygon, type Footprint } from '../../geometry'
import { EXTERIOR, type Edge, type Plot } from '../../model'
import { edgeMarks, proposalsFrom, streetSides, wallPairs, type Standing } from './doors'

const plot: Plot = {
  on: true,
  polygon: rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 }),
  north: 0,
  street: [2],
}

function room(id: string, left: number, top: number, width: number, depth: number): Standing {
  return { id, outline: rectangleToPolygon({ left, top, width, depth }) }
}

function edge(id: string, a: string, b: string, extra: Partial<Edge> = {}): Edge {
  return { id, a, b, kind: 'door', storey: 0, ...extra }
}

describe('doors drawn from edges', () => {
  it('puts a door at the middle of the longest wall two rooms share', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    const { doors, tensions } = edgeMarks(standing, [edge('e1', 'a', 'b')], plot)
    expect(tensions).toHaveLength(0)
    expect(doors).toHaveLength(1)
    expect(doors[0]?.at).toEqual([5, 2])
    expect(doors[0]?.along).toEqual([0, 1])
  })

  it('draws an open edge as an open edge, not a leaf', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    const { doors } = edgeMarks(standing, [edge('e1', 'a', 'b', { kind: 'open' })], plot)
    expect(doors[0]?.kind).toBe('open')
  })

  it('draws the door at the hint where the hint lies on a shared wall', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    const { doors } = edgeMarks(standing, [edge('e1', 'a', 'b', { hint: { at: [5.05, 3] } })], plot)
    expect(doors[0]?.at).toEqual([5, 3])
  })

  it('ignores a hint that has drifted off every shared wall', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    const { doors } = edgeMarks(standing, [edge('e1', 'a', 'b', { hint: { at: [9, 9] } })], plot)
    expect(doors[0]?.at).toEqual([5, 2])
  })

  it('draws the main door on the room`s outline nearest a street side', () => {
    const standing = [room('a', 4, 19, 5, 4)]
    const { doors } = edgeMarks(standing, [edge('e1', EXTERIOR, 'a', { kind: 'main-door' })], plot)
    expect(doors).toHaveLength(1)
    expect(doors[0]?.at?.[1]).toBe(23)
  })

  it('draws nothing for an edge whose room is not on this storey', () => {
    const { doors, tensions } = edgeMarks([room('a', 0, 0, 5, 4)], [edge('e1', 'a', 'b')], plot)
    expect(doors).toHaveLength(0)
    expect(tensions).toHaveLength(0)
  })
})

describe('an edge drawn nowhere', () => {
  it('shows as a line between the two centroids', () => {
    const standing = [room('a', 0, 0, 4, 4), room('b', 10, 0, 4, 4)]
    const { doors, tensions } = edgeMarks(standing, [edge('e1', 'a', 'b')], plot)
    expect(doors).toHaveLength(0)
    expect(tensions).toHaveLength(1)
    expect(tensions[0]?.from).toEqual([2, 2])
    expect(tensions[0]?.to).toEqual([12, 2])
    expect(tensions[0]?.kind).toBe('door')
  })

  it('shows for rooms that meet at a corner only', () => {
    const standing = [room('a', 0, 0, 4, 4), room('b', 4, 4, 4, 4)]
    expect(edgeMarks(standing, [edge('e1', 'a', 'b')], plot).tensions).toHaveLength(1)
  })
})

describe('a door proposed on a wall', () => {
  it('offers one where two 5 by 4 rooms side by side share a 4 m wall', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    const marks = proposalsFrom(wallPairs(standing), [], 0)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toEqual({ a: 'a', b: 'b', at: [5, 2] })
  })

  it('offers none where an edge already crosses that wall', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4)]
    expect(proposalsFrom(wallPairs(standing), [edge('e1', 'b', 'a')], 0)).toHaveLength(0)
  })

  it('offers none across a wall shorter than a door', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 3.4, 5, 4)]
    expect(proposalsFrom(wallPairs(standing), [], 0)).toHaveLength(0)
  })

  it('offers none where the rooms stand apart', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 6, 0, 5, 4)]
    expect(proposalsFrom(wallPairs(standing), [], 0)).toHaveLength(0)
  })

  it('reads the wall a turned room really shows, not the wall it was drawn with', () => {
    const turned: Footprint = {
      polygon: rectangleToPolygon({ left: 5, top: -1, width: 2, depth: 4 }),
      rotation: 90,
    }
    const standing: Standing[] = [room('a', 0, 0, 4, 2), { id: 'b', outline: outlineOf(turned) }]
    const marks = proposalsFrom(wallPairs(standing), [], 0)
    expect(marks).toHaveLength(1)
    expect(marks[0]?.at?.[0]).toBeCloseTo(4, 9)
  })
})

describe('the walls a storey holds in common', () => {
  it('gives one pair with the longest run two rooms share', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 0, 5, 4), room('c', 12, 0, 5, 4)]
    const pairs = wallPairs(standing)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.a).toBe('a')
    expect(pairs[0]?.b).toBe('b')
    expect(pairs[0]?.wall).toEqual({ from: [5, 0], to: [5, 4] })
    // Both rooms reach five metres back from that wall, which is what a handle on it may not swamp.
    expect(pairs[0]?.across).toBeCloseTo(5, 9)
  })

  it('gives a pair on a wall too short for a door, which a proposal passes over', () => {
    const standing = [room('a', 0, 0, 5, 4), room('b', 5, 3.4, 5, 4)]
    expect(wallPairs(standing)).toHaveLength(1)
    expect(proposalsFrom(wallPairs(standing), [], 0)).toHaveLength(0)
  })
})

describe('the sides of the plot that face a street', () => {
  it('reads the marked sides', () => {
    expect(streetSides(plot)).toEqual([
      [
        [20, 25],
        [0, 25],
      ],
    ])
  })

  it('reads every side where none is marked, so a front door still has somewhere to go', () => {
    expect(streetSides({ ...plot, street: [] })).toHaveLength(4)
  })

  it('reads none where there is no plot', () => {
    expect(streetSides({ ...plot, polygon: [] })).toEqual([])
  })
})
