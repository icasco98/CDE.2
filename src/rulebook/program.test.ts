import { describe, expect, it } from 'vitest'
import type { Household } from '../model'
import { companionsOf, defaultProgram, type ProgramZone } from './program'

const small: Household = {
  familySize: 4,
  bedrooms: 3,
  maid: false,
  driver: false,
  cars: 1,
  womensReception: false,
  masterOnGround: false,
}

const large: Household = {
  familySize: 6,
  bedrooms: 4,
  maid: true,
  driver: true,
  cars: 2,
  womensReception: true,
  masterOnGround: false,
}

/** A zone read the way the program table reads one: its name and the storey it opens on. */
function onStorey(program: readonly ProgramZone[], storey: number): readonly string[] {
  return program.filter((zone) => zone.storey === storey).map((zone) => zone.name)
}

describe('the program a household implies', () => {
  it('gives a small household the trio, its bedrooms and one garage bay', () => {
    const program = defaultProgram(500, small, 1)
    expect(program.map((zone) => zone.type)).toEqual([
      'entry-foyer',
      'hallway',
      'diwaniya',
      'diwaniya-wc',
      'formal-living',
      'family-living',
      'dining-room',
      'kitchen',
      'guest-wc',
      'master-bedroom',
      'ensuite-bathroom',
      'bedroom',
      'ensuite-bathroom',
      'bedroom',
      'ensuite-bathroom',
      'garage',
    ])
    expect(program.filter((zone) => zone.type === 'womens-reception')).toEqual([])
  })

  it('gives a large household staff zones, a bay per car and the reception it asked for', () => {
    const program = defaultProgram(500, large, 1)
    const types = program.map((zone) => zone.type)
    expect(types).toContain('womens-reception')
    expect(types.filter((type) => type === 'garage')).toHaveLength(2)
    expect(types.filter((type) => type === 'ensuite-bathroom')).toHaveLength(4)
    expect(types).toContain('maid-room')
    expect(types).toContain('maid-bathroom')
    expect(types).toContain('driver-room')
    expect(types).toContain('driver-bathroom')
    expect(program.length).toBeGreaterThanOrEqual(12)
  })

  it('takes the target area of the trio from the plot', () => {
    const onFiveHundred = defaultProgram(500, small, 1)
    const onNineHundred = defaultProgram(900, small, 1)
    expect(onFiveHundred.find((zone) => zone.type === 'diwaniya')?.targetArea).toBe(52.5)
    expect(onNineHundred.find((zone) => zone.type === 'diwaniya')?.targetArea).toBe(75)
    expect(onFiveHundred.find((zone) => zone.type === 'bedroom')?.targetArea).toBe(18)
  })

  it('names the first bedroom the master and pairs each with an ensuite', () => {
    const program = defaultProgram(500, large, 1)
    expect(program.map((zone) => zone.name)).toContain('Master Bedroom')
    expect(program.map((zone) => zone.name)).toContain('Ensuite, Bedroom 3')
  })
})

