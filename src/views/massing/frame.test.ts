import { describe, expect, it } from 'vitest'
import { rectangleToPolygon } from '../../geometry'
import { ELEVATION_DEG, PLAN_ELEVATION_DEG, project, type View } from '../../massing'
import { fitCamera, viewBoxOf } from '../camera'
import {
  centreOf,
  extentOf,
  frameAbout,
  groundOf,
  northOf,
  orbitBy,
  planAzimuth,
  tiltBy,
} from './frame'

const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })
const corner: View = { azimuth: 45, elevation: ELEVATION_DEG }

describe('the frame round the drawing', () => {
  it('holds every projected corner, with air round it', () => {
    const extent = extentOf(groundOf(plot), corner)
    for (const point of groundOf(plot)) {
      const [u, v] = project(point, corner)
      expect(u).toBeGreaterThan(extent.minX)
      expect(u).toBeLessThan(extent.minX + extent.width)
      expect(v).toBeGreaterThan(extent.minY)
      expect(v).toBeLessThan(extent.minY + extent.height)
    }
  })

  it('falls back on a square when there is nothing to frame', () => {
    const empty = extentOf([], { azimuth: 0, elevation: ELEVATION_DEG })
    expect(viewBoxOf(empty, fitCamera)).toBe('-10 -10 20 20')
  })
})

describe('the orbit', () => {
  it('turns with the drag and stays inside one turn', () => {
    expect(orbitBy(45, 0)).toBe(45)
    expect(orbitBy(45, 100)).toBeCloseTo(90, 9)
    expect(orbitBy(0, -100)).toBeGreaterThan(300)
    expect(orbitBy(350, 1000)).toBeLessThan(360)
  })

  it('tilts with the drag and never leaves the band the viewer may stand in', () => {
    expect(tiltBy(30, 0)).toBe(30)
    expect(tiltBy(30, 100)).toBeCloseTo(75, 9)
    expect(tiltBy(30, 1000)).toBe(PLAN_ELEVATION_DEG)
    expect(tiltBy(30, -1000)).toBe(10)
  })
})

describe('the point a turn is about', () => {
  const pivot = centreOf([
    [4, 6, 0],
    [10, 14, 3.5],
  ])

  it('is the middle of the box the mass stands in', () => {
    expect(pivot).toEqual([7, 10, 1.75])
  })

  it('is drawn in the same place at every azimuth and every elevation', () => {
    const held = extentOf(groundOf(plot), corner)
    const where = project(pivot, corner)
    const anchorX = where[0] - held.minX
    const anchorY = where[1] - held.minY
    for (const elevation of [10, 30, 55, 89]) {
      for (const azimuth of [0, 45, 137, 225, 359]) {
        const now: View = { azimuth, elevation }
        const frame = frameAbout(held, pivot, corner, now)
        const drawn = project(pivot, now)
        expect(drawn[0] - frame.minX).toBeCloseTo(anchorX, 9)
        expect(drawn[1] - frame.minY).toBeCloseTo(anchorY, 9)
        // The frame is slid and never resized, so the mass keeps its size through a turn.
        expect(frame.width).toBe(held.width)
        expect(frame.height).toBe(held.height)
      }
    }
  })
})

describe('north on the sheet', () => {
  it('points up when the plot north is zero, and east at ninety', () => {
    expect(northOf(0)[0]).toBeCloseTo(0, 9)
    expect(northOf(0)[1]).toBeCloseTo(-1, 9)
    expect(northOf(90)[0]).toBeCloseTo(1, 9)
    expect(northOf(90)[1]).toBeCloseTo(0, 9)
  })

  it('is drawn straight up the screen from the azimuth the plan view stands at', () => {
    for (const north of [0, 30, 200, 359]) {
      const view: View = { azimuth: planAzimuth(north), elevation: PLAN_ELEVATION_DEG }
      const way = northOf(north)
      const from = project([0, 0, 0], view)
      const to = project([way[0] * 10, way[1] * 10, 0], view)
      expect(to[0] - from[0]).toBeCloseTo(0, 9)
      expect(to[1] - from[1]).toBeLessThan(0)
    }
  })
})
