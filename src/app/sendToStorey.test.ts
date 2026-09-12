import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, EXTERIOR, type Store } from '../model'
import { defaultProgram } from '../rulebook'
import { connectDefaults } from './defaultLinks'
import { sendToStorey } from './sendToStorey'

let store: Store

/** A house of two storeys with the parents downstairs, as Rebuild program lays that household out. */
function rebuild(): void {
  store.actions.addStorey()
  store.actions.setHousehold({ ...store.getState().household, masterOnGround: true })
  const project = store.getState()
  store.transaction(() => {
    for (const room of defaultProgram(500, project.household, project.storeys))
      store.actions.addRoom(room)
    return connectDefaults(store)
  })
}

const idOf = (name: string): string => {
  const room = store.getState().rooms.find((each) => each.name === name)
  if (!room) throw new Error(`there is no ${name}`)
  return room.id
}

const storeyOf = (name: string): number =>
  store.getState().rooms.find((room) => room.name === name)?.storey ?? -1

/** Everything the named room is joined to, in the words the program calls those rooms by. */
const linksOf = (name: string): readonly string[] => {
  const project = store.getState()
  const id = idOf(name)
  const nameOf = (each: string): string =>
    each === EXTERIOR ? 'Outside' : (project.rooms.find((room) => room.id === each)?.name ?? each)
  return project.edges
    .filter((edge) => edge.a === id || edge.b === id)
    .map((edge) => nameOf(edge.a === id ? edge.b : edge.a))
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(21) })
  rebuild()
})

describe('a room sent to another storey', () => {
  it('takes the rooms it owns with it', () => {
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    expect(storeyOf('Master Bedroom')).toBe(1)
    expect(storeyOf('Ensuite, Master Bedroom')).toBe(1)
  })

  it('loses the links it can no longer hold and finds the ones upstairs', () => {
    expect(linksOf('Master Bedroom')).toContain('Ground Hallway')
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    expect(linksOf('Master Bedroom')).not.toContain('Ground Hallway')
    expect(linksOf('Master Bedroom')).toContain('First Hallway')
    // The suite is one room and its bathroom wherever it stands, so that link is made again.
    expect(linksOf('Master Bedroom')).toContain('Ensuite, Master Bedroom')
  })

  it('is one step to undo, the move and the links together', () => {
    const before = store.getState()
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    store.undo()
    expect(store.getState().rooms).toEqual(before.rooms)
    expect(store.getState().edges).toEqual(before.edges)
  })

  it('keeps a door to the outside, which stands on every storey', () => {
    expect(sendToStorey(store, idOf('Diwaniya'), 1).ok).toBe(true)
    expect(linksOf('Diwaniya')).toContain('Outside')
    expect(linksOf('Diwaniya')).toContain('Diwaniya WC')
    expect(storeyOf('Diwaniya WC')).toBe(1)
  })

  it('refuses a stair, whose span belongs to the program', () => {
    const result = sendToStorey(store, idOf('Stair'), 1)
    expect(result.ok).toBe(false)
    expect(storeyOf('Stair')).toBe(0)
  })

  it('says so when there is no such room', () => {
    expect(sendToStorey(store, 'room_nothing', 1).ok).toBe(false)
  })
})
