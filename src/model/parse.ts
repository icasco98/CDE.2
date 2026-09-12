import type { Arc, Footprint, Point, Polygon } from '../geometry/types'
import { checkProject } from './invariants'
import {
  ok,
  type Actor,
  type Edge,
  type EdgeKind,
  type Household,
  type Plot,
  type Project,
  type Result,
  type Room,
  type Violation,
  type WallHint,
  type Weights,
} from './types'

export type Document = Record<string, unknown>

export function isDocument(value: unknown): value is Document {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const edgeKinds: readonly string[] = ['door', 'open', 'main-door']

/** Reads a stored document field by field, gathering every complaint before giving up. */
export function parseProject(document: Document): Result<Project> {
  const problems: Violation[] = []
  const fail = (at: string, expected: string): void => {
    problems.push({ code: 'shape', message: `${at} is not ${expected}` })
  }

  const text = (value: unknown, at: string): string => {
    if (typeof value === 'string') return value
    fail(at, 'text')
    return ''
  }
  const count = (value: unknown, at: string): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    fail(at, 'a number')
    return 0
  }
  const flag = (value: unknown, at: string): boolean => {
    if (typeof value === 'boolean') return value
    fail(at, 'true or false')
    return false
  }
  const list = (value: unknown, at: string): readonly unknown[] => {
    if (Array.isArray(value)) return value
    fail(at, 'a list')
    return []
  }
  const nested = (value: unknown, at: string): Document => {
    if (isDocument(value)) return value
    fail(at, 'a group of fields')
    return {}
  }
  const point = (value: unknown, at: string): Point => {
    const pair = list(value, at)
    return [count(pair[0], `${at}.x`), count(pair[1], `${at}.y`)]
  }
  const polygon = (value: unknown, at: string): Polygon =>
    list(value, at).map((corner, i) => point(corner, `${at}[${i}]`))

  const arc = (value: unknown, at: string): Arc => {
    const raw = nested(value, at)
    return {
      from: count(raw.from, `${at}.from`),
      to: count(raw.to, `${at}.to`),
      centre: point(raw.centre, `${at}.centre`),
      radius: count(raw.radius, `${at}.radius`),
      clockwise: flag(raw.clockwise, `${at}.clockwise`),
    }
  }

  const footprint = (value: unknown, at: string): Footprint => {
    const raw = nested(value, at)
    return {
      polygon: polygon(raw.polygon, `${at}.polygon`),
      rotation: count(raw.rotation, `${at}.rotation`),
      // A file written before rooms could curve carries no arcs and reads as it always did.
      ...(raw.arcs === undefined
        ? {}
        : { arcs: list(raw.arcs, `${at}.arcs`).map((raw, i) => arc(raw, `${at}.arcs[${i}]`)) }),
    }
  }

  const room = (value: unknown, at: string): Room => {
    const raw = nested(value, at)
    return {
      id: text(raw.id, `${at}.id`),
      name: text(raw.name, `${at}.name`),
      type: text(raw.type, `${at}.type`),
      storey: count(raw.storey, `${at}.storey`),
      storeysSpanned: count(raw.storeysSpanned, `${at}.storeysSpanned`),
      targetArea: count(raw.targetArea, `${at}.targetArea`),
      pinned: flag(raw.pinned, `${at}.pinned`),
      ...(raw.bubble === undefined
        ? {}
        : {
            bubble: {
              x: count(nested(raw.bubble, `${at}.bubble`).x, `${at}.bubble.x`),
              y: count(nested(raw.bubble, `${at}.bubble`).y, `${at}.bubble.y`),
            },
          }),
      ...(raw.footprint === undefined
        ? {}
        : { footprint: footprint(raw.footprint, `${at}.footprint`) }),
    }
  }

  const hint = (value: unknown, at: string): WallHint => ({
    at: point(nested(value, at).at, `${at}.at`),
  })

  const edge = (value: unknown, at: string): Edge => {
    const raw = nested(value, at)
    const kind = text(raw.kind, `${at}.kind`)
    if (!edgeKinds.includes(kind)) fail(`${at}.kind`, 'door, open or main-door')
    return {
      id: text(raw.id, `${at}.id`),
      a: text(raw.a, `${at}.a`),
      b: text(raw.b, `${at}.b`),
      kind: kind as EdgeKind,
      storey: count(raw.storey, `${at}.storey`),
      ...(raw.hint === undefined ? {} : { hint: hint(raw.hint, `${at}.hint`) }),
    }
  }

  const actor = (value: unknown, at: string): Actor => {
    const raw = nested(value, at)
    return {
      id: text(raw.id, `${at}.id`),
      name: text(raw.name, `${at}.name`),
      role: text(raw.role, `${at}.role`),
      waypoints: list(raw.waypoints, `${at}.waypoints`).map((waypoint, i) =>
        text(waypoint, `${at}.waypoints[${i}]`),
      ),
    }
  }

  const plotOf = (value: unknown, at: string): Plot => {
    const raw = nested(value, at)
    return {
      on: flag(raw.on, `${at}.on`),
      polygon: polygon(raw.polygon, `${at}.polygon`),
      north: count(raw.north, `${at}.north`),
      street: list(raw.street, `${at}.street`).map((side, i) => count(side, `${at}.street[${i}]`)),
    }
  }

  const householdOf = (value: unknown, at: string): Household => {
    const raw = nested(value, at)
    return {
      familySize: count(raw.familySize, `${at}.familySize`),
      bedrooms: count(raw.bedrooms, `${at}.bedrooms`),
      cars: count(raw.cars, `${at}.cars`),
      maid: flag(raw.maid, `${at}.maid`),
      driver: flag(raw.driver, `${at}.driver`),
      womensReception: flag(raw.womensReception, `${at}.womensReception`),
      masterOnGround: flag(raw.masterOnGround, `${at}.masterOnGround`),
    }
  }

  const weightsOf = (value: unknown, at: string): Weights =>
    Object.fromEntries(
      Object.entries(nested(value, at)).map(([force, weight]) => [
        force,
        count(weight, `${at}.${force}`),
      ]),
    )

  const project: Project = {
    id: text(document.id, 'id'),
    name: text(document.name, 'name'),
    storeys: count(document.storeys, 'storeys'),
    heights: list(document.heights, 'heights').map((height, i) => count(height, `heights[${i}]`)),
    plot: plotOf(document.plot, 'plot'),
    household: householdOf(document.household, 'household'),
    rooms: list(document.rooms, 'rooms').map((raw, i) => room(raw, `rooms[${i}]`)),
    edges: list(document.edges, 'edges').map((raw, i) => edge(raw, `edges[${i}]`)),
    weights: weightsOf(document.weights, 'weights'),
    actors: list(document.actors, 'actors').map((raw, i) => actor(raw, `actors[${i}]`)),
    version: count(document.version, 'version'),
  }

  const broken = problems.length > 0 ? problems : checkProject(project)
  return broken.length > 0 ? { ok: false, problems: broken } : ok(project)
}
