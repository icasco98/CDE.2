import { describe, expect, it } from 'vitest'
import { createIdGenerator, createStore } from '../../model'
import { createLinks } from './linkedUndo'

function house() {
  const store = createStore(undefined, { newId: createIdGenerator(5) })
  const add = (type: string) => {
    const made = store.actions.addRoom({ type, targetArea: 16 })
    if (!made.ok) throw new Error('refused')
    return made.value
  }
  const kitchen = add('kitchen')
  const dining = add('dining-room')
  return { store, kitchen, dining }
}

const edges = (store: ReturnType<typeof house>['store']) => store.getState().edges.length

describe('a door placed with its connection, undone and redone as one step', () => {
  it('takes the edge back when the sheet step goes, and brings it again when it returns', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.add({ depth: 3, edge: made.value, a: kitchen, b: dining, kind: 'door' })
    links.undone(3)
    expect(edges(store)).toBe(0)
    // The project's own undo took it, so the rooms added before are untouched.
    expect(store.getState().rooms).toHaveLength(2)
    links.redone(3)
    expect(edges(store)).toBe(1)
  })

  it('takes out only its own edge when the project has moved on since', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.add({ depth: 1, edge: made.value, a: kitchen, b: dining, kind: 'door' })
    store.actions.rename(kitchen, 'Pantry')
    links.undone(1)
    expect(edges(store)).toBe(0)
    expect(store.getState().rooms[0]?.name).toBe('Pantry')
  })

  it('forgets a step the sheet has written over', () => {
    const { store, kitchen, dining } = house()
    const links = createLinks(store)
    const made = store.actions.connect({ a: kitchen, b: dining, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    links.add({ depth: 2, edge: made.value, a: kitchen, b: dining, kind: 'door' })
    links.prune(2)
    links.undone(2)
    expect(edges(store)).toBe(1)
  })
})
