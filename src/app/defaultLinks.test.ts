import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, EXTERIOR, type Store } from '../model'
import { defaultProgram } from '../rulebook'
import { connectDefaults, restoreSuggested, takeOut } from './defaultLinks'

let store: Store

/** The starting household on the starting plot, as Rebuild program lays it out. */
function rebuild(): void {
  const project = store.getState()
  store.transaction(() => {
    for (const room of defaultProgram(500, project.household, project.storeys))
      store.actions.addRoom(room)
    return connectDefaults(store)
  })
}

const linkNames = (): readonly string[] => {
  const project = store.getState()
  const nameOf = (id: string): string =>
    id === EXTERIOR ? 'Outside' : (project.rooms.find((room) => room.id === id)?.name ?? id)
  return project.edges.map((edge) => `${nameOf(edge.a)} to ${nameOf(edge.b)}`)
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(21) })
})

describe('the default connections as edges', () => {
  it('gives a rebuilt program the links the rulebook expects, as real edges', () => {
    rebuild()
    expect(linkNames()).toContain('Outside to Entry')
    expect(linkNames()).toContain('Kitchen to Dining Room')
    expect(linkNames()).toContain('Hallway to Master Bedroom')
    expect(store.getState().edges.filter((edge) => edge.kind === 'main-door')).toHaveLength(1)
  })

  it('is one step to undo, rooms and links together', () => {
    rebuild()
    expect(store.getState().edges.length).toBeGreaterThan(0)
    store.undo()
    expect(store.getState().rooms).toEqual([])
    expect(store.getState().edges).toEqual([])
  })

  it('adds nothing a second time when nothing has changed', () => {
    rebuild()
    const before = store.getState().edges.length
    store.transaction(() => connectDefaults(store))
    expect(store.getState().edges).toHaveLength(before)
  })

  it('links a room added afterwards to what the table expects it to touch', () => {
    rebuild()
    const before = store.getState().edges.length
    const added = store.actions.addRoom({ type: 'laundry', name: 'Laundry', targetArea: 8 })
    store.transaction(() => connectDefaults(store))
    expect(added.ok).toBe(true)
    expect(store.getState().edges.length).toBeGreaterThan(before)
    expect(linkNames()).toContain('Kitchen to Laundry')
  })

  it('never offers again a suggestion the designer has taken out, and restores it on asking', () => {
    rebuild()
    const project = store.getState()
    const link = project.edges.find((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR)
    if (!link) throw new Error('the rebuild made no link between two rooms')
    const joined = () =>
      store
        .getState()
        .edges.some(
          (edge) =>
            (edge.a === link.a && edge.b === link.b) || (edge.a === link.b && edge.b === link.a),
        )
    store.transaction(() => takeOut(store, link.id))
    expect(store.getState().declined).toEqual([{ a: link.a, b: link.b }])

    store.transaction(() => connectDefaults(store))
    expect(joined()).toBe(false)

    store.transaction(() => restoreSuggested(store, link.b))
    expect(joined()).toBe(true)
    expect(store.getState().declined).toEqual([])
  })

  it('restores one room’s declined suggestions and leaves the others declined', () => {
    rebuild()
    const inside = store
      .getState()
      .edges.filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR)
    const one = inside[0]
    const two = inside.find(
      (edge) => ![one?.a, one?.b].includes(edge.a) && ![one?.a, one?.b].includes(edge.b),
    )
    if (!one || !two) throw new Error('the rebuild made no two links apart')
    store.transaction(() => takeOut(store, one.id))
    store.transaction(() => takeOut(store, two.id))
    store.transaction(() => restoreSuggested(store, one.a))
    expect(store.getState().declined).toEqual([{ a: two.a, b: two.b }])
  })

  it('keeps nothing declined for a connection the rulebook never suggested', () => {
    rebuild()
    const project = store.getState()
    const [first, second] = project.rooms
    if (!first || !second) throw new Error('no rooms')
    const unlinked = project.rooms.find(
      (room) =>
        room.id !== first.id &&
        !project.edges.some(
          (edge) =>
            (edge.a === first.id && edge.b === room.id) ||
            (edge.b === first.id && edge.a === room.id),
        ),
    )
    if (!unlinked) throw new Error('every room is linked to the first')
    const made = store.actions.connect({ a: first.id, b: unlinked.id, kind: 'door' })
    if (!made.ok) throw new Error('refused')
    store.transaction(() => takeOut(store, made.value))
    expect(store.getState().declined).toEqual([])
  })
})
