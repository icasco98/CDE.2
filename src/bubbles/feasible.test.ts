import { describe, expect, it } from 'vitest'
import { area, pointInPolygon, type Polygon } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Household, type Project } from '../model'
import { defaultProgram, feasibility, impliedConnections, kerbFor, roomTypeById } from '../rulebook'
import { correctContacts } from './correction'
import { groundOf } from './ground'
import { createState, layoutFor, settle, type SimulationState } from './simulation'
import { touching } from './tension'

/*
 * The suite of decision 21: programs known to be feasible on their plots, settled from the
 * canonical start, every link touching after the correction. It is the test that says the tool
 * keeps its promise about links, and it ships with the tool.
 */

const starting: Polygon = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
]

/** A corner plot: the same ground with a second street down its western boundary. */
const cornerStreets = [2, 3]

function villa(
  storeys: number,
  household: Partial<Household> = {},
  polygon: Polygon = starting,
  street: readonly number[] = [2],
): Project {
  const store = createStore(undefined, { newId: createIdGenerator(11) })
  for (let level = 1; level < storeys; level++) store.actions.addStorey()
  store.actions.setPlot({ on: true, polygon, north: 0, street })
  store.actions.setHousehold({ ...store.getState().household, ...household })
  const opened = store.getState()
  for (const each of defaultProgram(area(polygon), opened.household, storeys))
    store.actions.addRoom(each)
  for (const link of impliedConnections(store.getState().rooms, store.getState().edges))
    store.actions.connect({ a: link.a, b: link.b, kind: link.kind, storey: link.storey })
  return received(store)
}

/** The rooms an entry receives into, which a corridor takes over when the entry's wall is short. */
const receptions: readonly string[] = ['formal-living', 'family-living', 'guest-wc']

/**
 * The fix the brief asks for, taken. The rulebook's default connections open the formal living
 * room, the family living room and the guest WC off an eight-metre entry, and eight square metres
 * of room has not the wall for that many doors on top of the front door, the stair and the
 * corridor. Moving them onto the corridor is what a corridor is for, and it is what makes these
 * programs ones a bubble diagram can really draw.
 */
function received(store: ReturnType<typeof createStore>): Project {
  const before = store.getState()
  const entry = before.rooms.find((room) => room.type === 'entry-foyer')
  const hall = before.rooms.find((room) => room.type === 'hallway' && room.storey === 0)
  if (!entry || !hall) return before
  for (const edge of before.edges) {
    const far = edge.a === entry.id ? edge.b : edge.b === entry.id ? edge.a : null
    const kind = before.rooms.find((room) => room.id === far)?.type
    if (!far || !kind) continue
    // The stair already opens off the corridor, so the entry's own door to it simply goes.
    if (kind === 'stair') {
      store.actions.disconnect(edge.id)
      continue
    }
    if (!receptions.includes(kind)) continue
    store.actions.disconnect(edge.id)
    store.actions.connect({ a: hall.id, b: far, kind: edge.kind, storey: 0 })
  }
  return store.getState()
}

/** The whole run a person sees: the canonical start, the settle, and then the correction. */
function pictureOf(project: Project): SimulationState {
  const ground = groundOf(project.plot, project.site)
  const layout = layoutFor(project.weights)
  const state = createState(
    project.rooms.map((room) => ({
      ...room,
      kind: room.type,
      ...(roomTypeById(room.type)?.tier === undefined
        ? {}
        : { tier: roomTypeById(room.type)?.tier }),
    })),
    project.edges.filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR),
    ground,
  )
  return correctContacts(settle(state, layout).state, layout).state
}

const suite: readonly { readonly name: string; readonly project: Project }[] = [
  // A small household on one floor. The villa a rebuild gives has 334 m² of rooms on the 365 m²
  // the setbacks leave, which circles cannot pack, so the one-storey case is a house that fits.
  { name: 'a small household on one storey', project: villa(1, { bedrooms: 2, cars: 1 }) },
  { name: 'the default program on two storeys', project: villa(2) },
  {
    // Staff and two cars ask for more ground than the starting plot has, so this one is a
    // twenty-two by thirty, which is still inside the Municipality's smaller setback band.
    name: 'a household with a maid and a driver',
    project: villa(2, { maid: true, driver: true }, [
      [0, 0],
      [22, 0],
      [22, 30],
      [0, 30],
    ]),
  },
  {
    name: 'a corner plot with two streets',
    project: villa(2, {}, starting, cornerStreets),
  },
]

describe('the feasible suite', () => {
  for (const { name, project } of suite) {
    describe(name, () => {
      const picture = pictureOf(project)

      const findings = feasibility(project.rooms, project.edges, project.plot, project.storeys)

      it('is a brief the tool finds nothing wrong with', () => {
        expect(findings).toEqual([])
      })

      it('has every link touching', () => {
        const open: string[] = []
        for (const link of picture.links) {
          const a = picture.bodies[link.a]
          const b = picture.bodies[link.b]
          if (!a || !b || touching(a, b)) continue
          const nameOf = (id: string) => project.rooms.find((room) => room.id === id)?.name ?? id
          open.push(`${nameOf(a.id)} to ${nameOf(b.id)}`)
        }
        expect(open).toEqual([])
      })

      it('stands every walled room on its own kerb', () => {
        const sides = groundOf(project.plot, project.site).sides
        for (const body of picture.bodies) {
          const kerb = body.kind === undefined ? undefined : kerbFor(body.kind, sides)
          if (!kerb) continue
          const along =
            (body.x - kerb.from[0]) * (kerb.to[0] - kerb.from[0]) +
            (body.y - kerb.from[1]) * (kerb.to[1] - kerb.from[1])
          const run = Math.hypot(kerb.to[0] - kerb.from[0], kerb.to[1] - kerb.from[1]) ** 2
          const at = Math.min(1, Math.max(0, along / run))
          const onX = kerb.from[0] + (kerb.to[0] - kerb.from[0]) * at
          const onY = kerb.from[1] + (kerb.to[1] - kerb.from[1]) * at
          // Standing against the kerb is standing a radius in from it, and never off it.
          expect(Math.hypot(body.x - onX, body.y - onY)).toBeCloseTo(body.radius, 3)
        }
      })

      it('holds every bubble inside the buildable line, a corridor by both its ends', () => {
        const inside = groundOf(project.plot, project.site).inside
        for (const body of picture.bodies) {
          const dx = Math.cos(body.angle) * body.half
          const dy = Math.sin(body.angle) * body.half
          for (const end of [
            [body.x - dx, body.y - dy],
            [body.x + dx, body.y + dy],
          ] as const)
            expect(pointInPolygon(inside.polygon, [end[0], end[1]])).toBe(true)
        }
      })

      it('gives the same picture on a second run', () => {
        const again = pictureOf(project)
        for (const [index, body] of picture.bodies.entries()) {
          const other = again.bodies[index]
          expect(other?.x).toBeCloseTo(body.x, 9)
          expect(other?.y).toBeCloseTo(body.y, 9)
        }
      })
    })
  }
})
