import { describe, expect, it } from 'vitest'
import { rectangleToPolygon } from '../../geometry'
import { project } from '../../massing'
import { extentOf, groundOf, northOf, orbitBy, viewBoxOf } from './frame'

const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

describe('the frame round the drawing', () => {
  it('holds every projected corner, with air round it', () => {
    const view = { azimuth: 45 }
    const extent = extentOf(groundOf(plot), view)
    for (const corner of groundOf(plot)) {
      const [u, v] = project(corner, view)
      expect(u).toBeGreaterThan(extent.minU)
      expect(u).toBeLessThan(extent.minU + extent.width)
      expect(v).toBeGreaterThan(extent.minV)
      expect(v).toBeLessThan(extent.minV + extent.height)
    }
  })

  it('falls back on a square when there is nothing to frame', () => {
    expect(viewBoxOf(extentOf([], { azimuth: 0 }))).toBe('-10 -10 20 20')
  })
})

describe('the orbit', () => {
  it('turns with the drag and stays inside one turn', () => {
    expect(orbitBy(45, 0)).toBe(45)
    expect(orbitBy(45, 100)).toBeCloseTo(90, 9)
    expect(orbitBy(0, -100)).toBeGreaterThan(300)
    expect(orbitBy(350, 1000)).toBeLessThan(360)
  })
})

describe('north on the sheet', () => {
  it('points up when the plot north is zero, and east at ninety', () => {
    expect(northOf(0)[0]).toBeCloseTo(0, 9)
    expect(northOf(0)[1]).toBeCloseTo(-1, 9)
    expect(northOf(90)[0]).toBeCloseTo(1, 9)
    expect(northOf(90)[1]).toBeCloseTo(0, 9)
  })
})
