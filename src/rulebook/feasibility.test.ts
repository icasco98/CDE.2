import { describe, expect, it } from 'vitest'
import { area } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Plot } from '../model'
import { feasibility, linksHeld, type BriefEdge, type BriefRoom } from './feasibility'
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

function room(id: string, type: string, targetArea: number, name = id): BriefRoom {
  return { id, name, type, storey: 0, storeysSpanned: 1, targetArea }
}

function joined(pairs: readonly (readonly [string, string])[]): BriefEdge[] {
  return pairs.map(([a, b]) => ({ a, b, storey: 0 }))
}

/** The villa a rebuild gives, which is the programme the suite calls feasible. */
function defaultVilla(storeys: number) {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  store.actions.setPlot(plot)
  const opened = store.getState()
  for (const each of defaultProgram(area(plot.polygon), opened.household, storeys))
    store.actions.addRoom(each)
  for (const link of impliedConnections(store.getState().rooms, store.getState().edges))
    store.actions.connect({ a: link.a, b: link.b, kind: link.kind, storey: link.storey })
  return store.getState()
}

describe('the brief checked before a bubble moves', () => {
  it('finds nothing wrong with the villa a rebuild gives, on one storey or two', () => {
    for (const storeys of [1, 2]) {
      const project = defaultVilla(storeys)
      expect(feasibility(project.rooms, project.edges, project.plot, project.storeys)).toEqual([])
    }
  })

  it('says when a storey’s links cannot be drawn without a crossing', () => {
    const names = ['a', 'b', 'c', 'd', 'e']
    const rooms = names.map((id) => room(id, 'room-other', 20))
    const pairs: (readonly [string, string])[] = []
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        pairs.push([names[i] as string, names[j] as string])
    const found = feasibility(rooms, joined(pairs), plot, 1)
    expect(found.map((each) => each.code)).toContain('crossing')
    expect(found.find((each) => each.code === 'crossing')?.sentence).toBe(
      'Ground: these links cannot all be drawn without one crossing another, so one pair can never share a wall. Remove a link between two rooms that do not need a door.',
    )
  })

  it('says when a room is asked to touch more rooms than its wall can hold', () => {
    const rooms = [
      room('wc', 'diwaniya-wc', 5, 'Diwaniya WC'),
      room('a', 'diwaniya', 45),
      room('b', 'formal-living', 30),
      room('c', 'dining-room', 24),
      room('d', 'family-living', 32),
    ]
    const found = feasibility(
      rooms,
      joined([
        ['wc', 'a'],
        ['wc', 'b'],
        ['wc', 'c'],
        ['wc', 'd'],
      ]),
      plot,
      1,
    )
    expect(found.find((each) => each.code === 'wall')?.sentence).toBe(
      'Diwaniya WC is linked to four rooms; at 5 m² it can touch three. Remove a link.',
    )
  })

  it('counts a door to the street among the links a wall has to hold', () => {
    const rooms = [room('wc', 'guest-wc', 3, 'Guest WC'), room('a', 'entry-foyer', 8)]
    const edges: BriefEdge[] = [
      { a: 'wc', b: 'a', storey: 0 },
      { a: EXTERIOR, b: 'wc', storey: 0 },
      { a: 'wc', b: 'nobody', storey: 0 },
    ]
    expect(linksHeld(rooms[0] as BriefRoom)).toBe(2)
    expect(feasibility(rooms, edges, plot, 1).filter((each) => each.code === 'wall')).toHaveLength(
      1,
    )
  })

  it('reads a corridor off both its long sides, because that is what a corridor is for', () => {
    // Twelve square metres at the Municipality's 1.20 m clear is a ten-metre run with a door every
    // metre down each side of it; an eight-metre entry has room for the four the rulebook gives it.
    expect(linksHeld(room('hall', 'hallway', 12))).toBe(20)
    expect(linksHeld(room('entry', 'entry-foyer', 8))).toBe(4)
  })

  it('says when the walled rooms ask for more kerb than the frontage has', () => {
    const narrow: Plot = {
      ...plot,
      polygon: [
        [0, 0],
        [14, 0],
        [14, 25],
        [0, 25],
      ],
    }
    const rooms = [
      room('entry', 'entry-foyer', 8, 'Entry'),
      room('g1', 'garage', 18, 'Garage bay 1'),
      room('g2', 'garage', 18, 'Garage bay 2'),
      room('g3', 'garage', 18, 'Garage bay 3'),
    ]
    const found = feasibility(rooms, [], narrow, 1)
    const kerb = found.find((each) => each.code === 'kerb')
    expect(kerb?.sentence).toContain('The kerb is 11 m')
    expect(kerb?.sentence).toContain('Entry, Garage bay 1, Garage bay 2 and Garage bay 3')
    expect(kerb?.sentence).toContain('Move one to another storey, or give it less area.')
  })
})
