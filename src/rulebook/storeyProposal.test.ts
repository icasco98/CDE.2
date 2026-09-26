import { describe, expect, it } from 'vitest'
import { startingHousehold, startingPlot } from '../model/project'
import type { Plot } from '../model'
import { buildableAreaOf } from './setbacks'
import { proposeProgram } from './storeyProposal'

/*
 * Reference cases, worked from the room-type table's typical areas and the Municipality setbacks,
 * the ground's targets raised by 15% for walls. The starting plot is 20 × 25 m with the street on
 * one side: 2 m off the street and 1.5 m off the other three leaves 17 × 21.5 = 365.5 m² buildable.
 */

const onFloor = (rooms: readonly { name: string; storey: number }[], storey: number) =>
  rooms.filter((room) => room.storey === storey).map((room) => room.name)

const plotOf = (width: number, depth: number): Plot => ({
  on: true,
  polygon: [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ],
  north: 0,
  street: [2],
})

const large = { ...startingHousehold, bedrooms: 5, maid: true, driver: true, cars: 2 }

describe('the storeys a rebuilt program is proposed on', () => {
  const buildable = buildableAreaOf(startingPlot)

  it('reads 365.5 m² buildable off the starting plot', () => {
    expect(buildable).toBeCloseTo(365.5, 6)
  })

  it('puts the starting household on a Ground and a First, the bedrooms up, with a stair', () => {
    const proposal = proposeProgram(500, buildable, startingHousehold, 1)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.rooms, 1)).toEqual([
      'First Hallway',
      'Master Bedroom',
      'Ensuite, Master Bedroom',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
    ])
    expect(proposal.rooms.find((room) => room.type === 'stair')).toMatchObject({
      storey: 0,
      storeysSpanned: 2,
    })
    // Ground: 8 + 15 + 19.6 + 52.5 + 5 + 35 + 38.5 + 24 + 20 + 3 + 18 = 238.6 m², × 1.15 = 274.4.
    expect(proposal.reasons).toEqual([
      'Two storeys, Ground and First: the house receives and serves on the ground and sleeps above it.',
      'First takes the private rooms the room-type table puts upstairs: Master Bedroom, Bedroom 1 and Bedroom 2, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.',
      'A stair spans Ground to First, the one way between them.',
      'The ground holds its program: 274.4 m² with 15% for walls, on 365.5 m² buildable, 91.1 m² to spare.',
    ])
  })

  it('keeps reception, service and garage on the ground for five bedrooms, staff and two cars', () => {
    const proposal = proposeProgram(500, buildable, large, 1)
    for (const kept of [
      'Entry',
      'Diwaniya',
      'Diwaniya WC',
      'Formal Living',
      'Family Living',
      'Dining Room',
      'Kitchen',
      'Guest WC',
      'Maid Room',
      'Driver Room',
      'Garage bay 1',
      'Garage bay 2',
    ])
      expect(onFloor(proposal.rooms, 0)).toContain(kept)
    expect(proposal.reasons.at(-1)).toBe(
      'The ground holds its program: 338.9 m² with 15% for walls, on 365.5 m² buildable, 26.6 m² to spare.',
    )
  })

  it('sends the family living up when the wall allowance tips a 19 × 23 m plot over', () => {
    // 312 m² buildable holds the ground's 294.7 m² of targets, but not 294.7 × 1.15 = 338.9 m².
    const plot = plotOf(19, 23)
    expect(buildableAreaOf(plot)).toBeCloseTo(312, 6)
    const proposal = proposeProgram(19 * 23, buildableAreaOf(plot), large, 1)
    expect(onFloor(proposal.rooms, 1)).toContain('Family Living')
    expect(proposal.reasons.slice(-2)).toEqual([
      'Family Living goes up too: the ground was over by 26.9 m² with walls allowed for, and the table lets it stand on either floor.',
      'The ground holds its program: 290.3 m² with 15% for walls, on 312 m² buildable, 21.7 m² to spare.',
    ])
  })

  it('says by how much the ground is still over on a 15 × 20 m plot', () => {
    const household = { ...startingHousehold, bedrooms: 4, maid: true, driver: true, cars: 2 }
    const proposal = proposeProgram(300, buildableAreaOf(plotOf(15, 20)), household, 1)
    expect(onFloor(proposal.rooms, 1)).toContain('Family Living')
    expect(proposal.reasons.slice(-2)).toEqual([
      'Family Living goes up too: the ground was over by 101.7 m² with walls allowed for, and the table lets it stand on either floor.',
      'The ground is still over its buildable area: 264.3 m² with 15% for walls, on 198 m² buildable, over by 66.3 m²; move rooms up or reduce them.',
    ])
  })

  it('keeps the master bedroom and its suite down when the household asks', () => {
    const household = { ...startingHousehold, masterOnGround: true }
    const proposal = proposeProgram(500, buildable, household, 1)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.rooms, 0)).toEqual(
      expect.arrayContaining(['Master Bedroom', 'Ensuite, Master Bedroom']),
    )
    expect(onFloor(proposal.rooms, 1)).toContain('Bedroom 1')
    expect(proposal.reasons).toContain(
      'The master bedroom and its suite stay on the ground, as the household asks.',
    )
  })

  it('keeps a project already on three storeys on three', () => {
    const proposal = proposeProgram(500, buildable, startingHousehold, 3)
    expect(proposal.storeys).toBe(3)
    expect(proposal.rooms.find((room) => room.type === 'stair')?.storeysSpanned).toBe(3)
  })
})
