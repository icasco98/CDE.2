import { describe, expect, it } from 'vitest'
import { area } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Plot } from '../model'
import { feasibility, connectionsHeld, type BriefConnection, type BriefZone } from './feasibility'
import { impliedConnections } from './impliedConnections'
import { defaultProgram } from './program'

const plot: Plot = {
  on: true,
  polygon: [
    [0, 0],
    [20, 0],
    [20, 25],
    [0, 25],
  ],
  north: 0,
  street: [2],
}

function zone(id: string, type: string, targetArea: number, name = id): BriefZone {
  return { id, name, type, storey: 0, storeysSpanned: 1, targetArea }
}

function joined(pairs: readonly (readonly [string, string])[]): BriefConnection[] {
  return pairs.map(([a, b]) => ({ a, b, storey: 0 }))
}

/** The villa a rebuild gives, which is the programme the suite calls feasible. */
function defaultVilla(storeys: number) {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  store.actions.setPlot(plot)
  const opened = store.getState()
  for (const each of defaultProgram(area(plot.polygon), opened.household, storeys))
    store.actions.addZone(each)
  for (const implied of impliedConnections(store.getState().zones, store.getState().connections))
    store.actions.connect({
      a: implied.a,
      b: implied.b,
      kind: implied.kind,
      storey: implied.storey,
    })
  return store.getState()
}

describe('the brief checked before a bubble moves', () => {
  it('finds nothing wrong with the villa a rebuild gives, on one storey or two', () => {
    for (const storeys of [1, 2]) {
      const project = defaultVilla(storeys)
      expect(
        feasibility(project.zones, project.connections, project.plot, project.storeys),
      ).toEqual([])
    }
  })

  it('says when a storey’s connections cannot be drawn without a crossing', () => {
    const names = ['a', 'b', 'c', 'd', 'e']
    const zones = names.map((id) => zone(id, 'zone-other', 20))
    const pairs: (readonly [string, string])[] = []
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        pairs.push([names[i] as string, names[j] as string])
    const found = feasibility(zones, joined(pairs), plot, 1)
    expect(found.map((each) => each.code)).toContain('crossing')
    expect(found.find((each) => each.code === 'crossing')?.sentence).toBe(
      'Ground: these connections cannot all be drawn without one crossing another, so one pair can never share an edge. Remove a connection between two zones that do not need a door.',
    )
  })

  it('says when the frontage will not hold a garage bay beside the zones with street doors', () => {
    const narrow = {
      ...plot,
      polygon: [
        [0, 0],
        [10, 0],
        [10, 25],
        [0, 25],
      ] as const,
    }
    const zones = [
      zone('entry', 'entry-foyer', 8, 'Entry'),
      zone('service', 'service-entrance', 6, 'Service Entrance'),
      zone('bay', 'garage', 18, 'Garage bay 1'),
    ]
    const found = feasibility(zones, [], { ...narrow, polygon: [...narrow.polygon] }, 1)
    expect(found.filter((each) => each.code === 'run').map((each) => each.sentence)).toEqual([
      'Garage bay 1 has no straight run to the street; the frontage has no length left for it. Move a zone to another storey, or give the garage fewer bays.',
    ])
  })

  it('says when a zone is asked to touch more zones than its edge can hold', () => {
    const zones = [
      zone('wc', 'diwaniya-wc', 5, 'Diwaniya WC'),
      zone('a', 'diwaniya', 45),
      zone('b', 'formal-living', 30),
      zone('c', 'dining-room', 24),
      zone('d', 'family-living', 32),
    ]
    const found = feasibility(
      zones,
      joined([
        ['wc', 'a'],
        ['wc', 'b'],
        ['wc', 'c'],
        ['wc', 'd'],
      ]),
      plot,
      1,
    )
    expect(found.find((each) => each.code === 'edge')?.sentence).toBe(
      'Diwaniya WC is connected to four zones; at 5 m² it can touch three. Remove a connection.',
    )
  })

  it('counts a door to the street among the connections an edge has to hold', () => {
    const zones = [zone('wc', 'guest-wc', 3, 'Guest WC'), zone('a', 'entry-foyer', 8)]
    const connections: BriefConnection[] = [
      { a: 'wc', b: 'a', storey: 0 },
      { a: EXTERIOR, b: 'wc', storey: 0 },
      { a: 'wc', b: 'nobody', storey: 0 },
    ]
    expect(connectionsHeld(zones[0] as BriefZone)).toBe(2)
    expect(
      feasibility(zones, connections, plot, 1).filter((each) => each.code === 'edge'),
    ).toHaveLength(1)
  })

  it('reads a corridor off both its long sides, because that is what a corridor is for', () => {
    // Twelve square metres at the Municipality's 1.20 m clear is a ten-metre run with a door every
    // metre down each side of it; an eight-metre entry has space for the four the rulebook gives it.
    expect(connectionsHeld(zone('hall', 'hallway', 12))).toBe(20)
    expect(connectionsHeld(zone('entry', 'entry-foyer', 8))).toBe(4)
  })

  it('says when the zones on the kerb ask for more than the frontage has', () => {
    const narrow: Plot = {
      ...plot,
      polygon: [
        [0, 0],
        [14, 0],
        [14, 25],
        [0, 25],
      ],
    }
    const zones = [
      zone('entry', 'entry-foyer', 8, 'Entry'),
      zone('g1', 'garage', 18, 'Garage bay 1'),
      zone('g2', 'garage', 18, 'Garage bay 2'),
      zone('g3', 'garage', 18, 'Garage bay 3'),
    ]
    const found = feasibility(zones, [], narrow, 1)
    const kerb = found.find((each) => each.code === 'kerb')
    expect(kerb?.sentence).toContain('The kerb is 11 m')
    expect(kerb?.sentence).toContain('Entry, Garage bay 1, Garage bay 2 and Garage bay 3')
    expect(kerb?.sentence).toContain('Move one to another storey, or give it less area.')
  })
})
