import { describe, expect, it } from 'vitest'
import { keyFor, radiusFor, scaleFor } from './sizes'

/** A 60 m² diwaniya, a 15 m² bedroom and a 2 m² store: the reference case, worked on paper. */
const scale = scaleFor([60, 15, 2])

describe('a bubble drawn at an area in proportion to its room', () => {
  it('gives the largest room the largest radius, 52', () => {
    expect(radiusFor(60, scale)).toBeCloseTo(52, 12)
  })

  it('draws a room of a quarter the area at exactly half the radius', () => {
    expect(radiusFor(60, scale) / radiusFor(15, scale)).toBeCloseTo(2, 12)
    expect(radiusFor(15, scale)).toBeCloseTo(26, 12)
  })

  it('holds a room too small to press to the minimum, 13', () => {
    // 52 × √(2/60) is 9.49, under the minimum.
    expect(radiusFor(2, scale)).toBe(13)
  })

  it('keys the legend with 20 m², the largest round area under half the largest room', () => {
    const key = keyFor(scale)
    expect(key.area).toBe(20)
    // 52 × √(20/60) = 30.02.
    expect(key.r).toBeCloseTo(30.022, 3)
  })

  it('takes a smaller round area when the key would be drawn larger than the legend holds', () => {
    // 20 m² has a radius of 30.02; held to 22 the key falls to 10 m², 52 × √(10/60) = 21.2, and
    // held to 20 to 5 m², 15.01.
    expect(keyFor(scale, 20).area).toBe(5)
    expect(keyFor(scale, 22).area).toBe(10)
  })

  it('scales to the largest room whatever it is, so the largest circle always fits its cell', () => {
    expect(radiusFor(300, scaleFor([300, 12]))).toBeCloseTo(52, 12)
    expect(keyFor(scaleFor([300, 12])).area).toBe(100)
  })
})
