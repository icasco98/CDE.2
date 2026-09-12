import { describe, expect, it } from 'vitest'
import { area } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Project } from '../model'
import { defaultProgram } from './program'
import {
  impliedConnections,
  type ConnectionRoom,
  type ImpliedConnection,
} from './impliedConnections'

/** The starting household on the starting plot: three bedrooms, two cars, no maid, no driver. */
function startingProject(storeys = 1): Project {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  const project = store.getState()
  for (const room of defaultProgram(area(project.plot.polygon), project.household, storeys))
    store.actions.addRoom(room)
  return store.getState()
}

/** A connection read the way a person reads it: the two names and what kind of edge it would be. */
function named(project: Project, links: readonly ImpliedConnection[]): readonly string[] {
  const nameOf = (id: string): string =>
    id === EXTERIOR ? 'Outside' : (project.rooms.find((room) => room.id === id)?.name ?? id)
  return links.map((link) => `${nameOf(link.a)} to ${nameOf(link.b)} (${link.kind}, ${link.rowId})`)
}

const referenceCase: readonly string[] = [
  'Outside to Entry (main-door, D1)',
  'Outside to Diwaniya (door, D2)',
  'Outside to Garage bay 1 (door, D3)',
  'Outside to Garage bay 2 (door, D3)',
  'Entry to Formal Living (door, D5)',
  'Entry to Family Living (door, D6)',
  'Entry to Guest WC (door, D7)',
  'Entry to Hallway (open, D9)',
  'Diwaniya to Diwaniya WC (door, D11)',
  'Kitchen to Dining Room (door, D12)',
  'Dining Room to Family Living (open, D18)',
  'Master Bedroom to Ensuite, Master Bedroom (door, D19)',
  'Bedroom 1 to Ensuite, Bedroom 1 (door, D21)',
  'Bedroom 2 to Ensuite, Bedroom 2 (door, D21)',
  'Hallway to Master Bedroom (door, D23)',
  'Hallway to Bedroom 1 (door, D24)',
  'Hallway to Bedroom 2 (door, D24)',
]

describe('the reference case: the starting household on the starting plot', () => {
  it('implies exactly the defaults the program implies', () => {
    const project = startingProject()
    expect(project.rooms).toHaveLength(17)
    expect(named(project, impliedConnections(project.rooms, project.edges))).toEqual(referenceCase)
  })

  it('pairs each ensuite with the bedroom added immediately before it', () => {
    const project = startingProject()
    const suites = impliedConnections(project.rooms, project.edges).filter(
      (link) => link.rowId === 'D19' || link.rowId === 'D21',
    )
    const at = (id: string): number => project.rooms.findIndex((room) => room.id === id)
    expect(suites).toHaveLength(3)
    for (const suite of suites) expect(at(suite.b)).toBe(at(suite.a) + 1)
  })

  it('gives each ensuite of a two-storey rebuild the door to its own bedroom upstairs', () => {
    const project = startingProject(2)
    const suites = impliedConnections(project.rooms, project.edges).filter(
      (link) => link.rowId === 'D19' || link.rowId === 'D21',
    )
    const nameOf = (id: string): string => project.rooms.find((room) => room.id === id)?.name ?? id
    expect(suites.every((suite) => suite.storey === 1)).toBe(true)
    expect(suites.map((suite) => `${nameOf(suite.a)} to ${nameOf(suite.b)}`)).toEqual([
      'Master Bedroom to Ensuite, Master Bedroom',
      'Bedroom 1 to Ensuite, Bedroom 1',
      'Bedroom 2 to Ensuite, Bedroom 2',
    ])
  })

  it('implies nothing a second time once every link is accepted', () => {
    const store = createStore(undefined, { newId: createIdGenerator(7) })
    const first = store.getState()
    for (const room of defaultProgram(area(first.plot.polygon), first.household, 1))
      store.actions.addRoom(room)
    const project = store.getState()
    for (const link of impliedConnections(project.rooms, project.edges))
      expect(store.actions.connect(link).ok).toBe(true)
    const settled = store.getState()
    expect(settled.edges).toHaveLength(referenceCase.length)
    expect(impliedConnections(settled.rooms, settled.edges)).toEqual([])
  })

  it('drops a link as soon as its edge exists', () => {
    const project = startingProject()
    const before = impliedConnections(project.rooms, project.edges)
    const first = before[0]
    if (!first) throw new Error('the reference case implies nothing')
    const withEdge = {
      ...project,
      edges: [{ id: 'edge-1', a: first.a, b: first.b, kind: first.kind, storey: first.storey }],
    }
    const after = impliedConnections(withEdge.rooms, withEdge.edges)
    expect(after).toHaveLength(before.length - 1)
    expect(after).not.toContainEqual(first)
  })
})

