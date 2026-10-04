import { describe, expect, it } from 'vitest'
import { shiftOnScreen } from './onScreen'

describe('a menu kept whole inside the window', () => {
  it('stays where it opened when it fits', () => {
    expect(shiftOnScreen(100, 300, 720)).toBe(0)
  })

  it('opens upward from a point near the bottom: 300 px tall at 600 of 720 ends at 600', () => {
    expect(600 + shiftOnScreen(600, 300, 720)).toBe(300)
  })

  it('moves up only as far as it must when neither side of the point has space', () => {
    expect(200 + shiftOnScreen(200, 500, 600)).toBe(96)
  })

  it('comes in from an edge it was opened past', () => {
    expect(-10 + shiftOnScreen(-10, 200, 1280)).toBe(4)
  })

  it('stands at the margin when it is as tall as the window allows', () => {
    expect(500 + shiftOnScreen(500, 712, 720)).toBe(4)
  })
})
