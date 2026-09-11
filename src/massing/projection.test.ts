import { describe, expect, it } from 'vitest'
import { depthOf, presets, project, type Point3, type View } from './projection'

const ne: View = { azimuth: 45 }

describe('a parallel projection seen from the north-east', () => {
  it('draws the corner nearest the viewer lowest and the far corner highest', () => {
    const near = project([10, 0, 0], ne)
    const far = project([0, 10, 0], ne)
    expect(near[1]).toBeGreaterThan(far[1])
    expect(near[0]).toBeCloseTo(far[0], 9)
  })

  it('draws a height straight up the screen, foreshortened by the 30° elevation', () => {
    const ground = project([4, 6, 0], ne)
    const above = project([4, 6, 3.5], ne)
    expect(above[0]).toBeCloseTo(ground[0], 9)
    expect(ground[1] - above[1]).toBeCloseTo(3.5 * Math.cos(Math.PI / 6), 9)
  })

  it('keeps parallel lines parallel and lengths on one axis equal', () => {
    const a = project([0, 0, 0], ne)
    const b = project([5, 0, 0], ne)
    const c = project([0, 7, 0], ne)
    const d = project([5, 7, 0], ne)
    expect(b[0] - a[0]).toBeCloseTo(d[0] - c[0], 9)
    expect(b[1] - a[1]).toBeCloseTo(d[1] - c[1], 9)
  })
})

describe('depth', () => {
  it('puts the corner nearest the viewer lowest and the far corner highest, at every preset', () => {
    const corners: readonly Point3[] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ]
    // The corners run north-west, north-east, south-east, south-west; the presets run NE, SE, SW, NW.
    const nearest = [1, 2, 3, 0]
    presets.forEach((preset, at) => {
      const depths = corners.map((corner) => depthOf(corner, preset))
      const closest = depths.indexOf(Math.min(...depths))
      expect([preset.id, closest]).toEqual([preset.id, nearest[at]])
    })
  })

  it('reads a point higher up as nearer, because the viewer stands above the ground', () => {
    expect(depthOf([0, 0, 3], ne)).toBeLessThan(depthOf([0, 0, 0], ne))
  })
})
