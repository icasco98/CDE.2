import { describe, expect, it } from 'vitest'
import type { Body } from '../../bubbles'
import { rectangleToPolygon } from '../../geometry'
import { bodyAt, extentOf, holds, labelFor, labelSize, nearestOutside, shortMarks } from './frame'

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
  const said = (radius: number, perPixel: number, name: string, mark = 'X') =>
    labelFor({ name, area: '24 m²' }, mark, radius, perPixel).rows.map((row) => row.text)

  it('says a short name and its area in a large bubble', () => {
    expect(said(3, 0.03, 'Kitchen')).toEqual(['Kitchen', '24 m²'])
  })

  it('says a two-word name whole in a 24 m² bubble at fit zoom', () => {
    // A 24 m² room is 2.76 m across the radius, and about 95 px at a fit on a 20 by 25 plot.
    expect(said(2.76, 0.058, 'Dining Room')).toEqual(['Dining Room', '24 m²'])
  })

  it('breaks a name at its space rather than giving up on it', () => {
    expect(said(2, 0.058, 'Dining Room')).toEqual(['Dining', 'Room', '24 m²'])
  })

  it('falls back on the room mark when neither one line nor two will go', () => {
    expect(said(0.9, 0.03, 'Master Bedroom', 'MB')).toEqual(['MB'])
    expect(labelFor({ name: 'Master Bedroom', area: '24 m²' }, 'MB', 0.9, 0.03).short).toBe(true)
  })

  it('draws the area only when there is room for it under the name', () => {
    expect(said(2.2, 0.04, 'Master Bedroom')).toEqual(['Master Bedroom'])
  })

  it('says the storeys a stair reaches last of all, and only where they fit', () => {
    const rows = labelFor(
      { name: 'Stair', area: '6 m²', span: 'Ground to First' },
      'S',
      3,
      0.02,
    ).rows
    expect(rows.map((row) => row.kind)).toEqual(['name', 'area', 'span'])
  })

  it('shrinks a label with its bubble, between a whole metre and half of one', () => {
    expect(labelSize(4)).toBe(1.15)
    expect(labelSize(2)).toBeCloseTo(0.84, 9)
    expect(labelSize(0.5)).toBe(0.55)
  })

  it('gives one letter a word, and never the same mark to two rooms', () => {
    const marks = shortMarks(['Master Bedroom', 'Kitchen', 'Formal Living', 'Family Living'])
    expect(marks.get('Master Bedroom')).toBe('MB')
    expect(marks.get('Kitchen')).toBe('K')
    expect(marks.get('Formal Living')).toBe('FoL')
    expect(marks.get('Family Living')).toBe('FaL')
  })

  it('keeps taking letters until the clash is gone', () => {
    const marks = shortMarks(['Store', 'Stair', 'Study'])
    expect(new Set(marks.values()).size).toBe(3)
  })
})