describe('what the table will not imply', () => {
  const room = (id: string, type: string, storey = 0, storeysSpanned = 1): ConnectionRoom => ({
    id,
    type,
    storey,
    storeysSpanned,
  })

  it('offers no second front door once the project has one', () => {
    const rooms = [room('entry', 'entry-foyer')]
    const edges = [{ id: 'e1', a: EXTERIOR, b: 'entry', kind: 'main-door' as const, storey: 0 }]
    expect(impliedConnections(rooms, [])).toHaveLength(1)
    expect(impliedConnections(rooms, edges)).toEqual([])
  })

  it('offers no front door when another room already holds it', () => {
    const rooms = [room('entry', 'entry-foyer'), room('diwaniya', 'diwaniya')]
    const edges = [{ id: 'e1', a: EXTERIOR, b: 'other', kind: 'main-door' as const, storey: 0 }]
    const links = impliedConnections(rooms, edges)
    expect(links.map((link) => link.rowId)).toEqual(['D2'])
  })

  it('offers one front door only, however many entries there are', () => {
    const rooms = [room('entry-a', 'entry-foyer'), room('entry-b', 'entry-foyer')]
    const frontDoors = impliedConnections(rooms, []).filter((link) => link.kind === 'main-door')
    expect(frontDoors).toHaveLength(1)
  })

  it('leaves two rooms on different storeys unconnected when no stair spans them', () => {
    const rooms = [room('kitchen', 'kitchen', 0), room('dining', 'dining-room', 1)]
    expect(impliedConnections(rooms, [])).toEqual([])
  })

  it('connects a stair to a room on any storey the stair spans', () => {
    const rooms = [room('hall', 'hallway', 1), room('stair', 'stair', 0, 2)]
    const links = impliedConnections(rooms, [])
    expect(links).toEqual([{ a: 'hall', b: 'stair', kind: 'open', storey: 1, rowId: 'D26' }])
  })

  it('meets the outside on the lowest storey a room stands on', () => {
    const rooms = [room('garage', 'garage', 2)]
    expect(impliedConnections(rooms, [])).toEqual([
      { a: EXTERIOR, b: 'garage', kind: 'door', storey: 2, rowId: 'D3' },
    ])
  })
})

describe('pairing', () => {
  const room = (id: string, type: string): ConnectionRoom => ({
    id,
    type,
    storey: 0,
    storeysSpanned: 1,
  })

  it('gives a hub one link per room it serves', () => {
    const rooms = [
      room('hall', 'hallway'),
      room('bed-1', 'bedroom'),
      room('bed-2', 'bedroom'),
      room('bed-3', 'bedroom'),
    ]
    const links = impliedConnections(rooms, []).filter((link) => link.rowId === 'D24')
    expect(links.map((link) => link.b)).toEqual(['bed-1', 'bed-2', 'bed-3'])
  })

  it('gives an auxiliary room to the nearest room before it, and to one row only', () => {
    const rooms = [
      room('bed-1', 'bedroom'),
      room('master', 'master-bedroom'),
      room('ensuite-1', 'ensuite-bathroom'),
    ]
    const links = impliedConnections(rooms, []).filter((link) => link.b === 'ensuite-1')
    expect(links).toEqual([{ a: 'master', b: 'ensuite-1', kind: 'door', storey: 0, rowId: 'D19' }])
  })

  it('leaves an auxiliary room alone when no room of its kind comes before it', () => {
    const rooms = [room('ensuite-1', 'ensuite-bathroom'), room('bed-1', 'bedroom')]
    expect(impliedConnections(rooms, [])).toEqual([])
  })

  it('is the same list every time it is asked', () => {
    const project = startingProject()
    const once = impliedConnections(project.rooms, project.edges)
    expect(impliedConnections(project.rooms, project.edges)).toEqual(once)
  })
})

describe('the hallway as a hub', () => {
  const room = (id: string, type: string, storey = 0, storeysSpanned = 1): ConnectionRoom => ({
    id,
    type,
    storey,
    storeysSpanned,
  })

  it('offers each hallway the stair, the bedrooms and the bathrooms of its own floor', () => {
    const rooms = [
      room('entry', 'entry-foyer'),
      room('stair', 'stair', 0, 2),
      room('ground-hall', 'hallway'),
      room('first-hall', 'hallway', 1),
      room('master', 'master-bedroom', 1),
      room('bed', 'bedroom', 1),
      room('bath', 'bathroom', 1),
    ]
    const about = (id: string): readonly string[] =>
      impliedConnections(rooms, [])
        .filter((link) => link.a === id || link.b === id)
        .map((link) => `${link.a} to ${link.b} (${link.kind}, ${link.rowId}) on ${link.storey}`)
    expect(about('first-hall')).toEqual([
      'first-hall to master (door, D23) on 1',
      'first-hall to bed (door, D24) on 1',
      'first-hall to bath (door, D25) on 1',
      'first-hall to stair (open, D26) on 1',
    ])
    // The front door opens on the ground corridor, and both corridors stand on the one stair.
    expect(about('ground-hall')).toEqual([
      'entry to ground-hall (open, D9) on 0',
      'ground-hall to stair (open, D26) on 0',
    ])
  })

  it('gives the rebuilt two-storey program a corridor to every bedroom upstairs', () => {
    const project = startingProject(2)
    const upstairs = project.rooms.find((each) => each.name === 'First Hallway')
    const nameOf = (id: string): string => project.rooms.find((each) => each.id === id)?.name ?? id
    expect(upstairs).toBeDefined()
    expect(
      named(
        project,
        impliedConnections(project.rooms, project.edges).filter(
          (link) => link.a === upstairs?.id || link.b === upstairs?.id,
        ),
      ),
    ).toEqual([
      'First Hallway to Master Bedroom (door, D23)',
      'First Hallway to Bedroom 1 (door, D24)',
      'First Hallway to Bedroom 2 (door, D24)',
      'First Hallway to Stair (open, D26)',
    ])
    expect(nameOf(project.rooms[2]?.id ?? '')).toBe('Ground Hallway')
  })
})
