import { correctContacts, createState, groundOf, layoutFor, settle } from '../bubbles'
import { area, type Polygon } from '../geometry'
import {
  createIdGenerator,
  createStore,
  EXTERIOR,
  type Household,
  type Project,
  type Room,
} from '../model'
import { defaultProgram, impliedConnections, roomTypeById } from '../rulebook'

/*
 * The houses the partition is measured on: the same programs the bubbles' own feasible suite
 * settles, built from the program and settled the way a person settles them, so a zone is judged
 * against the diagram a person would really have in front of them.
 */

/** The plot the tool opens on. */
export const startingPlot: Polygon = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
]

/** A project with the program rebuilt from the household and the rulebook's links as edges. */
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

/** The project with every bubble where the settle and the contact correction leave it. */
export function settled(project: Project): Project {
  const ground = groundOf(project.plot, project.site)
  const layout = layoutFor(project.weights)
  const state = createState(
    project.rooms.map((room) => {
      const kind = roomTypeById(room.type)
      return {
        ...room,
        kind: room.type,
        ...(kind?.tier === undefined ? {} : { tier: kind.tier }),
      }
    }),
    project.edges
      .filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR)
      .map((edge) => ({ a: edge.a, b: edge.b, storey: edge.storey })),
    ground,
  )
  const rested = correctContacts(settle(state, layout).state, layout).state
  const at = new Map(rested.bodies.map((body) => [body.id, { x: body.x, y: body.y }]))
  const rooms: readonly Room[] = project.rooms.map((room) => ({
    ...room,
    ...(at.has(room.id) ? { bubble: at.get(room.id) as { x: number; y: number } } : {}),
  }))
  return { ...project, rooms }
}
