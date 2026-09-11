import { describe, expect, it } from 'vitest'
import { area } from '../../geometry'
import { createIdGenerator, createStore, type Store } from '../../model'
import { defaultProgram } from '../../rulebook'
import { addHallway } from './addHallway'

/** The starting household on the starting plot, rebuilt over this many storeys. */
function rebuilt(storeys: number): Store {
  const store = createStore(undefined, { newId: createIdGenerator(7) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  const project = store.getState()
  for (const room of defaultProgram(area(project.plot.polygon), project.household, storeys))
    store.actions.addRoom(room)
  return store
}

const namesOf = (store: Store): readonly string[] => store.getState().rooms.map((room) => room.name)

describe('a hallway added on the Bubbles tab', () => {
  it('leaves the program reading as it did before the hallway was lost', () => {
    const store = rebuilt(2)
    const whole = namesOf(store)
    const upstairs = store.getState().rooms.find((room) => room.name === 'First Hallway')
    if (!upstairs) throw new Error('the rebuild laid no hallway upstairs')

    expect(store.actions.removeRoom(upstairs.id).ok).toBe(true)
    expect(namesOf(store)).not.toEqual(whole)
    expect(addHallway(store, store.getState().rooms, 1, 2).ok).toBe(true)
    expect(namesOf(store)).toEqual(whole)
  })

  it('sizes it from the rooms standing on that storey at the moment it is added', () => {
    const store = rebuilt(2)
    const ground = store.getState().rooms.find((room) => room.name === 'Ground Hallway')
    const kitchen = store.getState().rooms.find((room) => room.name === 'Kitchen')
    if (!ground || !kitchen) throw new Error('the rebuild is not the one this test reads')
    expect(store.actions.removeRoom(ground.id).ok).toBe(true)
    expect(store.actions.removeRoom(kitchen.id).ok).toBe(true)

    expect(addHallway(store, store.getState().rooms, 0, 2).ok).toBe(true)
    const added = store.getState().rooms.find((room) => room.name === 'Ground Hallway')
    // 214 m² served less the 20 m² kitchen, a tenth of it.
    expect(added?.targetArea).toBe(19.4)
  })

  it('stands it on the end of a program that has neither a stair nor an entry', () => {
    const store = createStore(undefined, { newId: createIdGenerator(7) })
    expect(store.actions.addRoom({ type: 'bedroom', name: 'Bedroom 1', targetArea: 18 }).ok).toBe(
      true,
    )
    expect(store.actions.addRoom({ type: 'bedroom', name: 'Bedroom 2', targetArea: 18 }).ok).toBe(
      true,
    )
    expect(addHallway(store, store.getState().rooms, 0, 1).ok).toBe(true)
    expect(namesOf(store)).toEqual(['Bedroom 1', 'Bedroom 2', 'Hallway'])
  })
})
