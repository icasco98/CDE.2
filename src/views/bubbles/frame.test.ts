import { describe, expect, it } from 'vitest'
import type { Body } from '../../bubbles'
import { rectangleToPolygon } from '../../geometry'
import {
  bodyAt,
  extentOf,
  holds,
  labelSize,
  nameFits,
  nearestOutside,
  shortMark,
} from './frame'

const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

function body(id: string, x: number, y: number, radius = 2, storeysSpanned = 1): Body {
  return { id, x, y, vx: 0, vy: 0, radius, storey: 0, storeysSpanned, pinned: false }
}

describe('the frame the sheet is drawn in', () => {
  it('frames the plot, whatever the bubbles on it are doing', () => {
    expect(extentOf(plot, [body('a', 10, 12)])).toEqual(extentOf(plot, []))
  })

  it('holds a picture that has stayed inside it', () => {
    const frame = extentOf(plot, [body('a', 10, 12)])
    expect(holds(frame, extentOf(plot, [body('a', 11, 13)]))).toBe(true)
  })

  it('does not hold a bubble that has gone off the plot', () => {
    const frame = extentOf(plot, [body('a', 10, 12)])
    expect(holds(frame, extentOf(plot, [body('a', 40, 12)]))).toBe(false)
    expect(holds(frame, extentOf(plot, [body('a', 10, -40)]))).toBe(false)
  })
})

describe('what the pointer is over', () => {
  const bodies = [body('kitchen', 5, 5), body('stair', 15, 15, 2, 2)]

  it('finds a bubble on the storey being worked on', () => {
    expect(bodyAt(bodies, { x: 5.5, y: 5 }, 0)?.id).toBe('kitchen')
    expect(bodyAt(bodies, { x: 5.5, y: 5 }, 1)).toBeUndefined()
  })

  it('finds a stair on every storey it reaches, and nothing where there is nothing', () => {
    expect(bodyAt(bodies, { x: 15, y: 15 }, 1)?.id).toBe('stair')
    expect(bodyAt(bodies, { x: 15, y: 15 }, 0)?.id).toBe('stair')
    expect(bodyAt(bodies, { x: 0, y: 0 }, 0)).toBeUndefined()
  })
})

describe('where a link to the outside leaves the plot', () => {
  it('goes to the nearest street side when the plot has one', () => {
    expect(nearestOutside(plot, [2], { x: 4, y: 10 })).toEqual([4, 25])
  })

  it('goes to the nearest side of all when no side faces a street', () => {
    expect(nearestOutside(plot, [], { x: 4, y: 10 })).toEqual([0, 10])
  })
})

describe('a name inside its own bubble', () => {
  it('fits a short name in a large bubble and not a long one in a small bubble', () => {
    expect(nameFits('Kitchen', 3, 0.03)).toBe(true)
    expect(nameFits('Master Bedroom', 0.9, 0.03)).toBe(false)
  })

  it('fits the same name once the sheet is drawn closer', () => {
    expect(nameFits('Guest WC', 1.4, 0.05)).toBe(false)
    expect(nameFits('Guest WC', 1.4, 0.01)).toBe(true)
  })

  it('shrinks a label with its bubble, between a whole metre and half of one', () => {
    expect(labelSize(4)).toBe(1.15)
    expect(labelSize(2)).toBeCloseTo(0.84, 9)
    expect(labelSize(0.5)).toBe(0.55)
  })

  it('gives the initials of a name of several words, and the first letters of one', () => {
    expect(shortMark('Master Bedroom')).toBe('MB')
    expect(shortMark('Kitchen')).toBe('Kit')
    expect(shortMark('Women’s Reception Room')).toBe('WRR')
  })
})