describe('the storeys the program opens on', () => {
  it('puts every zone of a one-storey house on the ground, and no stair in it', () => {
    const program = defaultProgram(500, small, 1)
    expect(program.every((zone) => zone.storey === 0 && zone.storeysSpanned === 1)).toBe(true)
    expect(program.map((zone) => zone.type)).not.toContain('stair')
  })

  it('sends the bedrooms and their ensuites upstairs when the house has two storeys', () => {
    const program = defaultProgram(500, small, 2)
    expect(onStorey(program, 1)).toEqual([
      'First Hallway',
      'Master Bedroom',
      'Ensuite, Master Bedroom',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
    ])
    expect(onStorey(program, 0)).toEqual([
      'Entry',
      'Stair',
      'Ground Hallway',
      'Diwaniya',
      'Diwaniya WC',
      'Formal Living',
      'Family Living',
      'Dining Room',
      'Kitchen',
      'Guest WC',
      'Garage bay 1',
    ])
  })

  it('gives a house of more than one storey a stair that spans them all', () => {
    const stairOf = (storeys: number): ProgramZone | undefined =>
      defaultProgram(500, small, storeys).find((zone) => zone.type === 'stair')
    expect(stairOf(2)).toMatchObject({ storey: 0, storeysSpanned: 2 })
    expect(stairOf(3)).toMatchObject({ storey: 0, storeysSpanned: 3 })
  })

  it('keeps the master bedroom and its ensuite on the ground when the household asks', () => {
    const program = defaultProgram(500, { ...small, masterOnGround: true }, 2)
    expect(onStorey(program, 0)).toContain('Master Bedroom')
    expect(onStorey(program, 0)).toContain('Ensuite, Master Bedroom')
    expect(onStorey(program, 1)).toEqual([
      'First Hallway',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
    ])
  })

  it('brings every companion the table names, beside the zone it serves', () => {
    const program = defaultProgram(500, large, 2)
    const beside = (name: string): string | undefined => {
      const at = program.findIndex((zone) => zone.name === name)
      return program[at + 1]?.name
    }
    expect(beside('Diwaniya')).toBe('Diwaniya WC')
    expect(beside('Master Bedroom')).toBe('Ensuite, Master Bedroom')
    expect(beside('Bedroom 3')).toBe('Ensuite, Bedroom 3')
    expect(beside('Maid Room')).toBe('Maid Bathroom')
    expect(beside('Driver Room')).toBe('Driver Bathroom')
  })

  it('keeps the staff zones and their bathrooms together on the ground', () => {
    const program = defaultProgram(500, large, 2)
    for (const name of ['Maid Room', 'Maid Bathroom', 'Driver Room', 'Driver Bathroom'])
      expect(onStorey(program, 0)).toContain(name)
  })

  it('opens every upper kind on the first storey of a three-storey house', () => {
    const program = defaultProgram(500, small, 3)
    expect(onStorey(program, 2)).toEqual([])
    expect(onStorey(program, 1)).toHaveLength(7)
  })
})

describe('the hallways the program lays out', () => {
  it('gives the two-storey default program a hallway on each floor, after the stair', () => {
    expect(defaultProgram(500, small, 2).map((zone) => zone.name)).toEqual([
      'Entry',
      'Stair',
      'Ground Hallway',
      'First Hallway',
      'Diwaniya',
      'Diwaniya WC',
      'Formal Living',
      'Family Living',
      'Dining Room',
      'Kitchen',
      'Guest WC',
      'Master Bedroom',
      'Ensuite, Master Bedroom',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
      'Garage bay 1',
    ])
  })

  it('sizes each one from the zones on its own floor', () => {
    const hallways = defaultProgram(500, small, 2).filter((zone) => zone.type === 'hallway')
    // 196 m² served on the ground, 82 m² of bedrooms and ensuites upstairs, a tenth of each.
    expect(hallways.map((zone) => zone.targetArea)).toEqual([19.6, 8.2])
  })

  it('gives a one-storey house one hallway, named without a storey', () => {
    const hallways = defaultProgram(500, small, 1).filter((zone) => zone.type === 'hallway')
    expect(hallways.map((zone) => [zone.name, zone.storey, zone.targetArea])).toEqual([
      ['Hallway', 0, 27.8],
    ])
  })

  it('leaves a floor a stair only reaches without one', () => {
    const program = defaultProgram(500, small, 3)
    expect(program.filter((zone) => zone.type === 'hallway').map((zone) => zone.name)).toEqual([
      'Ground Hallway',
      'First Hallway',
    ])
  })
})

describe('the zones a zone owns', () => {
  const zones = [
    { id: 'master', type: 'master-bedroom' },
    { id: 'ensuite', type: 'ensuite-bathroom' },
    { id: 'dressing', type: 'dressing-room' },
    { id: 'hallway', type: 'hallway' },
    { id: 'shared', type: 'bathroom' },
    { id: 'kitchen', type: 'kitchen' },
  ]
  const connections = [
    { a: 'master', b: 'ensuite' },
    { a: 'master', b: 'dressing' },
    { a: 'hallway', b: 'master' },
    { a: 'hallway', b: 'shared' },
  ]

  it('takes the auxiliary zones that open off it and nothing else', () => {
    expect(companionsOf(zones, connections, 'master')).toEqual(['ensuite', 'dressing'])
  })

  it('leaves a bathroom that serves the house where it is', () => {
    // The shared bathroom opens off the corridor, so it belongs to the floor and not to a zone.
    expect(companionsOf(zones, connections, 'hallway')).toEqual(['shared'])
    expect(companionsOf(zones, [...connections, { a: 'kitchen', b: 'shared' }], 'hallway')).toEqual(
      [],
    )
  })

  it('owns nothing where nothing auxiliary opens off it', () => {
    expect(companionsOf(zones, connections, 'kitchen')).toEqual([])
  })
})
