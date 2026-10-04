import { beforeEach, describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, type Store } from '../../model'
import { addZoneWithCompanion } from './addZone'

let store: Store

/** The plot a project opens on: 20 by 25 metres. */
const plotArea = 500

const names = (): readonly string[] => store.getState().zones.map((zone) => zone.name)

beforeEach(() => {
  store = createStore(undefined, { newId: createIdGenerator(13) })
})

describe('adding a zone from the program', () => {
  it('brings the companion the table names, and one undo removes the pair', () => {
    expect(addZoneWithCompanion(store, 'bedroom', plotArea, 1).ok).toBe(true)
    expect(names()).toEqual(['Bedroom', 'Ensuite, Bedroom'])
    expect(store.getState().zones.map((zone) => zone.type)).toEqual(['bedroom', 'ensuite-bathroom'])
    store.undo()
    expect(names()).toEqual([])
  })

  it('gives the companion the storey of the zone it serves and its own typical area', () => {
    addZoneWithCompanion(store, 'diwaniya', plotArea, 1)
    const [diwaniya, wc] = store.getState().zones
    expect(wc).toMatchObject({ type: 'diwaniya-wc', storey: diwaniya?.storey, targetArea: 5 })
  })

  it('adds one zone when the table names no companion', () => {
    addZoneWithCompanion(store, 'kitchen', plotArea, 1)
    expect(names()).toEqual(['Kitchen'])
  })

  it('brings the default connections the new zone implies, in the same step', () => {
    addZoneWithCompanion(store, 'kitchen', plotArea, 1)
    addZoneWithCompanion(store, 'dining-room', plotArea, 1)
    const [kitchen, dining] = store.getState().zones
    expect(store.getState().connections).toHaveLength(1)
    expect(store.getState().connections[0]).toMatchObject({
      a: kitchen?.id,
      b: dining?.id,
      kind: 'door',
    })
    // One click, one undo: the dining room and the door to the kitchen go together.
    store.undo()
    expect(names()).toEqual(['Kitchen'])
    expect(store.getState().connections).toEqual([])
  })

  it('stands a stair on the ground and reaches it up every storey the house has', () => {
    store.actions.addStorey()
    addZoneWithCompanion(store, 'stair', plotArea, store.getState().storeys)
    expect(store.getState().zones[0]).toMatchObject({ storey: 0, storeysSpanned: 2 })
  })

  it('puts a zone on the storey the table gives its kind', () => {
    store.actions.addStorey()
    const storeys = store.getState().storeys
    addZoneWithCompanion(store, 'bedroom', plotArea, storeys)
    addZoneWithCompanion(store, 'kitchen', plotArea, storeys)
    addZoneWithCompanion(store, 'roof-annex', plotArea, storeys)
    expect(store.getState().zones.map((zone) => [zone.name, zone.storey])).toEqual([
      ['Bedroom', 1],
      ['Ensuite, Bedroom', 1],
      ['Kitchen', 0],
      ['Roof Annex', 1],
    ])
  })
})
