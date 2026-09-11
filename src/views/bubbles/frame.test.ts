import { describe, expect, it } from 'vitest'
import type { Body } from '../../bubbles'
import { extentOf, holds } from './frame'

function body(id: string, x: number, y: number, radius = 2): Body {
  return { id, x, y, vx: 0, vy: 0, radius, storey: 0, storeysSpanned: 1, pinned: false }
}

describe('the frame the sheet is drawn in', () => {
  it('holds a picture that has stayed inside it', () => {
    const frame = extentOf([body('a', 0, 6)], 1, 12)
    expect(holds(frame, extentOf([body('a', 1, 7)], 1, 12))).toBe(true)
  })

  it('does not hold a bubble that has gone outside it', () => {
    const frame = extentOf([body('a', 0, 6)], 1, 12)
    expect(holds(frame, extentOf([body('a', 40, 6)], 1, 12))).toBe(false)
    expect(holds(frame, extentOf([body('a', 0, -40)], 1, 12))).toBe(false)
  })
})
