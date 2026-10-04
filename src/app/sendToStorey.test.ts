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
    for (const zone of defaultProgram(500, project.household, project.storeys))
      store.actions.addZone(zone)
    return connectDefaults(store)
  })
}

const idOf = (name: string): string => {
  const zone = store.getState().zones.find((each) => each.name === name)
  if (!zone) throw new Error(`there is no ${name}`)
  return zone.id
}

const storeyOf = (name: string): number =>
  store.getState().zones.find((zone) => zone.name === name)?.storey ?? -1

/** Everything the named zone is joined to, in the words the program calls those zones by. */
const linksOf = (name: string): readonly string[] => {
  const project = store.getState()
  const id = idOf(name)
  const nameOf = (each: string): string =>
    each === EXTERIOR ? 'Outside' : (project.zones.find((zone) => zone.id === each)?.name ?? each)
  return project.connections
    .filter((connection) => connection.a === id || connection.b === id)
    .map((connection) => nameOf(connection.a === id ? connection.b : connection.a))
}

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(21) })
  rebuild()
})

describe('a zone sent to another storey', () => {
  it('takes the zones it owns with it', () => {
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    expect(storeyOf('Master Bedroom')).toBe(1)
    expect(storeyOf('Ensuite, Master Bedroom')).toBe(1)
  })

  it('loses the links it can no longer hold and finds the ones upstairs', () => {
    expect(linksOf('Master Bedroom')).toContain('Ground Hallway')
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    expect(linksOf('Master Bedroom')).not.toContain('Ground Hallway')
    expect(linksOf('Master Bedroom')).toContain('First Hallway')
    // The suite is one zone and its bathroom wherever it stands, so that link is made again.
    expect(linksOf('Master Bedroom')).toContain('Ensuite, Master Bedroom')
  })

  it('is one step to undo, the move and the links together', () => {
    const before = store.getState()
    expect(sendToStorey(store, idOf('Master Bedroom'), 1).ok).toBe(true)
    store.undo()
    expect(store.getState().zones).toEqual(before.zones)
    expect(store.getState().connections).toEqual(before.connections)
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

  it('says so when there is no such zone', () => {
    expect(sendToStorey(store, 'zone_nothing', 1).ok).toBe(false)
  })
})
