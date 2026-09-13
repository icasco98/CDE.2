import { describe, expect, it } from 'vitest'
import type { Household } from '../model'
import { defaultProgram } from './program'
import { reductionFor, slackOf, type SlackRoom } from './slack'

/** The household a project opens on, which is the one the default program is read from. */
const household: Household = {
  familySize: 4,
  bedrooms: 3,
  maid: false,
  driver: false,
  cars: 1,
  womensReception: false,
  masterOnGround: false,
}

/** The plot the tool opens on, 20 by 25, and the floor the setbacks leave a storey of it. */
const PLOT_M2 = 500
const BUILDABLE_M2 = 365.5

const laid = defaultProgram(PLOT_M2, household, 2)

const asSlack = (room: (typeof laid)[number]): SlackRoom => ({
  id: room.name,
  name: room.name,
  type: room.type,
  targetArea: room.targetArea,
})

const program: readonly SlackRoom[] = laid.map(asSlack)

/** The ground storey of that program: a stair stands on it as well as on the floor above. */
const ground: readonly SlackRoom[] = laid
  .filter((room) => room.storey === 0 || room.storeysSpanned > 1)
  .map(asSlack)

describe('the slack of a room', () => {
  it('is what every kind of the default program could give up', () => {
    expect(program.map((room) => [room.name, slackOf(room, PLOT_M2)])).toEqual([
      ['Entry', 2],
      ['Stair', 0],
      ['Ground Hallway', 0],
      ['First Hallway', 0],
      ['Diwaniya', 7.5],
      ['Diwaniya WC', 1],
      ['Formal Living', 5],
      ['Family Living', 6.5],
      ['Dining Room', 6],
      ['Kitchen', 6],
      ['Guest WC', 0.5],
      ['Master Bedroom', 6],
      ['Ensuite, Master Bedroom', 1],
      ['Bedroom 1', 4],
      ['Ensuite, Bedroom 1', 1],
      ['Bedroom 2', 4],
      ['Ensuite, Bedroom 2', 1],
      ['Garage bay 1', 2],
    ])
  })

  it('leaves the hallway, the stair and the lift with none', () => {
    const none = (type: string, targetArea: number): number =>
      slackOf({ id: type, name: type, type, targetArea }, PLOT_M2)
    expect([none('hallway', 27.8), none('stair', 15), none('lift', 5)]).toEqual([0, 0, 0])
  })

  it('reads the plot band for the plot the room stands on, not the one it was made on', () => {
    const diwaniya: SlackRoom = { id: 'd', name: 'Diwaniya', type: 'diwaniya', targetArea: 52.5 }
    expect([slackOf(diwaniya, 500), slackOf(diwaniya, 340), slackOf(diwaniya, 900)]).toEqual([
      7.5, 17.5, 0,
    ])
  })

  it('is never negative, and is nothing at all for a kind the table gives no range', () => {
    expect(slackOf({ id: 'k', name: 'Kitchen', type: 'kitchen', targetArea: 12 }, PLOT_M2)).toBe(0)
    expect(slackOf({ id: 'x', name: 'What', type: 'no-such-kind', targetArea: 30 }, PLOT_M2)).toBe(
      0,
    )
  })
})

describe('the offer of reduction', () => {
  it('says nothing while the storey does not spill', () => {
    expect(
      reductionFor({
        rooms: ground,
        overflowM2: 0,
        buildableM2: BUILDABLE_M2,
        plotAreaM2: PLOT_M2,
        storey: 0,
      }),
    ).toBe(null)
  })

  it('takes the fewest rooms by largest slack that cover a 30 m² overflow', () => {
    const offer = reductionFor({
      rooms: ground,
      overflowM2: 30,
      buildableM2: BUILDABLE_M2,
      plotAreaM2: PLOT_M2,
      storey: 0,
    })
    expect(offer?.offered.map((room) => [room.name, room.from, room.to])).toEqual([
      ['Diwaniya', 52.5, 45],
      ['Family Living', 38.5, 32],
      ['Dining Room', 24, 18],
      ['Kitchen', 20, 14],
      ['Formal Living', 35, 30],
    ])
    expect(offer?.together).toBe(31)
    expect(offer?.sentence).toBe(
      'Reduce these five and the floor fits: Diwaniya 52.5 to 45, Family Living 38.5 to 32, ' +
        'Dining Room 24 to 18, Kitchen 20 to 14, Formal Living 35 to 30, together 31 m².',
    )
  })

  it('offers one room where one covers the overflow', () => {
    const offer = reductionFor({
      rooms: ground,
      overflowM2: 5,
      buildableM2: BUILDABLE_M2,
      plotAreaM2: PLOT_M2,
      storey: 0,
    })
    expect(offer?.sentence).toBe(
      'Reduce this one and the floor fits: Diwaniya 52.5 to 45, together 7.5 m².',
    )
  })

  it('offers no room below the bottom of its range', () => {
    const offer = reductionFor({
      rooms: ground,
      overflowM2: 30,
      buildableM2: BUILDABLE_M2,
      plotAreaM2: PLOT_M2,
      storey: 0,
    })
    for (const room of offer?.offered ?? []) {
      const stands = ground.find((each) => each.id === room.id) as SlackRoom
      expect(room.to).toBe(stands.targetArea - slackOf(stands, PLOT_M2))
      expect(room.to).toBeLessThan(room.from)
    }
  })

  it('says the storey is too big when every room at its smallest still does not fit', () => {
    // The ground storey of the same program on a floor of 150 m²: its rooms at their smallest
    // come to 202.1 m².
    const offer = reductionFor({
      rooms: ground,
      overflowM2: 20,
      buildableM2: 150,
      plotAreaM2: PLOT_M2,
      storey: 0,
    })
    expect(offer?.offered).toEqual([])
    expect(offer?.sentence).toBe(
      'The ground floor program is too big for this plot by 52.1 m² even with every room at its ' +
        'smallest: move rooms upstairs or remove some.',
    )
  })

  it('names the storey it is talking about', () => {
    const offer = reductionFor({
      rooms: ground,
      overflowM2: 20,
      buildableM2: 150,
      plotAreaM2: PLOT_M2,
      storey: 1,
    })
    expect(offer?.sentence.startsWith('The first floor program is too big')).toBe(true)
  })
})
