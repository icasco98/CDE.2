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
      'diwaniya',
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
      'Diwaniya',
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
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
    ])
  })

  it('keeps the staff rooms and their bathrooms together on the ground', () => {
    const program = defaultProgram(500, large, 2)
    for (const name of ['Maid Room', 'Maid Bathroom', 'Driver Room', 'Driver Bathroom'])
      expect(onStorey(program, 0)).toContain(name)
  })

  it('opens every upper kind on the first storey of a three-storey house', () => {
    const program = defaultProgram(500, small, 3)
    expect(onStorey(program, 2)).toEqual([])
    expect(onStorey(program, 1)).toHaveLength(6)
  })
})
