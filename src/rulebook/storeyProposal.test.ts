import { describe, expect, it } from 'vitest'
import { startingHousehold, startingPlot } from '../model/project'
import type { Plot } from '../model'
import { buildableAreaOf } from './setbacks'
import { proposeProgram } from './storeyProposal'

/*
 * Reference cases, worked from the zone-type table's typical areas and the Municipality setbacks,
 * the ground's bare targets with no allowance for walls. The starting plot is 20 × 25 m with the
 * street on one side: 2 m off the street and 1.5 m off the other three leaves 17 × 21.5 = 365.5 m²
 * buildable.
 */

const onFloor = (zones: readonly { name: string; storey: number }[], storey: number) =>
  zones.filter((zone) => zone.storey === storey).map((zone) => zone.name)

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
    expect(onFloor(proposal.zones, 1)).toEqual([
      'First Hallway',
      'Master Bedroom',
      'Ensuite, Master Bedroom',
      'Bedroom 1',
      'Ensuite, Bedroom 1',
      'Bedroom 2',
      'Ensuite, Bedroom 2',
    ])
    expect(proposal.zones.find((zone) => zone.type === 'stair')).toMatchObject({
      storey: 0,
      storeysSpanned: 2,
    })
    // Ground: 8 + 15 + 19.6 + 52.5 + 5 + 35 + 38.5 + 24 + 20 + 3 + 18 = 238.6 m²; 365.5 − 238.6 = 126.9.
    expect(proposal.reasons).toEqual([
      'Two storeys, Ground and First: the house receives and serves on the ground and sleeps above it.',
      'First takes the private zones the zone-type table puts upstairs: Master Bedroom, Bedroom 1 and Bedroom 2, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.',
      'A stair spans Ground to First, the one way between them.',
      'The ground holds its program: 238.6 m² of targets on 365.5 m² buildable, 126.9 m² to spare.',
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
      expect(onFloor(proposal.zones, 0)).toContain(kept)
    // Ground: 8 + 15 + 24.7 + 52.5 + 5 + 35 + 38.5 + 24 + 20 + 3 + 12 + 4.5 + 12 + 4.5 + 18 + 18 = 294.7.
    expect(proposal.reasons.at(-1)).toBe(
      'The ground holds its program: 294.7 m² of targets on 365.5 m² buildable, 70.8 m² to spare.',
    )
  })

  it('keeps the family living down on a 19 × 23 m plot, whose 312 m² holds the 294.7 m² asked', () => {
    const plot = plotOf(19, 23)
    expect(buildableAreaOf(plot)).toBeCloseTo(312, 6)
    const proposal = proposeProgram(19 * 23, buildableAreaOf(plot), large, 1)
    expect(onFloor(proposal.zones, 0)).toContain('Family Living')
    expect(proposal.reasons.at(-1)).toBe(
      'The ground holds its program: 294.7 m² of targets on 312 m² buildable, 17.3 m² to spare.',
    )
  })

  it('sends the family living up when the bare targets tip an 18 × 23 m plot over', () => {
    // 15 × 19.5 = 292.5 m² buildable, 2.2 short of 294.7. Up go Family Living's 38.5 and the
    // hallway shrinks from 24.7 to 20.9: 294.7 − 38.5 − 24.7 + 20.9 = 252.4 m² on the ground.
    const plot = plotOf(18, 23)
    expect(buildableAreaOf(plot)).toBeCloseTo(292.5, 6)
    const proposal = proposeProgram(18 * 23, buildableAreaOf(plot), large, 1)
    expect(onFloor(proposal.zones, 1)).toContain('Family Living')
    expect(proposal.reasons.slice(-2)).toEqual([
      'Family Living goes up too: the ground was over by 2.2 m², and the table lets it stand on either floor.',
      'The ground holds its program: 252.4 m² of targets on 292.5 m² buildable, 40.1 m² to spare.',
    ])
  })

  it('says by how much the ground is still over on a 15 × 20 m plot', () => {
    const household = { ...startingHousehold, bedrooms: 4, maid: true, driver: true, cars: 2 }
    const proposal = proposeProgram(300, buildableAreaOf(plotOf(15, 20)), household, 1)
    expect(onFloor(proposal.zones, 1)).toContain('Family Living')
    expect(proposal.reasons.slice(-2)).toEqual([
      'Family Living goes up too: the ground was over by 62.6 m², and the table lets it stand on either floor.',
      'The ground is still over its buildable area: 229.8 m² of targets on 198 m² buildable, over by 31.8 m²; move zones up or reduce them.',
    ])
  })

  it('keeps the master bedroom and its suite down when the household asks', () => {
    const household = { ...startingHousehold, masterOnGround: true }
    const proposal = proposeProgram(500, buildable, household, 1)
    expect(proposal.storeys).toBe(2)
    expect(onFloor(proposal.zones, 0)).toEqual(
      expect.arrayContaining(['Master Bedroom', 'Ensuite, Master Bedroom']),
    )
    expect(onFloor(proposal.zones, 1)).toContain('Bedroom 1')
    expect(proposal.reasons).toContain(
      'The master bedroom and its suite stay on the ground, as the household asks.',
    )
  })

  it('keeps a project already on three storeys on three', () => {
    const proposal = proposeProgram(500, buildable, startingHousehold, 3)
    expect(proposal.storeys).toBe(3)
    expect(proposal.zones.find((zone) => zone.type === 'stair')?.storeysSpanned).toBe(3)
  })
})
