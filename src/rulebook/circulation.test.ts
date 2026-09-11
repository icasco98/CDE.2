import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  circulationPerStorey,
  circulationRule,
  hallwayArea,
  hallwayName,
  needsHallway,
  type CirculationRoom,
} from './circulation'
import { roomTypeById } from './sizes'

const markdown = readFileSync(new URL('../../rulebook/room-types.md', import.meta.url), 'utf8')

/** The value cell of one row of the Circulation table, by the quantity it names. */
function stated(quantity: string): string {
  const row = markdown.split('\n').find((line) => line.trim().startsWith(`| ${quantity} |`))
  const value = row?.split('|')[2]?.trim()
  if (!value) throw new Error(`the Circulation table says nothing about ${quantity}`)
  return value
}

const room = (
  type: string,
  targetArea: number,
  storey = 0,
  storeysSpanned = 1,
): CirculationRoom => ({ type, targetArea, storey, storeysSpanned })

describe('the circulation rule in code matches the one a person reads', () => {
  it('holds the same share, floor and ceiling', () => {
    expect(stated('Share of the rooms served')).toBe(`${circulationRule.share * 100}%`)
    expect(stated('Floor')).toBe(`${circulationRule.floor} m²`)
    expect(stated('Ceiling')).toBe(`${circulationRule.ceiling} m²`)
  })

  it('leaves the clear width where the legal floors are, and says the same number there', () => {
    expect(stated('Minimum clear width')).toBe('1.20 m')
    expect(roomTypeById('hallway')?.legalFloor?.width).toBe(1.2)
  })
})

describe('the area a hallway takes on a storey', () => {
  it('is the share of the rooms it serves, between the floor and the ceiling', () => {
    // 214 m² served is the ground floor of a two-storey default program with two garage bays.
    expect(hallwayArea([room('bedroom', 214)], 0)).toBe(21.4)
    expect(hallwayArea([room('bedroom', 50)], 0)).toBe(circulationRule.floor)
    expect(hallwayArea([room('bedroom', 400)], 0)).toBe(circulationRule.ceiling)
  })

  it('counts the rooms on that storey only', () => {
    const rooms = [room('bedroom', 214, 0), room('bedroom', 820, 1)]
    expect(hallwayArea(rooms, 0)).toBe(21.4)
    expect(hallwayArea(rooms, 1)).toBe(circulationRule.ceiling)
  })

  it('leaves out the circulation it joins and what the ratio does not count', () => {
    const rooms = [
      room('bedroom', 100),
      room('entry-foyer', 100),
      room('stair', 100),
      room('hallway', 100),
      room('courtyard', 100),
    ]
    expect(hallwayArea(rooms, 0)).toBe(10)
  })

  it('takes a stair on every floor it reaches out of every one of them', () => {
    const rooms = [room('stair', 100, 0, 2), room('bedroom', 100, 1)]
    expect(hallwayArea(rooms, 1)).toBe(10)
  })
})

describe('which storeys need a hallway', () => {
  /** The rooms the two-storey default program puts on each floor, as kinds and areas. */
  const ground = [
    room('entry-foyer', 8),
    room('stair', 15, 0, 2),
    room('diwaniya', 52.5),
    room('diwaniya-wc', 5),
    room('formal-living', 35),
    room('family-living', 38.5),
    room('dining-room', 24),
    room('kitchen', 20),
    room('guest-wc', 3),
  ]
  const first = [
    room('master-bedroom', 28, 1),
    room('ensuite-bathroom', 6, 1),
    room('bedroom', 18, 1),
    room('ensuite-bathroom', 6, 1),
  ]

  it('wants one where two rooms of the private tier stand together', () => {
    expect(needsHallway(first, 1)).toBe(true)
  })

  it('wants one where a stair stands with a room that is not a companion', () => {
    expect(needsHallway([room('stair', 15, 0, 2), room('office-study', 14)], 0)).toBe(true)
  })

  it('wants one on the ground floor of the default two-storey program', () => {
    expect(needsHallway(ground, 0)).toBe(true)
  })

  it('wants none where one bedroom stands on its own with no stair', () => {
    expect(needsHallway([room('bedroom', 18, 1), room('ensuite-bathroom', 6, 1)], 1)).toBe(false)
  })

  it('wants none where a stair reaches a floor and nothing else is on it', () => {
    expect(needsHallway([room('stair', 15, 0, 3)], 2)).toBe(false)
  })

  it('does not count a companion as the room off the stair', () => {
    const rooms = [room('stair', 15, 0, 2), room('master-bedroom', 28), room('ensuite-bathroom', 6)]
    expect(needsHallway([rooms[0]!, rooms[2]!], 0)).toBe(false)
    expect(needsHallway(rooms, 0)).toBe(true)
  })
})

describe('what the Bubbles tab reads off each storey', () => {
  it('says which storey wants a hallway, in the words the nudge says', () => {
    const rooms = [
      room('stair', 15, 0, 2),
      room('hallway', 21.4, 0),
      room('family-living', 38.5),
      room('master-bedroom', 28, 1),
      room('bedroom', 18, 1),
      room('bedroom', 18, 1),
    ]
    expect(circulationPerStorey(rooms, 2)).toEqual([
      { storey: 0, hasHallway: true },
      { storey: 1, hasHallway: false, wanted: 'First has three private rooms and no hallway.' },
    ])
  })

  it('says nothing about a storey that has a hallway, however many private rooms stand on it', () => {
    const rooms = [
      room('hallway', 8.2, 1),
      room('master-bedroom', 28, 1),
      room('bedroom', 18, 1),
      room('bedroom', 18, 1),
      room('office-study', 14, 1),
    ]
    expect(circulationPerStorey(rooms, 2)[1]).toEqual({ storey: 1, hasHallway: true })
  })

  it('says nothing about a storey whose rooms ask for no corridor', () => {
    expect(circulationPerStorey([room('bedroom', 18)], 1)).toEqual([
      { storey: 0, hasHallway: false },
    ])
  })

  it('names a hallway after its storey only where there is more than one', () => {
    expect(hallwayName(0, 1)).toBe('Hallway')
    expect(hallwayName(0, 2)).toBe('Ground Hallway')
    expect(hallwayName(1, 2)).toBe('First Hallway')
  })
})
