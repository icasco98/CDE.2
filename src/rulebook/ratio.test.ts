import { describe, expect, it } from 'vitest'
import { allowedFloorArea } from './ratio'

describe('the Municipality building ratio', () => {
  it('allows the known house 960 m² on its 400 m² plot', () => {
    expect(allowedFloorArea(400)).toBeCloseTo(960, 6)
  })

  it('reads the three rows of the table', () => {
    expect([300, 400, 500, 750].map(allowedFloorArea)).toEqual([800, 960, 1050, 1575])
  })

  it('takes the row a plot falls in at each edge', () => {
    expect(allowedFloorArea(349)).toBe(800)
    expect(allowedFloorArea(350)).toBeCloseTo(855, 6)
    expect(allowedFloorArea(401)).toBeCloseTo(842.1, 6)
  })

  it('gives a plot under the smallest row the general 210% and no concession', () => {
    expect(allowedFloorArea(224)).toBeCloseTo(470.4, 6)
    expect(allowedFloorArea(0)).toBe(0)
  })
})
