import { describe, expect, it } from 'vitest'
import { createIdGenerator, createStore } from '../../model'
import { createLinks } from './linkedUndo'

function house() {
  const store = createStore(undefined, { newId: createIdGenerator(5) })
  const add = (type: string) => {
    const made = store.actions.addZone({ type, targetArea: 16 })
    if (!made.ok) throw new Error('refused')
    return made.value
  }
  const kitchen = add('kitchen')
  const dining = add('dining-room')
  return { store, kitchen, dining }
}

const connections = (store: ReturnType<typeof house>['store']) =>
  store.getState().connections.length

describe('a door placed with its connection, undone and redone as one step', () => {
  it('takes the connection back when the sheet step goes, and brings it again when it returns', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.connection(3, { connection: made.value, a: kitchen, b: dining, kind: 'door' })
    links.undone(3)
    expect(connections(store)).toBe(0)
    // The project's own undo took it, so the zones added before are untouched.
    expect(store.getState().zones).toHaveLength(2)
    links.redone(3)
    expect(connections(store)).toBe(1)
  })

  it('takes out only its own connection when the project has moved on since', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.connection(1, { connection: made.value, a: kitchen, b: dining, kind: 'door' })
    store.actions.rename(kitchen, 'Pantry')
    links.undone(1)
    expect(connections(store)).toBe(0)
    expect(store.getState().zones[0]?.name).toBe('Pantry')
  })

  it('forgets a step the sheet has written over', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.connection(2, { connection: made.value, a: kitchen, b: dining, kind: 'door' })
    links.prune(2)
    links.undone(2)
    expect(connections(store)).toBe(1)
  })
})

describe('a zone the sheet made, joined to the program as one step with it', () => {
  const court = { id: 'x1', type: 'courtyard', name: 'Court', targetArea: 9, storey: 0 }

  it('takes the zone out of the program when the sheet step goes, and back when it returns', () => {
    const { store } = house()
    const links = createLinks(store)
    store.actions.addZone({ ...court })
    links.zones(4, [court])
    links.undone(4)
    expect(store.getState().zones.map((zone) => zone.id)).not.toContain('x1')
    expect(store.getState().zones).toHaveLength(2)
    links.redone(4)
    expect(store.getState().zones.find((zone) => zone.id === 'x1')?.name).toBe('Court')
  })

  it('takes out only its own zone when the project has moved on since', () => {
    const { store, kitchen } = house()
    const links = createLinks(store)
    store.actions.addZone({ ...court })
    links.zones(1, [court])
    store.actions.rename(kitchen, 'Pantry')
    links.undone(1)
    expect(store.getState().zones.map((zone) => zone.name)).toEqual(['Pantry', 'dining-room'])
  })
})
