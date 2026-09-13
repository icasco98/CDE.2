import { describe, expect, it } from 'vitest'
import { area, type Polygon } from '../geometry'
import { occupiedStoreys, type Project } from '../model'
import { buildableAreaOf, reductionFor, slackOf, type Reduction } from '../rulebook'
import { settled, startingPlot, villa } from './houses'
import { partitionStorey } from './storey'

/*
 * The offer of reduction read off a real morph: the default program is built on the plot the tool
 * opens on, the plot is then narrowed under it as a person would narrow it on Requirements, and
 * the rooms the sheet would outline are read off the spill the morph declares.
 */

function narrowedTo(width: number, depth: number): Project {
  const base = villa(2)
  const polygon: Polygon = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ]
  return settled({ ...base, plot: { ...base.plot, polygon } })
}

/** What the ground storey spills, and what the sheet would offer to do about it. */
function groundOffer(house: Project): {
  readonly overflowM2: number
  readonly offer: Reduction | null
} {
  const made = partitionStorey(house, 0)
  const here = house.rooms.filter((room) => occupiedStoreys(room).includes(0))
  return {
    overflowM2: made.overflowM2,
    offer: reductionFor({
      rooms: here.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
        targetArea: room.targetArea,
      })),
      overflowM2: made.overflowM2,
      buildableM2: buildableAreaOf(house.plot),
      plotAreaM2: area(house.plot.polygon),
      storey: 0,
    }),
  }
}

/** One click: the room's target set to the bottom of its range, which is all the click does. */
function reduced(house: Project, id: string, to: number): Project {
  return {
    ...house,
    rooms: house.rooms.map((room) => (room.id === id ? { ...room, targetArea: to } : room)),
  }
}

describe('a ground storey that spills about 30 m²', () => {
  // The default program's spill grows with how little depth the plot leaves the columns, so 30 m²
  // of it wants a shallow plot: 34 by 10 spills 31.7 m² and its rooms at their smallest still fit.
  const { overflowM2, offer } = groundOffer(narrowedTo(34, 10))

  it('spills 31.7 m² past the buildable line', () => {
    expect(overflowM2).toBeCloseTo(31.7, 1)
  })

  it('offers the fewest rooms by largest slack, and their slack covers the overflow', () => {
    expect(offer?.offered.map((room) => room.name)).toEqual(['Diwaniya', 'Family Living'])
    expect(offer?.together).toBeGreaterThanOrEqual(overflowM2)
    // The fewest: without the last of them the offer would not have covered the overflow.
    const withoutLast = (offer?.offered ?? []).slice(0, -1)
    expect(withoutLast.reduce((sum, room) => sum + room.slack, 0)).toBeLessThan(overflowM2)
  })

  it('offers no room below the bottom of its range', () => {
    const house = narrowedTo(34, 10)
    const plotArea = area(house.plot.polygon)
    for (const offered of offer?.offered ?? []) {
      const room = house.rooms.find((each) => each.id === offered.id)
      expect(room).toBeDefined()
      expect(offered.to).toBe(room!.targetArea - slackOf(room!, plotArea))
    }
  })
})

describe('the plot narrowed from 20 m to 17 m under the default program', () => {
  it('takes the overflow to nothing as each offered room is clicked in turn', () => {
    let house = narrowedTo(17, 25)
    let step = groundOffer(house)
    expect(step.overflowM2).toBeGreaterThan(0)
    const clicked: string[] = []
    while (step.offer !== null && step.offer.offered.length > 0 && clicked.length < 8) {
      const first = step.offer.offered[0]
      if (!first) break
      house = reduced(house, first.id, first.to)
      clicked.push(first.name)
      step = groundOffer(house)
    }
    expect(clicked).toEqual(['Diwaniya', 'Family Living', 'Dining Room', 'Kitchen'])
    expect(step.overflowM2).toBe(0)
    expect(step.offer).toBe(null)
  })
})

describe('a plot no reduction can fit the program on', () => {
  it('says how much has to leave the floor instead, and offers no room', () => {
    const { offer } = groundOffer(narrowedTo(18, 14))
    expect(offer?.offered).toEqual([])
    expect(offer?.sentence).toBe(
      'The ground floor program is too big for this plot by 20.6 m² even with every room at its ' +
        'smallest: move rooms upstairs or remove some.',
    )
  })
})

describe('the plot the tool opens on', () => {
  it('does not spill, so nothing is offered', () => {
    const { overflowM2, offer } = groundOffer(settled(villa(2, {}, startingPlot)))
    expect([overflowM2, offer]).toEqual([0, null])
  })
})
