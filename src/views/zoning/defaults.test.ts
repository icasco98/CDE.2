import { describe, expect, it } from 'vitest'
import { roomTypes, roomTypeById, typicalArea } from '../../rulebook'
import {
  belowMinimum,
  defaultProportion,
  offTarget,
  proportionOf,
  sizesOf,
  startingRectangle,
} from './defaults'

describe('the rectangle a room opens at', () => {
  it('holds a 24 m² room at 1.2 : 1 as 5.5 by 4.5', () => {
    // The sides that hold 24 m² at 1.2 : 1 are 5.37 and 4.47 m. Each goes to the nearest grid
    // line, 5.25 and 4.5, which holds only 23.63 m²; a grid step then goes on the longer side,
    // the smaller of the two additions, for 5.5 by 4.5.
    expect(Math.sqrt(24 * 1.2)).toBeCloseTo(5.37, 2)
    expect(Math.sqrt(24 / 1.2)).toBeCloseTo(4.47, 2)
    expect(5.25 * 4.5).toBeLessThan(24)
    expect(startingRectangle(24, 1.2)).toEqual({ width: 5.5, depth: 4.5 })
    expect(5.5 * 4.5).toBeGreaterThanOrEqual(24)
  })

  it('opens a 3 m² guest WC at its target exactly, not over it', () => {
    // Rounding up every side used to open the smallest rooms already in warning: 2.25 by 1.5 is
    // 3.38 m², an eighth over a 3 m² target.
    const wc = startingRectangle(3, proportionOf(roomTypeById('guest-wc')))
    expect(wc).toEqual({ width: 2, depth: 1.5 })
    expect(wc.width * wc.depth).toBe(3)
    expect(offTarget(wc.width * wc.depth, 3)).toBe(false)
  })

  it('opens every room of the room-type table at its target or over it, and never in warning', () => {
    for (const type of roomTypes) {
      const target = typicalArea(type.id, 500)
      if (target <= 0) continue
      const opened = startingRectangle(target, proportionOf(type))
      const held = opened.width * opened.depth
      expect(held).toBeGreaterThanOrEqual(target - 1e-9)
      expect(offTarget(held, target)).toBe(false)
      expect(opened.width * 4).toBeCloseTo(Math.round(opened.width * 4), 9)
      expect(opened.depth * 4).toBeCloseTo(Math.round(opened.depth * 4), 9)
    }
  })

  it('leaves a side already on the grid where it is', () => {
    expect(startingRectangle(16, 1)).toEqual({ width: 4, depth: 4 })
  })

  it('opens a square where the proportion is one', () => {
    const { width, depth } = startingRectangle(30, 1)
    expect(width).toBe(depth)
  })

  it('reads a proportion of nothing as square rather than dividing by zero', () => {
    expect(startingRectangle(16, 0)).toEqual({ width: 4, depth: 4 })
  })

  it('opens a room smaller than one grid square on the grid all the same', () => {
    expect(startingRectangle(0.01, 1)).toEqual({ width: 0.25, depth: 0.25 })
  })
})

describe('the proportion a kind opens at', () => {
  it('takes the middle of the range the table gives', () => {
    expect(proportionOf(roomTypeById('bedroom'))).toBeCloseTo(1.25, 12)
    expect(proportionOf(roomTypeById('dining-room'))).toBeCloseTo(1.5, 12)
  })

  it('takes the standing proportion where the table leaves it free', () => {
    expect(proportionOf(roomTypeById('hallway'))).toBe(defaultProportion)
    expect(proportionOf(undefined)).toBe(defaultProportion)
  })
})

describe('the sizes a kind is judged against', () => {
  it('reads the smallest area the table admits, and the Municipality width', () => {
    expect(sizesOf(roomTypeById('bedroom'), 500)).toEqual({
      proportion: 1.25,
      minArea: 14,
      minWidth: 3,
    })
  })

  it('reads the plot band where the table sends the size to one', () => {
    expect(sizesOf(roomTypeById('diwaniya'), 500).minArea).toBe(45)
    expect(sizesOf(roomTypeById('diwaniya'), 300).minArea).toBe(35)
  })

  it('carries no minimum for a kind the table gives neither', () => {
    expect(sizesOf(roomTypeById('hallway'), 500)).toEqual({ proportion: 1.25, minWidth: 1.2 })
  })
})

describe('a label that warns', () => {
  it('warns once the area is more than a tenth off target', () => {
    expect(offTarget(22, 24)).toBe(false)
    expect(offTarget(21, 24)).toBe(true)
    expect(offTarget(26, 24)).toBe(false)
    expect(offTarget(27, 24)).toBe(true)
  })

  it('warns under the smallest area the kind admits, whichever way the room is turned', () => {
    const sizes = { proportion: 1.25, minArea: 14 }
    const polygon = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ] as const
    expect(belowMinimum({ polygon, rotation: 0 }, sizes)).toBe(true)
    expect(belowMinimum({ polygon, rotation: 30 }, sizes)).toBe(true)
    expect(belowMinimum({ polygon, rotation: 0 }, { proportion: 1.25, minArea: 10 })).toBe(false)
  })

  it('warns under the Municipality width for the kind', () => {
    const narrow = {
      polygon: [
        [0, 0],
        [8, 0],
        [8, 2],
        [0, 2],
      ] as const,
      rotation: 45,
    }
    expect(belowMinimum(narrow, { proportion: 1.25, minWidth: 3 })).toBe(true)
    expect(belowMinimum(narrow, { proportion: 1.25, minWidth: 1.75 })).toBe(false)
    expect(belowMinimum(narrow, { proportion: 1.25 })).toBe(false)
  })
})
