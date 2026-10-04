import { describe, expect, it } from 'vitest'
import { area } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Project } from '../model'
import { defaultProgram } from './program'
import {
  impliedConnections,
  type ConnectionZone,
  type ImpliedConnection,
} from './impliedConnections'

/** The starting household on the starting plot: three bedrooms, one car, no maid, no driver. */
function startingProject(storeys = 1): Project {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  const project = store.getState()
  for (const zone of defaultProgram(area(project.plot.polygon), project.household, storeys))
    store.actions.addZone(zone)
  return store.getState()
}

/** A connection read the way a person reads it: the two names and what kind of connection it would be. */
function named(project: Project, implied: readonly ImpliedConnection[]): readonly string[] {
  const nameOf = (id: string): string =>
    id === EXTERIOR ? 'Outside' : (project.zones.find((zone) => zone.id === id)?.name ?? id)
  return implied.map(
    (each) => `${nameOf(each.a)} to ${nameOf(each.b)} (${each.kind}, ${each.rowId})`,
  )
}

const referenceCase: readonly string[] = [
  'Outside to Entry (main-door, D1)',
  'Outside to Diwaniya (door, D2)',
  'Outside to Garage bay 1 (door, D3)',
  'Entry to Formal Living (door, D5)',
  'Hallway to Family Living (door, D6)',
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
    expect(project.zones).toHaveLength(16)
    expect(named(project, impliedConnections(project.zones, project.connections))).toEqual(
      referenceCase,
    )
  })

  it('pairs each ensuite with the bedroom added immediately before it', () => {
    const project = startingProject()
    const suites = impliedConnections(project.zones, project.connections).filter(
      (each) => each.rowId === 'D19' || each.rowId === 'D21',
    )
    const at = (id: string): number => project.zones.findIndex((zone) => zone.id === id)
    expect(suites).toHaveLength(3)
    for (const suite of suites) expect(at(suite.b)).toBe(at(suite.a) + 1)
  })

  it('gives each ensuite of a two-storey rebuild the door to its own bedroom upstairs', () => {
    const project = startingProject(2)
    const suites = impliedConnections(project.zones, project.connections).filter(
      (each) => each.rowId === 'D19' || each.rowId === 'D21',
    )
    const nameOf = (id: string): string => project.zones.find((zone) => zone.id === id)?.name ?? id
    expect(suites.every((suite) => suite.storey === 1)).toBe(true)
    expect(suites.map((suite) => `${nameOf(suite.a)} to ${nameOf(suite.b)}`)).toEqual([
      'Master Bedroom to Ensuite, Master Bedroom',
      'Bedroom 1 to Ensuite, Bedroom 1',
      'Bedroom 2 to Ensuite, Bedroom 2',
    ])
  })

  it('implies nothing a second time once every implied connection is accepted', () => {
    const store = createStore(undefined, { newId: createIdGenerator(7) })
    const first = store.getState()
    for (const zone of defaultProgram(area(first.plot.polygon), first.household, 1))
      store.actions.addZone(zone)
    const project = store.getState()
    for (const each of impliedConnections(project.zones, project.connections))
      expect(store.actions.connect(each).ok).toBe(true)
    const settled = store.getState()
    expect(settled.connections).toHaveLength(referenceCase.length)
    expect(impliedConnections(settled.zones, settled.connections)).toEqual([])
  })

  it('drops an implied connection as soon as the project holds it', () => {
    const project = startingProject()
    const before = impliedConnections(project.zones, project.connections)
    const first = before[0]
    if (!first) throw new Error('the reference case implies nothing')
    const withConnection = {
      ...project,
      connections: [
        { id: 'connection-1', a: first.a, b: first.b, kind: first.kind, storey: first.storey },
      ],
    }
    const after = impliedConnections(withConnection.zones, withConnection.connections)
    expect(after).toHaveLength(before.length - 1)
    expect(after).not.toContainEqual(first)
  })
})

