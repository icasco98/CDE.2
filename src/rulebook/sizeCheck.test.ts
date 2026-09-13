import { describe, expect, it } from 'vitest'
import { pastAllowed, pastRange, type MeasuredRoom } from './sizeCheck'

const PLOT_M2 = 500

const room = (name: string, type: string, areaM2: number): MeasuredRoom => ({
  id: name,
  name,
  type,
  areaM2,
})

describe('a room measured against the range of its kind', () => {
  it('names the top of the range for a kitchen drawn at 31 m²', () => {
    expect(pastRange([room('Kitchen', 'kitchen', 31)], PLOT_M2)).toEqual([
      { id: 'Kitchen', sentence: 'Kitchen is 31 m², the range ends at 28.' },
    ])
  })

  it('names the bottom of the range for a kitchen drawn at 9 m²', () => {
    expect(pastRange([room('Kitchen', 'kitchen', 9)], PLOT_M2)).toEqual([
      { id: 'Kitchen', sentence: 'Kitchen is 9 m², the range starts at 14.' },
    ])
  })

  it('says nothing at all about a kitchen of 20 m²', () => {
    expect(pastRange([room('Kitchen', 'kitchen', 20)], PLOT_M2)).toEqual([])
  })

  it('says nothing at either end of the range itself', () => {
    expect(pastRange([room('Kitchen', 'kitchen', 14), room('K2', 'kitchen', 28)], PLOT_M2)).toEqual(
      [],
    )
  })

  it('reads the plot band for a kind whose size comes off the plot', () => {
    const said = pastRange([room('Diwaniya', 'diwaniya', 70)], PLOT_M2)
    expect(said[0]?.sentence).toBe('Diwaniya is 70 m², the range ends at 60.')
    expect(pastRange([room('Diwaniya', 'diwaniya', 70)], 900)).toEqual([])
  })

  it('leaves a hallway alone, which has no range to pass', () => {
    expect(pastRange([room('Ground Hallway', 'hallway', 90)], PLOT_M2)).toEqual([])
  })

  it('says one sentence for each room, in the order of the program', () => {
    const said = pastRange(
      [room('Kitchen', 'kitchen', 31), room('Dining Room', 'dining-room', 9)],
      PLOT_M2,
    )
    expect(said.map((each) => each.id)).toEqual(['Kitchen', 'Dining Room'])
  })
})

describe('a storey and a house measured against the floor they are allowed', () => {
  /** The 20 by 25 plot the tool opens on: 365.5 m² of buildable inside the setbacks. */
  const plot = { storey: 0, buildableM2: 365.5, plotAreaM2: 500 }

  it('says a storey that stands on more than its buildable area', () => {
    expect(pastAllowed({ ...plot, storeyAreaM2: 380, houseAreaM2: 380 })).toEqual([
      'Ground is 380 m² on 365.5 m² buildable.',
    ])
  })

  it('says a house that stands on more than the ratio allows', () => {
    expect(
      pastAllowed({
        storey: 0,
        buildableM2: 400,
        plotAreaM2: 400,
        storeyAreaM2: 300,
        houseAreaM2: 990,
      }),
    ).toEqual(['The house is 990 m² of floor, the ratio allows 960.'])
  })

  it('says both where both are passed, the storey first', () => {
    expect(
      pastAllowed({
        storey: 1,
        buildableM2: 365.5,
        plotAreaM2: 400,
        storeyAreaM2: 380,
        houseAreaM2: 1000,
      }),
    ).toEqual([
      'First is 380 m² on 365.5 m² buildable.',
      'The house is 1000 m² of floor, the ratio allows 960.',
    ])
  })

  it('says nothing while both stand inside what they are allowed', () => {
    expect(pastAllowed({ ...plot, storeyAreaM2: 365.5, houseAreaM2: 1050 })).toEqual([])
  })
})
