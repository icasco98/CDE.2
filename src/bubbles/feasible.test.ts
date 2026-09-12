import { describe, expect, it } from 'vitest'
import { area, pointInPolygon, type Polygon } from '../geometry'
import { createIdGenerator, createStore, EXTERIOR, type Household, type Project } from '../model'
import {
  bandFor,
  defaultProgram,
  feasibility,
  impliedConnections,
  kerbFor,
  nearestOn,
  roomTypeById,
} from '../rulebook'
import { correctContacts } from './correction'
import { groundOf } from './ground'
import {
  closestBetween,
  createState,
  type Body,
  layoutFor,
  settle,
  shareAStorey,
  type SimulationState,
} from './simulation'
import { gapBetween } from './capsule'
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
  { name: 'the default program on one storey', project: villa(1) },
  { name: 'the default program on two storeys', project: villa(2) },
  {
    // Staff and two cars ask for more ground than the starting plot has, so this one is a
    // twenty-two by thirty; and staff arrive at a side door, so it is a corner, which gives the
    // service entrance a kerb of its own and leaves the entry's own stretch of street to the
    // garage and the rooms that receive from it.
    name: 'a household with a maid and a driver',
    project: villa(
      2,
      { maid: true, driver: true },
      [
        [0, 0],
        [22, 0],
        [22, 30],
        [0, 30],
      ],
      cornerStreets,
    ),
  },
  {
    name: 'a corner plot with two streets',
    project: villa(2, {}, starting, cornerStreets),
  },
]

function nameOf(project: Project, id: string): string {
  return project.rooms.find((room) => room.id === id)?.name ?? id
}

/** Every pair of a picture's bodies that share a floor, with how they stand to one another. */
function pairsOf(
  picture: SimulationState,
): readonly { a: Body; b: Body; gap: number; past: number }[] {
  const out: { a: Body; b: Body; gap: number; past: number }[] = []
  for (const [index, a] of picture.bodies.entries())
    for (let other = index + 1; other < picture.bodies.length; other++) {
      const b = picture.bodies[other]
      if (!b || !shareAStorey(a, b)) continue
      const { distance } = gapBetween(
        { x: a.x, y: a.y, angle: a.angle, half: a.half },
        { x: b.x, y: b.y, angle: b.angle, half: b.half },
        index + other,
      )
      out.push({ a, b, gap: distance, past: closestBetween(a, b) - distance })
    }
  return out
}

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
          open.push(`${nameOf(project, a.id)} to ${nameOf(project, b.id)}`)
        }
        expect(open).toEqual([])
      })

      it('leaves no two rooms resting past the quarter', () => {
        const deep: string[] = []
        for (const pair of pairsOf(picture)) {
          const { a, b, past } = pair
          // A corridor is not a room and is measured on its own terms below. Between two rooms the
          // quarter holds to within a tenth of the smaller one's radius, which is the step the
          // projection takes and no more: a pair a hair inside each other is a pair at rest.
          if (a.half > 0 || b.half > 0) continue
          if (past <= Math.min(a.radius, b.radius) / 10) continue
          deep.push(`${nameOf(project, a.id)} in ${nameOf(project, b.id)} by ${past.toFixed(2)}`)
        }
        expect(deep).toEqual([])
      })

      it('leaves no room standing in a corridor', () => {
        const inside: string[] = []
        for (const { a, b, gap } of pairsOf(picture)) {
          // A room stands along a corridor, and may lie a little into it as any pair may. What it
          // may never do is stand in it: its middle is always clear of the corridor's own width.
          const corridor = a.half > 0 ? a : b.half > 0 ? b : undefined
          if (!corridor || (a.half > 0 && b.half > 0)) continue
          if (gap >= corridor.radius) continue
          const room = corridor === a ? b : a
          inside.push(`${nameOf(project, room.id)} in ${nameOf(project, corridor.id)}`)
        }
        expect(inside).toEqual([])
      })

      it('keeps the diwaniya within one room-depth of its street', () => {
        const sides = groundOf(project.plot, project.site).sides
        for (const body of picture.bodies) {
          const band = body.kind === undefined ? undefined : bandFor(body.kind, sides)
          if (!band) continue
          const on = nearestOn(band, body.x, body.y)
          // The owner's ruling: the near rim is a diameter from the line at the furthest, which is
          // a middle three radii from it. Behind the garage is outside the band by any reading.
          const rim = Math.hypot(body.x - on[0], body.y - on[1]) - body.radius
          expect(rim).toBeLessThanOrEqual(2 * body.radius + 0.01)
        }
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
