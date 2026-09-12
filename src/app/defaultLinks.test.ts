import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, EXTERIOR, type Store } from '../model'
import { defaultProgram } from '../rulebook'
import { connectDefaults, removedLinks } from './defaultLinks'

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

  it('never offers again a pair the designer has taken out', () => {
    rebuild()
    const project = store.getState()
    const link = project.edges.find((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR)
    if (!link) throw new Error('the rebuild made no link between two rooms')
    store.actions.disconnect(link.id)
    removedLinks.remember(project.id, link.a, link.b)

    store.transaction(() => connectDefaults(store))
    expect(store.getState().edges.some((edge) => edge.id === link.id)).toBe(false)
    expect(
      store
        .getState()
        .edges.some(
          (edge) =>
            (edge.a === link.a && edge.b === link.b) || (edge.a === link.b && edge.b === link.a),
        ),
    ).toBe(false)
  })

  it('forgets what was taken out of another project, because a new project starts clean', () => {
    removedLinks.remember('project-1', 'a', 'b')
    expect(removedLinks.holds('project-1', 'a', 'b')).toBe(true)
    expect(removedLinks.holds('project-2', 'a', 'b')).toBe(false)
    expect(removedLinks.holds('project-1', 'a', 'b')).toBe(false)
  })
})
