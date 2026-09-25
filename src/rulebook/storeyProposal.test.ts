import { describe, expect, it } from 'vitest'
import { startingHousehold, startingPlot } from '../model/project'
import type { Plot } from '../model'
import { buildableAreaOf } from './setbacks'
import { proposeProgram } from './storeyProposal'

/*
 * Reference cases, worked from the room-type table's typical areas and the Municipality setbacks.
 * The starting plot is 20 × 25 m with the street on one side: 2 m off the street and 1.5 m off the
 * other three leaves 17 × 21.5 = 365.5 m² buildable.
 */

const onFloor = (rooms: readonly { name: string; storey: number }[], storey: number) =>
  rooms.filter((room) => room.storey === storey).map((room) => room.name)

describe('the storeys a rebuilt program is proposed on', () => {
  const buildable = buildableAreaOf(startingPlot)

  it('reads 365.5 m² buildable off the starting plot', () => {
    expect(buildable).toBeCloseTo(365.5, 6)
  })

  it('keeps the starting household on one storey, where 313.8 m² fits 365.5 m²', () => {
    const proposal = proposeProgram(500, buildable, startingHousehold, 1)
    expect(proposal.storeys).toBe(1)
    expect(proposal.rooms.every((room) => room.storey === 0)).toBe(true)
    expect(proposal.rooms.some((room) => room.type === 'stair')).toBe(false)
    expect(proposal.reasons).toEqual([
      'The whole program fits on one storey: 313.8 m² of targets, hallway included, on 365.5 m² buildable, 51.7 m² to spare.',
    ])
  })

  it('takes five bedrooms, staff and two cars up to a First storey with a stair', () => {
    const household = { ...startingHousehold, bedrooms: 5, maid: true, driver: true, cars: 2 }
    const proposal = proposeProgram(500, buildable, household, 1)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.rooms, 1)).toEqual([
      'First Hallway',
      'Master Bedroom',
      'Ensuite, Master Bedroom',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
      'Bedroom 3',
      'Ensuite, Bedroom 3',
      'Bedroom 4',
      'Ensuite, Bedroom 4',
    ])
    const stair = proposal.rooms.find((room) => room.type === 'stair')
    expect(stair).toMatchObject({ storey: 0, storeysSpanned: 2 })
    for (const kept of ['Diwaniya', 'Formal Living', 'Kitchen', 'Maid Room', 'Garage bay 1'])
      expect(onFloor(proposal.rooms, 0)).toContain(kept)
    expect(proposal.reasons).toEqual([
      'The program does not fit on one storey: 415 m² of targets, hallway included, on 365.5 m² buildable, over by 49.5 m². A First storey is proposed.',
      'First takes the private zone the room-type table puts upstairs: Master Bedroom, Bedroom 1, Bedroom 2, Bedroom 3 and Bedroom 4, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.',
      'A stair spans Ground to First, the one way between them.',
      'The ground now holds 294.7 m² of 365.5 m² buildable.',
    ])
  })

  it('sends the family living up after the bedrooms on a 15 × 20 m plot, and says the ground is still over', () => {
    const small: Plot = {
      on: true,
      polygon: [
        [0, 0],
        [15, 0],
        [15, 20],
        [0, 20],
      ],
      north: 0,
      street: [2],
    }
    const household = { ...startingHousehold, bedrooms: 4, maid: true, driver: true, cars: 2 }
    const proposal = proposeProgram(300, buildableAreaOf(small), household, 1)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.rooms, 1)).toContain('Family Living')
    expect(proposal.reasons.slice(-2)).toEqual([
      'Family Living goes up too: the ground was still over by 62.6 m², and the table lets it stand on either floor.',
      'The ground is still over its buildable area by 31.8 m²; move rooms up or reduce them.',
    ])
  })

  it('keeps a project already on two storeys on two, and the master bedroom down when asked', () => {
    const household = { ...startingHousehold, masterOnGround: true }
    const proposal = proposeProgram(500, buildable, household, 2)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.rooms, 0)).toContain('Master Bedroom')
    expect(proposal.reasons).toContain(
      'The master bedroom stays on the ground, as the household asks.',
    )
  })
})
