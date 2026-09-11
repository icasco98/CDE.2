import { describe, expect, it } from 'vitest'
import { bandDrop } from './bands'

/** Two storeys twelve metres deep: First runs 0 to 12 down the sheet, Ground 12 to 24. */
const STOREYS = 2
const HEIGHT = 12

const room = { storey: 0, storeysSpanned: 1 }
const upstairs = { storey: 1, storeysSpanned: 1 }
const stair = { storey: 0, storeysSpanned: 2 }

describe('a bubble let go in a band', () => {
  it('stays where it is when the band is its own', () => {
    expect(bandDrop({ x: 3, y: 18 }, room, STOREYS, HEIGHT)).toEqual({ storey: 0, y: 18 })
  })

  it('takes the other storey from the middle of its band', () => {
    expect(bandDrop({ x: 3, y: 6 }, room, STOREYS, HEIGHT)).toEqual({ storey: 1, y: 6 })
    expect(bandDrop({ x: 3, y: 1.3 }, room, STOREYS, HEIGHT).storey).toBe(1)
    expect(bandDrop({ x: 3, y: 10.7 }, room, STOREYS, HEIGHT).storey).toBe(1)
  })

  it('goes back to its own band from the tenth at either edge', () => {
    const high = bandDrop({ x: 3, y: 0.5 }, room, STOREYS, HEIGHT)
    expect(high).toEqual({ storey: 0, y: 13.2, refused: 'edge' })
    const low = bandDrop({ x: 3, y: 11.5 }, room, STOREYS, HEIGHT)
    expect(low).toEqual({ storey: 0, y: 13.2, refused: 'edge' })
  })

  it('comes back down as well as up', () => {
    expect(bandDrop({ x: 3, y: 18 }, upstairs, STOREYS, HEIGHT)).toEqual({ storey: 0, y: 18 })
    expect(bandDrop({ x: 3, y: 12.5 }, upstairs, STOREYS, HEIGHT)).toEqual({
      storey: 1,
      y: 10.8,
      refused: 'edge',
    })
  })

  it('holds a bubble dragged off the top of the sheet in its own band', () => {
    expect(bandDrop({ x: 3, y: -40 }, room, STOREYS, HEIGHT)).toEqual({
      storey: 0,
      y: 13.2,
      refused: 'edge',
    })
  })

  it('lets a stair be moved about inside the band its lowest twin stands in', () => {
    expect(bandDrop({ x: 3, y: 18 }, stair, STOREYS, HEIGHT)).toEqual({ storey: 0, y: 18 })
  })

  it('refuses a stair let go in a band it does not stand on, and puts it back', () => {
    // Its upper twin is one band above its stored place, so a drop in First would carry that one
    // off the top of the sheet: the whole room goes back into the Ground band instead.
    expect(bandDrop({ x: 3, y: 6 }, stair, STOREYS, HEIGHT)).toEqual({
      storey: 0,
      y: 13.2,
      refused: 'stair',
    })
    const below = bandDrop({ x: 3, y: 30 }, stair, STOREYS, HEIGHT)
    expect(below).toEqual({ storey: 0, y: 22.8, refused: 'stair' })
  })

  it('reads a stair on the first storey against the first band, not the ground', () => {
    const upper = { storey: 1, storeysSpanned: 2 }
    expect(bandDrop({ x: 3, y: 18 }, upper, 3, HEIGHT)).toEqual({ storey: 1, y: 18 })
    expect(bandDrop({ x: 3, y: 30 }, upper, 3, HEIGHT)).toEqual({
      storey: 1,
      y: 22.8,
      refused: 'stair',
    })
  })
})
