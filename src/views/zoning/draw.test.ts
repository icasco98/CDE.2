import { describe, expect, it } from 'vitest'
import { area, exactArea, outlineOf, type Footprint, type Point } from '../../geometry'
import {
  addedVertex,
  circleFootprint,
  closedFootprint,
  closesAt,
  drawnPolygon,
  movedVertex,
  removedVertex,
  selfIntersects,
  snapRadius,
  type Corner,
} from './draw'

const square: readonly Corner[] = [{ at: [0, 0] }, { at: [4, 0] }, { at: [4, 3] }, { at: [0, 3] }]

describe('the shape the hand walks', () => {
  it('makes a polygon of the corners put down, with no arcs to remember', () => {
    const { polygon, arcs } = drawnPolygon(square)
    expect(polygon).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ])
    expect(arcs).toEqual([])
  })

  it('opens a bowed wall into a run of vertices and remembers the arc it stands for', () => {
    const bowed: readonly Corner[] = [
      { at: [0, 0] },
      { at: [4, 0] },
      { at: [4, 3], through: [5.5, 1.5] },
      { at: [0, 3] },
    ]
    const { polygon, arcs } = drawnPolygon(bowed)
    expect(arcs).toHaveLength(1)
    const arc = arcs[0]
    expect(arc?.from).toBe(1)
    expect(arc?.radius).toBeCloseTo(1.5, 9)
    expect(arc?.centre[0]).toBeCloseTo(4, 9)
    expect(arc?.centre[1]).toBeCloseTo(1.5, 9)
    expect(arc?.to).toBe(polygon.length - 2)
    // The bulge is outside the straight wall, so the room measures more than the polygon of it.
    const footprint: Footprint = { polygon, rotation: 0, arcs }
    expect(exactArea(footprint)).toBeGreaterThan(area(polygon))
    expect(exactArea(footprint)).toBeCloseTo(12 + (Math.PI * 1.5 * 1.5) / 2, 6)
  })

  it('runs a wall straight where the three points stand on a line', () => {
    const flat: readonly Corner[] = [
      { at: [0, 0] },
      { at: [4, 0], through: [2, 0] },
      { at: [0, 3] },
    ]
    expect(drawnPolygon(flat).arcs).toEqual([])
  })
})

describe('what the tool refuses', () => {
  it('refuses a shape whose walls cross one another', () => {
    const bowtie: readonly Corner[] = [
      { at: [0, 0] },
      { at: [4, 4] },
      { at: [4, 0] },
      { at: [0, 4] },
    ]
    expect(selfIntersects(drawnPolygon(bowtie).polygon)).toBe(true)
    expect(closedFootprint(bowtie)).toEqual({ ok: false, reason: 'its walls cross one another' })
  })

  it('refuses a shape under a square metre', () => {
    const small: readonly Corner[] = [{ at: [0, 0] }, { at: [1, 0] }, { at: [1, 0.5] }]
    expect(closedFootprint(small)).toMatchObject({ ok: false })
  })

  it('refuses fewer than three corners', () => {
    expect(closedFootprint([{ at: [0, 0] }, { at: [4, 0] }])).toMatchObject({ ok: false })
  })

  it('takes a shape that holds a room', () => {
    const drawn = closedFootprint(square)
    expect(drawn.ok && exactArea(drawn.footprint)).toBe(12)
  })
})

describe('the circle tool', () => {
  it('lands the radius on quarter metres and never under one step', () => {
    expect(snapRadius(2.44)).toBe(2.5)
    expect(snapRadius(0.01)).toBe(0.25)
  })

  it('writes a circle as one arc running the whole way round', () => {
    const footprint = circleFootprint([10, 12], 2.5)
    expect(footprint.arcs).toEqual([
      { from: 0, to: 0, centre: [10, 12], radius: 2.5, clockwise: true },
    ])
    expect(exactArea(footprint)).toBeCloseTo(Math.PI * 6.25, 9)
    expect(footprint.polygon.length).toBeGreaterThanOrEqual(48)
  })
})

describe('editing the points of a room', () => {
  const bowed = closedFootprint([
    { at: [0, 0] },
    { at: [4, 0] },
    { at: [4, 3], through: [5.5, 1.5] },
    { at: [0, 3] },
  ])
  const curved: Footprint = bowed.ok ? bowed.footprint : { polygon: [], rotation: 0 }

  it('takes a point to where the hand put it, on the grid', () => {
    const straight: Footprint = {
      polygon: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      rotation: 0,
    }
    const moved = movedVertex(straight, 1, [5.1, -0.9])
    expect(outlineOf(moved)[1]).toEqual([5, -1])
  })

  it('makes a curve straight when a point on it is moved', () => {
    expect(curved.arcs).toHaveLength(1)
    expect(movedVertex(curved, 2, [6, 1.5]).arcs).toBeUndefined()
  })

  it('leaves a curve alone when a point away from it is moved', () => {
    const arc = curved.arcs?.[0]
    const moved = movedVertex(curved, 0, [-1, 0])
    expect(moved.arcs).toHaveLength(1)
    expect(moved.arcs?.[0]?.radius).toBeCloseTo(arc?.radius ?? 0, 9)
  })

  it('puts a point in at the middle of a wall and keeps the curve past it', () => {
    const grown = addedVertex(curved, curved.polygon.length - 1)
    expect(grown.polygon).toHaveLength(curved.polygon.length + 1)
    expect(grown.arcs).toHaveLength(1)
    expect(grown.arcs?.[0]?.from).toBe(curved.arcs?.[0]?.from)
  })

  it('takes a point out and shifts the curve behind it back one', () => {
    const fewer = removedVertex(curved, 0)
    expect(fewer?.polygon).toHaveLength(curved.polygon.length - 1)
    expect(fewer?.arcs?.[0]?.from).toBe((curved.arcs?.[0]?.from ?? 1) - 1)
  })

  it('never leaves a room with fewer than three points', () => {
    const triangle: Footprint = {
      polygon: [
        [0, 0],
        [4, 0],
        [0, 3],
      ],
      rotation: 0,
    }
    expect(removedVertex(triangle, 0)).toBeNull()
  })
})

describe('closing the shape', () => {
  it('closes on a click near the first corner once three corners are down', () => {
    expect(closesAt(square.slice(0, 3), [0.2, 0.2] as Point)).toBe(true)
    expect(closesAt(square.slice(0, 2), [0, 0] as Point)).toBe(false)
    expect(closesAt(square.slice(0, 3), [2, 2] as Point)).toBe(false)
  })
})

describe('a curve that an edit does not touch', () => {
  const bowed = closedFootprint([
    { at: [0, 0] },
    { at: [4, 0], through: [2, -1.5] },
    { at: [4, 3] },
    { at: [0, 3] },
  ])
  const curved: Footprint = bowed.ok ? bowed.footprint : { polygon: [], rotation: 0 }

  it('stays when a point is put in on the straight wall the curve ends at', () => {
    const last = curved.arcs?.[0]?.to ?? 0
    const grown = addedVertex(curved, last)
    expect(grown.arcs?.[0]?.from).toBe(curved.arcs?.[0]?.from)
    expect(grown.arcs?.[0]?.to).toBe(last)
  })
})
