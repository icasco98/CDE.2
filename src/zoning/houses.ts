import { createState, groundOf, layoutFor, settle } from '../bubbles'
import { area, type Polygon } from '../geometry'
import {
  createIdGenerator,
  createStore,
  EXTERIOR,
  type Household,
  type Bubble,
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

/**
 * The programs the morph is measured on: the bubbles' own feasible suite, each with the storeys
 * its zones are read on. Both halves of the morph are judged on the same houses, so a change that
 * helps one plan and spoils another is seen at once.
 */
export const suite: readonly {
  readonly name: string
  readonly project: () => Project
  readonly storeys: number
}[] = [
  { name: 'the default program on one storey', project: () => villa(1), storeys: 1 },
  { name: 'the default program on two storeys', project: () => villa(2), storeys: 2 },
  {
    name: 'a small household on one storey',
    project: () =>
      villa(1, { bedrooms: 2, cars: 1 }, [
        [0, 0],
        [22, 0],
        [22, 28],
        [0, 28],
      ]),
    storeys: 1,
  },
  {
    name: 'a household with a maid and a driver',
    project: () =>
      villa(
        2,
        { maid: true, driver: true },
        [
          [0, 0],
          [22, 0],
          [22, 30],
          [0, 30],
        ],
        [2, 3],
      ),
    storeys: 2,
  },
  {
    name: 'a corner plot with two streets',
    project: () =>
      villa(
        2,
        {},
        [
          [0, 0],
          [24, 0],
          [24, 25],
          [0, 25],
        ],
        [2, 3],
      ),
    storeys: 2,
  },
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

/** The project with every bubble where the settle leaves it. */
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
  const rested = settle(state, layout).state
  const at = new Map(
    rested.bodies.map((body) => [
      body.id,
      { x: body.x, y: body.y, ...(body.half > 0 ? { angle: body.angle } : {}) },
    ]),
  )
  const rooms: readonly Room[] = project.rooms.map((room) => ({
    ...room,
    ...(at.has(room.id) ? { bubble: at.get(room.id) as Bubble } : {}),
  }))
  return { ...project, rooms }
}
