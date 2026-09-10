import { describe, expect, it } from 'vitest'
import { defaultProgram } from './program'

const small = {
  familySize: 4,
  bedrooms: 3,
  maid: false,
  driver: false,
  cars: 1,
  womensReception: false,
}

const large = {
  familySize: 6,
  bedrooms: 4,
  maid: true,
  driver: true,
  cars: 2,
  womensReception: true,
}

describe('the program a household implies', () => {
  it('gives a small household the trio, its bedrooms and one garage bay', () => {
    const program = defaultProgram(500, small)
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
    const program = defaultProgram(500, large)
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
    const onFiveHundred = defaultProgram(500, small)
    const onNineHundred = defaultProgram(900, small)
    expect(onFiveHundred.find((room) => room.type === 'diwaniya')?.targetArea).toBe(52.5)
    expect(onNineHundred.find((room) => room.type === 'diwaniya')?.targetArea).toBe(75)
    expect(onFiveHundred.find((room) => room.type === 'bedroom')?.targetArea).toBe(18)
  })

  it('names the first bedroom the master and pairs each with an ensuite', () => {
    const program = defaultProgram(500, large)
    expect(program.map((room) => room.name)).toContain('Master Bedroom')
    expect(program.map((room) => room.name)).toContain('Ensuite, Bedroom 3')
  })
})
