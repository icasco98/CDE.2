import { describe, expect, it } from 'vitest'
import {
  DOOR,
  KINDS,
  KIND_LABEL,
  PROGRAM,
  PROGRAM_TAG,
  freshRooms,
  hasHinge,
  hasSwing,
  isStreetDoor,
  repair,
  sampleSheet,
  sizeFor,
} from './sample'
import { DEFAULTS, isOpen, type Room } from './model'
import { areaOf, r2 } from './geometry'

describe('the program', () => {
  it('is the fresh brief’s ground floor, in the order of importance', () => {
    expect(PROGRAM_TAG).toBe('fresh-brief-2')
    expect(PROGRAM.length).toBe(21)
    expect(PROGRAM[0]).toEqual(['Entry', 'entry-foyer', 8])
    expect(PROGRAM[2]).toEqual(['Diwaniya', 'diwaniya', 60])
    expect(PROGRAM.filter(([, kind]) => KINDS[kind]!.cat === 'open').length).toBe(4)
  })

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

  it('makes the program’s rooms, none of them placed', () => {
    const rooms = freshRooms()
    expect(rooms.length).toBe(21)
    expect(rooms.every((r) => !r.placed)).toBe(true)
    expect(rooms[0]!.id).toBe('r0')
    expect(rooms.find((r) => r.name === 'Garden')!.cat).toBe('open')
  })

  it('knows a street door, a hinge and a swing', () => {
    const d = {
      id: 'd',
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
    const sheet = sampleSheet()
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
