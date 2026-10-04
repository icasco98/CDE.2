import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, EXTERIOR, type Store } from '../model'
import { defaultProgram } from '../rulebook'
import { connectDefaults, restoreSuggested, takeOut } from './connectionDefaults'

let store: Store

/** The starting household on the starting plot, as Rebuild program lays it out. */
function rebuild(): void {
  const project = store.getState()
  store.transaction(() => {
    for (const zone of defaultProgram(500, project.household, project.storeys))
      store.actions.addZone(zone)
    return connectDefaults(store)
  })
}

const connectionNames = (): readonly string[] => {
  const project = store.getState()
  const nameOf = (id: string): string =>
    id === EXTERIOR ? 'Outside' : (project.zones.find((zone) => zone.id === id)?.name ?? id)
  return project.connections.map(
    (connection) => `${nameOf(connection.a)} to ${nameOf(connection.b)}`,
  )
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(21) })
})

describe('the default connections made in the project', () => {
  it('gives a rebuilt program the connections the rulebook expects, as real connections', () => {
    rebuild()
    expect(connectionNames()).toContain('Outside to Entry')
    expect(connectionNames()).toContain('Kitchen to Dining Room')
    expect(connectionNames()).toContain('Hallway to Master Bedroom')
    expect(
      store.getState().connections.filter((connection) => connection.kind === 'main-door'),
    ).toHaveLength(1)
  })

  it('is one step to undo, zones and connections together', () => {
    rebuild()
    expect(store.getState().connections.length).toBeGreaterThan(0)
    store.undo()
    expect(store.getState().zones).toEqual([])
    expect(store.getState().connections).toEqual([])
  })

  it('adds nothing a second time when nothing has changed', () => {
    rebuild()
    const before = store.getState().connections.length
    store.transaction(() => connectDefaults(store))
    expect(store.getState().connections).toHaveLength(before)
  })

  it('connects a zone added afterwards to what the table expects it to touch', () => {
    rebuild()
    const before = store.getState().connections.length
    const added = store.actions.addZone({ type: 'laundry', name: 'Laundry', targetArea: 8 })
    store.transaction(() => connectDefaults(store))
    expect(added.ok).toBe(true)
    expect(store.getState().connections.length).toBeGreaterThan(before)
    expect(connectionNames()).toContain('Kitchen to Laundry')
  })

  it('never offers again a suggestion the designer has taken out, and restores it on asking', () => {
    rebuild()
    const project = store.getState()
    const taken = project.connections.find(
      (connection) => connection.a !== EXTERIOR && connection.b !== EXTERIOR,
    )
    if (!taken) throw new Error('the rebuild made no connection between two zones')
    const joined = () =>
      store
        .getState()
        .connections.some(
          (connection) =>
            (connection.a === taken.a && connection.b === taken.b) ||
            (connection.a === taken.b && connection.b === taken.a),
        )
    store.transaction(() => takeOut(store, taken.id))
    expect(store.getState().declined).toEqual([{ a: taken.a, b: taken.b }])

    store.transaction(() => connectDefaults(store))
    expect(joined()).toBe(false)

    store.transaction(() => restoreSuggested(store, taken.b))
    expect(joined()).toBe(true)
    expect(store.getState().declined).toEqual([])
  })

  it('restores one zone’s declined suggestions and leaves the others declined', () => {
    rebuild()
    const inside = store
      .getState()
      .connections.filter((connection) => connection.a !== EXTERIOR && connection.b !== EXTERIOR)
    const one = inside[0]
    const two = inside.find(
      (connection) =>
        ![one?.a, one?.b].includes(connection.a) && ![one?.a, one?.b].includes(connection.b),
    )
    if (!one || !two) throw new Error('the rebuild made no two connections apart')
    store.transaction(() => takeOut(store, one.id))
    store.transaction(() => takeOut(store, two.id))
    store.transaction(() => restoreSuggested(store, one.a))
    expect(store.getState().declined).toEqual([{ a: two.a, b: two.b }])
  })

  it('keeps nothing declined for a connection the rulebook never suggested', () => {
    rebuild()
    const project = store.getState()
    const [first, second] = project.zones
    if (!first || !second) throw new Error('no zones')
    const unconnected = project.zones.find(
      (zone) =>
        zone.id !== first.id &&
        !project.connections.some(
          (connection) =>
            (connection.a === first.id && connection.b === zone.id) ||
            (connection.b === first.id && connection.a === zone.id),
        ),
    )
    if (!unconnected) throw new Error('every zone is connected to the first')
    const made = store.actions.connect({ a: first.id, b: unconnected.id, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    store.transaction(() => takeOut(store, made.value))
    expect(store.getState().declined).toEqual([])
  })
})
