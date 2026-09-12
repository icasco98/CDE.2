import { describe, expect, it } from 'vitest'
import {
  depthOf,
  ELEVATION_DEG,
  PLAN_ELEVATION_DEG,
  presets,
  project,
  unproject,
  type Point3,
  type View,
} from './projection'

const ne: View = { azimuth: 45, elevation: ELEVATION_DEG }

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

describe('the projection read backwards onto a floor', () => {
  /** Every quarter of the turn and every tilt the orbit admits, the ends of it included. */
  const views: readonly View[] = [10, 30, 55, 89].flatMap((elevation) =>
    [0, 45, 137, 225, 359].map((azimuth): View => ({ azimuth, elevation })),
  )

  it('gives back the point the projection was taken from, at every view and floor', () => {
    for (const view of views) {
      for (const z of [0, 3.5, 7]) {
        for (const at of [
          [0, 0],
          [4.25, 11.75],
          [-6, 19],
        ] as const) {
          const back = unproject(project([at[0], at[1], z], view), view, z)
          expect(back[0]).toBeCloseTo(at[0], 9)
          expect(back[1]).toBeCloseTo(at[1], 9)
        }
      }
    }
  })

  it('reads a drag across the screen as a slide along the floor it was taken on', () => {
    const view: View = { azimuth: 45, elevation: ELEVATION_DEG }
    const from = project([6, 6, 3.5], view)
    const moved = unproject([from[0] + 1, from[1]], view, 3.5)
    // One metre to the viewer's right at this azimuth runs equally into x and into y.
    expect(moved[0] - 6).toBeCloseTo(Math.cos(Math.PI / 4), 9)
    expect(moved[1] - 6).toBeCloseTo(Math.sin(Math.PI / 4), 9)
  })

  it('reads a floor at the top of the house as one at the bottom, given its height', () => {
    const view: View = { azimuth: 200, elevation: PLAN_ELEVATION_DEG }
    const ground = unproject(project([3, 9, 0], view), view, 0)
    const upstairs = unproject(project([3, 9, 3.5], view), view, 3.5)
    expect(upstairs[0]).toBeCloseTo(ground[0], 9)
    expect(upstairs[1]).toBeCloseTo(ground[1], 9)
  })
})
