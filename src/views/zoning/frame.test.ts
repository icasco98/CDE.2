import { describe, expect, it } from 'vitest'
import { rectangleToPolygon } from '../../geometry'
import { extentOf, pointsOf, viewBoxOf } from './frame'

const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

describe('the sheet extent', () => {
  it('leaves air around the plot on every side', () => {
    expect(extentOf(plot, [])).toEqual({ minX: -2.5, minY: -2.5, width: 25, height: 30 })
  })

  it('widens to hold a room standing outside the plot', () => {
    const stray = rectangleToPolygon({ left: 22, top: 0, width: 4, depth: 4 })
    expect(extentOf(plot, [stray]).width).toBe(31)
  })

  it('falls back to a plot-sized sheet where there is nothing to draw', () => {
    expect(extentOf([], [])).toEqual({ minX: -2.5, minY: -2.5, width: 25, height: 30 })
  })

  it('reads out as a viewBox in metres', () => {
    expect(viewBoxOf(extentOf(plot, []))).toBe('-2.5 -2.5 25 30')
  })
})

describe('points for an SVG polygon', () => {
  it('writes each corner to the millimetre', () => {
    expect(
      pointsOf([
        [0, 0],
        [1.23456, 2],
      ]),
    ).toBe('0.000,0.000 1.235,2.000')
  })
})
