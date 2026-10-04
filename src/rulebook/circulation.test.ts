import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  circulationPerStorey,
  circulationRule,
  hallwayArea,
  hallwayName,
  needsHallway,
  type CirculationZone,
} from './circulation'
import { zoneTypeById } from './sizes'

const markdown = readFileSync(new URL('../../rulebook/zone-types.md', import.meta.url), 'utf8')

/** The value cell of one row of the Circulation table, by the quantity it names. */
function stated(quantity: string): string {
  const row = markdown.split('\n').find((line) => line.trim().startsWith(`| ${quantity} |`))
  const value = row?.split('|')[2]?.trim()
  if (!value) throw new Error(`the Circulation table says nothing about ${quantity}`)
  return value
}

const zone = (
  type: string,
  targetArea: number,
  storey = 0,
  storeysSpanned = 1,
): CirculationZone => ({ type, targetArea, storey, storeysSpanned })

describe('the circulation rule in code matches the one a person reads', () => {
  it('holds the same share, floor and ceiling', () => {
    expect(stated('Share of the zones served')).toBe(`${circulationRule.share * 100}%`)
    expect(stated('Floor')).toBe(`${circulationRule.floor} m²`)
    expect(stated('Ceiling')).toBe(`${circulationRule.ceiling} m²`)
  })

  it('leaves the clear width where the legal floors are, and says the same number there', () => {
    expect(stated('Minimum clear width')).toBe('1.20 m')
    expect(zoneTypeById('hallway')?.legalFloor?.width).toBe(1.2)
  })
})

describe('the area a hallway takes on a storey', () => {
  it('is the share of the zones it serves, between the floor and the ceiling', () => {
    // 214 m² served is the ground floor of a two-storey default program with two garage bays.
    expect(hallwayArea([zone('bedroom', 214)], 0)).toBe(21.4)
    expect(hallwayArea([zone('bedroom', 50)], 0)).toBe(circulationRule.floor)
    expect(hallwayArea([zone('bedroom', 400)], 0)).toBe(circulationRule.ceiling)
  })

  it('counts the zones on that storey only', () => {
    const zones = [zone('bedroom', 214, 0), zone('bedroom', 820, 1)]
    expect(hallwayArea(zones, 0)).toBe(21.4)
    expect(hallwayArea(zones, 1)).toBe(circulationRule.ceiling)
  })

  it('leaves out the circulation it joins and what the ratio does not count', () => {
    const zones = [
      zone('bedroom', 100),
      zone('entry-foyer', 100),
      zone('stair', 100),
      zone('hallway', 100),
      zone('courtyard', 100),
    ]
    expect(hallwayArea(zones, 0)).toBe(10)
  })

  it('takes a stair on every floor it reaches out of every one of them', () => {
    const zones = [zone('stair', 100, 0, 2), zone('bedroom', 100, 1)]
    expect(hallwayArea(zones, 1)).toBe(10)
  })
})

describe('which storeys need a hallway', () => {
  /** The zones the two-storey default program puts on each floor, as kinds and areas. */
  const ground = [
    zone('entry-foyer', 8),
    zone('stair', 15, 0, 2),
    zone('diwaniya', 52.5),
    zone('diwaniya-wc', 5),
    zone('formal-living', 35),
    zone('family-living', 38.5),
    zone('dining-room', 24),
    zone('kitchen', 20),
    zone('guest-wc', 3),
  ]
  const first = [
    zone('master-bedroom', 28, 1),
    zone('ensuite-bathroom', 6, 1),
    zone('bedroom', 18, 1),
    zone('ensuite-bathroom', 6, 1),
  ]

  it('wants one where two zones of the private tier stand together', () => {
    expect(needsHallway(first, 1)).toBe(true)
  })

  it('wants one where a stair stands with a zone that is not a companion', () => {
    expect(needsHallway([zone('stair', 15, 0, 2), zone('office-study', 14)], 0)).toBe(true)
  })

  it('wants one on the ground floor of the default two-storey program', () => {
    expect(needsHallway(ground, 0)).toBe(true)
  })

  it('wants none where one bedroom stands on its own with no stair', () => {
    expect(needsHallway([zone('bedroom', 18, 1), zone('ensuite-bathroom', 6, 1)], 1)).toBe(false)
  })

  it('wants none where a stair reaches a floor and nothing else is on it', () => {
    expect(needsHallway([zone('stair', 15, 0, 3)], 2)).toBe(false)
  })

  it('does not count a companion as the zone off the stair', () => {
    const zones = [zone('stair', 15, 0, 2), zone('master-bedroom', 28), zone('ensuite-bathroom', 6)]
    expect(needsHallway([zones[0]!, zones[2]!], 0)).toBe(false)
    expect(needsHallway(zones, 0)).toBe(true)
  })
})

describe('what the Bubbles tab reads off each storey', () => {
  it('says which storey wants a hallway, in the words the nudge says', () => {
    const zones = [
      zone('stair', 15, 0, 2),
      zone('hallway', 21.4, 0),
      zone('family-living', 38.5),
      zone('master-bedroom', 28, 1),
      zone('bedroom', 18, 1),
      zone('bedroom', 18, 1),
    ]
    expect(circulationPerStorey(zones, 2)).toEqual([
      { storey: 0, hasHallway: true },
      { storey: 1, hasHallway: false, wanted: 'First has three private zones and no hallway.' },
    ])
  })

  it('says nothing about a storey that has a hallway, however many private zones stand on it', () => {
    const zones = [
      zone('hallway', 8.2, 1),
      zone('master-bedroom', 28, 1),
      zone('bedroom', 18, 1),
      zone('bedroom', 18, 1),
      zone('office-study', 14, 1),
    ]
    expect(circulationPerStorey(zones, 2)[1]).toEqual({ storey: 1, hasHallway: true })
  })

  it('says nothing about a storey whose zones ask for no corridor', () => {
    expect(circulationPerStorey([zone('bedroom', 18)], 1)).toEqual([
      { storey: 0, hasHallway: false },
    ])
  })

  it('names a hallway after its storey only where there is more than one', () => {
    expect(hallwayName(0, 1)).toBe('Hallway')
    expect(hallwayName(0, 2)).toBe('Ground Hallway')
    expect(hallwayName(1, 2)).toBe('First Hallway')
  })
})
