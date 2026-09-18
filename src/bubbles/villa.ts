/**
 * The default villa the bubbles are measured on: the program rebuilt from the household and the
 * rulebook's links as edges, settled the way a person would have it in front of them.
 */

import { area, type Polygon } from '../geometry'
import { createIdGenerator, createStore, type Household, type Project } from '../model'
import { defaultProgram, impliedConnections } from '../rulebook'

/** The plot the tool opens on. */
const startingPlot: Polygon = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
]

export function villa(
  storeys: number,
  household: Partial<Household> = {},
  polygon: Polygon = startingPlot,
  street: readonly number[] = [2],
): Project {
  const store = createStore(undefined, { newId: createIdGenerator(11) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  store.actions.setPlot({ on: true, polygon, north: 0, street })
  store.actions.setHousehold({ ...store.getState().household, ...household })
  for (const each of defaultProgram(area(polygon), store.getState().household, storeys))
    store.actions.addRoom(each)
  for (const link of impliedConnections(store.getState().rooms, store.getState().edges))
    store.actions.connect({ a: link.a, b: link.b, kind: link.kind, storey: link.storey })
  return store.getState()
}
