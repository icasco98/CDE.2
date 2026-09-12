import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { area, type Polygon } from '../geometry'
import { buildableArea, buildableAreaOf, LARGE_PLOT_M2, SETBACKS } from './setbacks'

const markdown = readFileSync(
  new URL('../../rulebook/municipality-private-housing.md', import.meta.url),
  'utf8',
)

/** The corners of a polygon as a set of strings, so a ring read from any corner compares equal. */
function corners(polygon: Polygon): string[] {
  return polygon.map((p) => `${Math.round(p[0] * 1000) / 1000},${Math.round(p[1] * 1000) / 1000}`)
}

describe('the setbacks in code match the ones a person reads', () => {
  it('states both bands as the Municipality section states them', () => {
    const section = markdown.slice(markdown.indexOf('## Setbacks'), markdown.indexOf('## Heights'))
    expect(section).toContain(`Plots under ${LARGE_PLOT_M2} m²`)
    expect(section).toContain(
      `at least ${SETBACKS.small.street} m from the boundary on the service`,
    )
    expect(section).toContain(`At least ${SETBACKS.small.other} m from every other boundary`)
    expect(section).toContain(
      `At least ${SETBACKS.large.street} m from the service-street boundary`,
    )
    expect(section).toContain(`At least ${SETBACKS.large.other} m from every other boundary`)
  })
})

describe('the buildable area of a plot', () => {
  it('insets a rectangle by 2 m on its street side and 1.5 m on the others', () => {
    const plot = {
      polygon: [
        [0, 0],
        [20, 0],
        [20, 25],
        [0, 25],
      ] as Polygon,
      street: [2],
    }
    expect(corners(buildableArea(plot)).sort()).toEqual(
      ['1.5,1.5', '18.5,1.5', '18.5,23', '1.5,23'].sort(),
    )
    expect(buildableAreaOf(plot)).toBeCloseTo(365.5, 6)
  })

  it('takes the deeper band on a plot of 750 m² and above', () => {
    const plot = {
      polygon: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
      ] as Polygon,
      street: [2],
    }
    expect(area(plot.polygon)).toBeGreaterThanOrEqual(LARGE_PLOT_M2)
    // 26 m across between the 2 m flanks, 25 m deep between 2 m and the 3 m service street.
    expect(buildableAreaOf(plot)).toBeCloseTo(650, 6)
  })

  it('follows an L round its reflex corner, which the offset puts outward', () => {
    const plot = {
      polygon: [
        [0, 0],
        [20, 0],
        [20, 10],
        [10, 10],
        [10, 20],
        [0, 20],
      ] as Polygon,
      street: [0],
    }
    expect(corners(buildableArea(plot)).sort()).toEqual(
      ['1.5,2', '18.5,2', '18.5,8.5', '8.5,8.5', '8.5,18.5', '1.5,18.5'].sort(),
    )
    expect(buildableAreaOf(plot)).toBeCloseTo(180.5, 6)
  })

  it('takes the street band on both frontages of a corner plot', () => {
    const plot = {
      polygon: [
        [0, 0],
        [20, 0],
        [20, 25],
        [0, 25],
      ] as Polygon,
      street: [0, 3],
    }
    expect(corners(buildableArea(plot)).sort()).toEqual(
      ['2,2', '18.5,2', '18.5,23.5', '2,23.5'].sort(),
    )
    expect(buildableAreaOf(plot)).toBeCloseTo(16.5 * 21.5, 6)
  })

  it('leaves nothing on a plot the setbacks swallow whole', () => {
    const plot = {
      polygon: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ] as Polygon,
      street: [2],
    }
    expect(buildableArea(plot)).toEqual([])
    expect(buildableAreaOf(plot)).toBe(0)
  })
})
