import { describe, expect, it } from 'vitest'
import type { Household } from '../model'
import { defaultProgram, type ProgramRoom } from './program'

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

/** A room read the way the program table reads one: its name and the storey it opens on. */
function onStorey(program: readonly ProgramRoom[], storey: number): readonly string[] {
  return program.filter((room) => room.storey === storey).map((room) => room.name)
}

describe('the program a household implies', () => {
  it('gives a small household the trio, its bedrooms and one garage bay', () => {
    const program = defaultProgram(500, small, 1)
    expect(program.map((room) => room.type)).toEqual([
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
    expect(program.filter((room) => room.type === 'womens-reception')).toEqual([])
  })

  it('gives a large household staff rooms, a bay per car and the reception it asked for', () => {
    const program = defaultProgram(500, large, 1)
    const types = program.map((room) => room.type)
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
    expect(onFiveHundred.find((room) => room.type === 'diwaniya')?.targetArea).toBe(52.5)
    expect(onNineHundred.find((room) => room.type === 'diwaniya')?.targetArea).toBe(75)
    expect(onFiveHundred.find((room) => room.type === 'bedroom')?.targetArea).toBe(18)
  })

  it('names the first bedroom the master and pairs each with an ensuite', () => {
    const program = defaultProgram(500, large, 1)
    expect(program.map((room) => room.name)).toContain('Master Bedroom')
    expect(program.map((room) => room.name)).toContain('Ensuite, Bedroom 3')
  })
})

describe('the storeys the program opens on', () => {
  it('puts every room of a one-storey house on the ground, and no stair in it', () => {
    const program = defaultProgram(500, small, 1)
    expect(program.every((room) => room.storey === 0 && room.storeysSpanned === 1)).toBe(true)
    expect(program.map((room) => room.type)).not.toContain('stair')
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
    const stairOf = (storeys: number): ProgramRoom | undefined =>
      defaultProgram(500, small, storeys).find((room) => room.type === 'stair')
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

  it('brings every companion the table names, beside the room it serves', () => {
    const program = defaultProgram(500, large, 2)
    const beside = (name: string): string | undefined => {
      const at = program.findIndex((room) => room.name === name)
      return program[at + 1]?.name
    }
    expect(beside('Diwaniya')).toBe('Diwaniya WC')
    expect(beside('Master Bedroom')).toBe('Ensuite, Master Bedroom')
    expect(beside('Bedroom 3')).toBe('Ensuite, Bedroom 3')
    expect(beside('Maid Room')).toBe('Maid Bathroom')
    expect(beside('Driver Room')).toBe('Driver Bathroom')
  })

  it('keeps the staff rooms and their bathrooms together on the ground', () => {
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
    expect(defaultProgram(500, small, 2).map((room) => room.name)).toEqual([
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

  it('sizes each one from the rooms on its own floor', () => {
    const hallways = defaultProgram(500, small, 2).filter((room) => room.type === 'hallway')
    // 196 m² served on the ground, 82 m² of bedrooms and ensuites upstairs, a tenth of each.
    expect(hallways.map((room) => room.targetArea)).toEqual([19.6, 8.2])
  })

  it('gives a one-storey house one hallway, named without a storey', () => {
    const hallways = defaultProgram(500, small, 1).filter((room) => room.type === 'hallway')
    expect(hallways.map((room) => [room.name, room.storey, room.targetArea])).toEqual([
      ['Hallway', 0, 27.8],
    ])
  })

  it('leaves a floor a stair only reaches without one', () => {
    const program = defaultProgram(500, small, 3)
    expect(program.filter((room) => room.type === 'hallway').map((room) => room.name)).toEqual([
      'Ground Hallway',
      'First Hallway',
    ])
  })
})
