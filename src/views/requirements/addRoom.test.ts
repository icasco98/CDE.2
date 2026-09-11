import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { addRoomWithCompanion } from './addRoom'

let store: Store

/** The plot a project opens on: 20 by 25 metres. */
const plotArea = 500

const names = (): readonly string[] => store.getState().rooms.map((room) => room.name)

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(13) })
})

describe('adding a room from the program', () => {
  it('brings the companion the table names, and one undo removes the pair', () => {
    expect(addRoomWithCompanion(store, 'bedroom', plotArea, 1).ok).toBe(true)
    expect(names()).toEqual(['Bedroom', 'Ensuite Bathroom, Bedroom'])
    expect(store.getState().rooms.map((room) => room.type)).toEqual(['bedroom', 'ensuite-bathroom'])
    store.undo()
    expect(names()).toEqual([])
  })

  it('gives the companion the storey of the room it serves and its own typical area', () => {
    addRoomWithCompanion(store, 'diwaniya', plotArea, 1)
    const [diwaniya, wc] = store.getState().rooms
    expect(wc).toMatchObject({ type: 'diwaniya-wc', storey: diwaniya?.storey, targetArea: 5 })
  })

  it('adds one room when the table names no companion', () => {
    addRoomWithCompanion(store, 'kitchen', plotArea, 1)
    expect(names()).toEqual(['Kitchen'])
  })

  it('stands a stair on the ground and reaches it up every storey the house has', () => {
    store.actions.addStorey()
    addRoomWithCompanion(store, 'stair', plotArea, store.getState().storeys)
    expect(store.getState().rooms[0]).toMatchObject({ storey: 0, storeysSpanned: 2 })
  })
})
