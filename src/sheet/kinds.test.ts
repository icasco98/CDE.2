import { describe, expect, it } from 'vitest'
import { DOOR, KINDS, KIND_LABEL, hasHinge, hasSwing, isStreetDoor, repair, sizeFor } from './kinds'
import { fixtureSheet } from './fixture'
import { DEFAULTS, isOpen, type Room } from './model'
import { areaOf, r2 } from './geometry'

describe('the kinds', () => {
  it('gives every kind a category and a name on the sheet', () => {
    expect(KINDS['diwaniya']!.cat).toBe('reception')
    expect(KIND_LABEL['diwaniya']).toBe('Diwaniya')
    expect(KIND_LABEL['hallway']).toBe('Hallway')
  })

  it('sizes a room from its target: the width on the quarter metre, the depth exact', () => {
    expect(sizeFor('diwaniya', 60, DEFAULTS)).toEqual({ w: 9.5, h: 6.32 })
    expect(r2(9.5 * 6.32)).toBe(60.04)
    expect(sizeFor('hallway', 24, DEFAULTS)).toEqual({ w: 1.8, h: 13.33 })
  })

  it('knows a street door, a hinge and a swing', () => {
    const d = {
      id: 'd',
      edge: 'e',
      to: 'EXTERIOR',
      type: 'street' as const,
      w: 1.2,
      at: [0, 0] as [number, number],
      flip: false,
      hinge: false,
    }
    expect(isStreetDoor(d)).toBe(true)
    expect(hasHinge(d)).toBe(true)
    expect(hasSwing({ ...d, type: 'sliding' })).toBe(false)
    expect(DOOR.door.w).toBe(0.9)
    expect(DOOR.street2.label).toBe('Double street door')
  })
})

describe('the sample sheet', () => {
  it('is the owner’s 12:38 sheet: 18 rooms, 17 of them placed', () => {
    const sheet = fixtureSheet()
    expect(sheet.rooms.length).toBe(18)
    expect(sheet.rooms.filter((r) => r.placed).length).toBe(17)
    expect(sheet.storeyCount).toBe(2)
    expect(sheet.rooms.find((r) => r.id === 'r2')!.angle).toBe(25)
    expect(sheet.rooms.filter((r) => isOpen(r)).length).toBe(0)
  })

  it('puts a room saved in pieces back together', () => {
    const pieced: Room = {
      id: 'a',
      name: 'A',
      kind: 'room',
      cat: 'shared',
      target: 16,
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      angle: 0,
      pieces: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        [
          [0, 0],
          [4, 4],
          [0, 4],
        ],
      ],
      placed: true,
      placedAt: 1,
    }
    const out = repair([pieced], DEFAULTS)[0]!
    expect(out.pieces).toBeNull()
    expect(r2(areaOf(out))).toBe(16)
  })

  it('gives back a room left in so many pieces that it was no room any more', () => {
    const shards: Room = {
      id: 'a',
      name: 'A',
      kind: 'bedroom',
      cat: 'private',
      target: 14,
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      angle: 0,
      pieces: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        [
          [3, 3],
          [4, 3],
          [4, 4],
          [3, 4],
        ],
      ],
      placed: true,
      placedAt: 1,
    }
    const out = repair([shards], DEFAULTS)[0]!
    expect(out.pieces).toBeNull()
    expect([out.w, out.h]).toEqual([4.25, 3.29])
  })
})