describe('what the table will not imply', () => {
  const zone = (id: string, type: string, storey = 0, storeysSpanned = 1): ConnectionZone => ({
    id,
    type,
    storey,
    storeysSpanned,
  })

  it('offers no second front door once the project has one', () => {
    const zones = [zone('entry', 'entry-foyer')]
    const connections = [
      { id: 'e1', a: EXTERIOR, b: 'entry', kind: 'main-door' as const, storey: 0 },
    ]
    expect(impliedConnections(zones, [])).toHaveLength(1)
    expect(impliedConnections(zones, connections)).toEqual([])
  })

  it('offers no front door when another zone already holds it', () => {
    const zones = [zone('entry', 'entry-foyer'), zone('diwaniya', 'diwaniya')]
    const connections = [
      { id: 'e1', a: EXTERIOR, b: 'other', kind: 'main-door' as const, storey: 0 },
    ]
    const implied = impliedConnections(zones, connections)
    expect(implied.map((each) => each.rowId)).toEqual(['D2'])
  })

  it('offers one front door only, however many entries there are', () => {
    const zones = [zone('entry-a', 'entry-foyer'), zone('entry-b', 'entry-foyer')]
    const frontDoors = impliedConnections(zones, []).filter((each) => each.kind === 'main-door')
    expect(frontDoors).toHaveLength(1)
  })

  it('leaves two zones on different storeys unconnected when no stair spans them', () => {
    const zones = [zone('kitchen', 'kitchen', 0), zone('dining', 'dining-room', 1)]
    expect(impliedConnections(zones, [])).toEqual([])
  })

  it('connects a stair to a zone on any storey the stair spans', () => {
    const zones = [zone('hall', 'hallway', 1), zone('stair', 'stair', 0, 2)]
    const implied = impliedConnections(zones, [])
    expect(implied).toEqual([{ a: 'hall', b: 'stair', kind: 'open', storey: 1, rowId: 'D26' }])
  })

  it('meets the outside on the lowest storey a zone stands on', () => {
    const zones = [zone('garage', 'garage', 2)]
    expect(impliedConnections(zones, [])).toEqual([
      { a: EXTERIOR, b: 'garage', kind: 'door', storey: 2, rowId: 'D3' },
    ])
  })
})

describe('pairing', () => {
  const zone = (id: string, type: string): ConnectionZone => ({
    id,
    type,
    storey: 0,
    storeysSpanned: 1,
  })

  it('gives a hub one connection per zone it serves', () => {
    const zones = [
      zone('hall', 'hallway'),
      zone('bed-1', 'bedroom'),
      zone('bed-2', 'bedroom'),
      zone('bed-3', 'bedroom'),
    ]
    const implied = impliedConnections(zones, []).filter((each) => each.rowId === 'D24')
    expect(implied.map((each) => each.b)).toEqual(['bed-1', 'bed-2', 'bed-3'])
  })

  it('gives an auxiliary zone to the nearest zone before it, and to one row only', () => {
    const zones = [
      zone('bed-1', 'bedroom'),
      zone('master', 'master-bedroom'),
      zone('ensuite-1', 'ensuite-bathroom'),
    ]
    const implied = impliedConnections(zones, []).filter((each) => each.b === 'ensuite-1')
    expect(implied).toEqual([
      { a: 'master', b: 'ensuite-1', kind: 'door', storey: 0, rowId: 'D19' },
    ])
  })

  it('leaves an auxiliary zone alone when no zone of its kind comes before it', () => {
    const zones = [zone('ensuite-1', 'ensuite-bathroom'), zone('bed-1', 'bedroom')]
    expect(impliedConnections(zones, [])).toEqual([])
  })

  it('is the same list every time it is asked', () => {
    const project = startingProject()
    const once = impliedConnections(project.zones, project.connections)
    expect(impliedConnections(project.zones, project.connections)).toEqual(once)
  })
})

describe('the hallway as a hub', () => {
  const zone = (id: string, type: string, storey = 0, storeysSpanned = 1): ConnectionZone => ({
    id,
    type,
    storey,
    storeysSpanned,
  })

  it('offers each hallway the stair, the bedrooms and the bathrooms of its own floor', () => {
    const zones = [
      zone('entry', 'entry-foyer'),
      zone('stair', 'stair', 0, 2),
      zone('ground-hall', 'hallway'),
      zone('first-hall', 'hallway', 1),
      zone('master', 'master-bedroom', 1),
      zone('bed', 'bedroom', 1),
      zone('bath', 'bathroom', 1),
    ]
    const about = (id: string): readonly string[] =>
      impliedConnections(zones, [])
        .filter((each) => each.a === id || each.b === id)
        .map((each) => `${each.a} to ${each.b} (${each.kind}, ${each.rowId}) on ${each.storey}`)
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
    const upstairs = project.zones.find((each) => each.name === 'First Hallway')
    const nameOf = (id: string): string => project.zones.find((each) => each.id === id)?.name ?? id
    expect(upstairs).toBeDefined()
    expect(
      named(
        project,
        impliedConnections(project.zones, project.connections).filter(
          (each) => each.a === upstairs?.id || each.b === upstairs?.id,
        ),
      ),
    ).toEqual([
      'First Hallway to Master Bedroom (door, D23)',
      'First Hallway to Bedroom 1 (door, D24)',
      'First Hallway to Bedroom 2 (door, D24)',
      'First Hallway to Stair (open, D26)',
    ])
    expect(nameOf(project.zones[2]?.id ?? '')).toBe('Ground Hallway')
  })
})
