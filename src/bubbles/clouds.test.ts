import { describe, expect, it } from 'vitest'
import type { Spot } from './arrange'
import { cloudsOf } from './clouds'

const spot = (id: string, x: number, y = 100, r = 20, storey = 0): Spot => ({ id, storey, x, y, r })

/** The extent of a cloud's path, from the points it is drawn through. */
function extentOf(path: string) {
  const numbers = (path.match(/-?[\d.]+/g) ?? []).map(Number)
  const xs = numbers.filter((_, index) => index % 2 === 0)
  const ys = numbers.filter((_, index) => index % 2 === 1)
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys) }
}

describe('a cloud behind each category on a storey', () => {
  it('rounds a room alone with a cloud 12 wider than its circle', () => {
    const [cloud] = cloudsOf([spot('wc', 200)], () => 'service')
    // A radius of 20 grown by the margin of 12: the top of the cloud at 100 − 32, its name there.
    expect(cloud?.label).toEqual({ x: 200, y: 68 })
    const extent = extentOf(cloud!.path)
    expect(extent.left).toBeCloseTo(168, 0)
    expect(extent.right).toBeCloseTo(232, 0)
  })

  it('draws one cloud round neighbours in a row and a cloud each for rooms far apart', () => {
    const near = cloudsOf([spot('a', 100), spot('b', 220)], () => 'private')
    expect(near).toHaveLength(1)
    expect(extentOf(near[0]!.path).left).toBeCloseTo(68, 0)
    expect(extentOf(near[0]!.path).right).toBeCloseTo(252, 0)
    expect(cloudsOf([spot('a', 100), spot('b', 400)], () => 'private')).toHaveLength(2)
  })

  it('keeps categories and storeys apart, and leaves a room of no category out', () => {
    const circles = [spot('bed', 100), spot('kitchen', 200), spot('up', 100, 100, 20, 1)]
    const category = (id: string) => ({ bed: 'private', kitchen: 'service' })[id]
    const upstairs = (id: string) => category(id) ?? 'private'
    expect(cloudsOf(circles, category).map((cloud) => cloud.category)).toEqual([
      'private',
      'service',
    ])
    expect(cloudsOf(circles, upstairs).map((cloud) => [cloud.category, cloud.storey])).toEqual([
      ['private', 0],
      ['service', 0],
      ['private', 1],
    ])
  })

  it('draws the same clouds twice', () => {
    const circles = [spot('a', 100), spot('b', 220), spot('c', 400, 250, 35)]
    expect(cloudsOf(circles, () => 'shared')).toEqual(cloudsOf(circles, () => 'shared'))
  })
})
