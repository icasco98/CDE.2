import { checkProject, occupiedStoreys } from './invariants'
import type { IdGenerator } from './ids'
import {
  STARTING_HEIGHT_M,
  dropZone,
  findActor,
  findZone,
  patchActor,
  patchZone,
  withoutFootprint,
  emptyProject,
} from './project'
import {
  EXTERIOR,
  ok,
  refused,
  type Bubble,
  type ConnectionKind,
  type Endpoint,
  type Household,
  type Plot,
  type Project,
  type Result,
  type EdgeHint,
} from './types'
import type { Footprint } from '../geometry/types'

/** A drag previews as it moves and records one undo step when it is let go. */
export type Commit = 'preview' | 'commit'

/** `record` is undoable, `preview` is a gesture in flight, `aside` is outside undo. */
export type Mode = 'record' | 'preview' | 'aside'

export type Context = {
  readonly project: () => Project
  readonly settle: (next: Project, mode?: Mode) => Result
  readonly reset: (next: Project) => Result
  readonly newId: IdGenerator
}

const missing = (what: string, id: string) =>
  refused({ code: `no-such-${what}`, message: `there is no ${what} ${id}` })

const badArea = refused({ code: 'bad-area', message: 'a target area is a positive number of m²' })

function positive(area: number): boolean {
  return Number.isFinite(area) && area > 0
}

function storeysOf(project: Project, endpoint: Endpoint): readonly number[] {
  if (endpoint === EXTERIOR) return Array.from({ length: project.storeys }, (_, i) => i)
  const zone = findZone(project, endpoint)
  return zone ? occupiedStoreys(zone) : []
}

const between = (a: Endpoint, b: Endpoint) => (pair: { a: Endpoint; b: Endpoint }) =>
  (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)

function sharedStorey(project: Project, a: Endpoint, b: Endpoint): number | undefined {
  const onB = storeysOf(project, b)
  return storeysOf(project, a).find((storey) => onB.includes(storey))
}

export function createActions(context: Context) {
  const { settle, newId } = context
  const state = context.project

  function onZone(id: string, mode: Mode, change: (project: Project) => Project): Result {
    const project = state()
    if (!findZone(project, id)) return missing('zone', id)
    return settle(change(project), mode)
  }

  return {
    newProject: (name?: string): Result => context.reset(emptyProject(newId, name)),

    /** Opens a project that came from a file: it replaces the one in hand, history and all. */
    load(project: Project): Result {
      const problems = checkProject(project)
      return problems.length > 0 ? { ok: false, problems } : context.reset(project)
    },

    /** The name is the person's label for the document, not part of the design, so undo passes it by. */
    setName: (name: string): Result => settle({ ...state(), name }, 'aside'),

    addZone(input: {
      type: string
      targetArea: number
      name?: string
      storey?: number
      storeysSpanned?: number
      /** The zone this one stands behind in the program; on the end when it names no zone. */
      after?: string
      /**
       * The id to keep, for a zone that already has one elsewhere — a zone drawn on the sheet whose
       * program the project is taking up. An id the project already holds is not taken twice.
       */
      id?: string
    }): Result<string> {
      if (!positive(input.targetArea)) return badArea
      const project = state()
      const given =
        input.id !== undefined &&
        input.id !== EXTERIOR &&
        input.id.length > 0 &&
        !project.zones.some((each) => each.id === input.id)
      const zone = {
        id: given ? input.id! : newId('zone'),
        name: input.name ?? input.type,
        type: input.type,
        storey: input.storey ?? 0,
        storeysSpanned: input.storeysSpanned ?? 1,
        targetArea: input.targetArea,
        pinned: false,
      }
      const behind =
        input.after === undefined ? -1 : project.zones.findIndex((each) => each.id === input.after)
      const zones =
        behind < 0
          ? [...project.zones, zone]
          : [...project.zones.slice(0, behind + 1), zone, ...project.zones.slice(behind + 1)]
      const result = settle({ ...project, zones })
      return result.ok ? ok(zone.id) : result
    },

    removeZone: (id: string): Result => onZone(id, 'record', (project) => dropZone(project, id)),

    /**
     * The order of the zones is the order of importance, so moving a zone in the list is a change to
     * the design: the zone stands before the one named, or last when none is.
     */
    moveZone(id: string, before: string | null): Result {
      const project = state()
      const zone = findZone(project, id)
      if (!zone) return missing('zone', id)
      if (before === id)
        return refused({ code: 'move-before-itself', message: 'a zone cannot stand before itself' })
      const rest = project.zones.filter((each) => each.id !== id)
      const at = before === null ? -1 : rest.findIndex((each) => each.id === before)
      if (before !== null && at < 0) return missing('zone', before)
      const zones = at < 0 ? [...rest, zone] : [...rest.slice(0, at), zone, ...rest.slice(at)]
      return settle({ ...project, zones })
    },

    rename: (id: string, name: string): Result =>
      onZone(id, 'record', (project) => patchZone(project, id, { name })),

    setType: (id: string, type: string): Result =>
      onZone(id, 'record', (project) => patchZone(project, id, { type })),

    setTargetArea: (id: string, targetArea: number): Result =>
      positive(targetArea)
        ? onZone(id, 'record', (project) => patchZone(project, id, { targetArea }))
        : badArea,

    setStorey: (id: string, storey: number, storeysSpanned?: number): Result =>
      onZone(id, 'record', (project) =>
        patchZone(project, id, {
          storey,
          ...(storeysSpanned === undefined ? {} : { storeysSpanned }),
        }),
      ),

    setBubble: (id: string, bubble: Bubble, commit: Commit = 'commit'): Result =>
      onZone(id, commit === 'commit' ? 'record' : 'preview', (project) =>
        patchZone(project, id, { bubble }),
      ),

    place: (id: string, footprint: Footprint, commit: Commit = 'commit'): Result =>
      onZone(id, commit === 'commit' ? 'record' : 'preview', (project) =>
        patchZone(project, id, { footprint }),
      ),

    unplace: (id: string): Result =>
      onZone(id, 'record', (project) => ({
        ...project,
        zones: project.zones.map((zone) => (zone.id === id ? withoutFootprint(zone) : zone)),
      })),

    pin: (id: string): Result =>
      onZone(id, 'record', (project) => patchZone(project, id, { pinned: true })),

    unpin: (id: string): Result =>
      onZone(id, 'record', (project) => patchZone(project, id, { pinned: false })),

    connect(input: {
      a: Endpoint
      b: Endpoint
      kind: ConnectionKind
      storey?: number
      hint?: EdgeHint
    }): Result<string> {
      const project = state()
      const connection = {
        id: newId('connection'),
        a: input.a,
        b: input.b,
        kind: input.kind,
        storey: input.storey ?? sharedStorey(project, input.a, input.b) ?? 0,
        ...(input.hint === undefined ? {} : { hint: input.hint }),
      }
      const result = settle({ ...project, connections: [...project.connections, connection] })
      return result.ok ? ok(connection.id) : result
    },

    /**
     * Where a door is drawn on the edge its two zones share. It is a hint and nothing else: an
     * connection that loses it draws its door in the middle of the edge instead, as it always did.
     */
    setConnectionHint(connectionId: string, hint: EdgeHint): Result {
      const project = state()
      if (!project.connections.some((connection) => connection.id === connectionId))
        return missing('connection', connectionId)
      return settle({
        ...project,
        connections: project.connections.map((each) =>
          each.id === connectionId ? { ...each, hint } : each,
        ),
      })
    },

    /** A connection keeps its identity when its kind changes; the main door is made by connect alone. */
    setConnectionKind(connectionId: string, kind: ConnectionKind): Result {
      const project = state()
      const connection = project.connections.find((each) => each.id === connectionId)
      if (!connection) return missing('connection', connectionId)
      if (connection.kind === 'main-door' || kind === 'main-door')
        return refused({
          code: 'main-door-kind',
          message: 'the main door is made by connecting the outside, not by changing a kind',
        })
      return settle({
        ...project,
        connections: project.connections.map((each) =>
          each.id === connectionId ? { ...each, kind } : each,
        ),
      })
    },

    disconnect(connectionId: string): Result {
      const project = state()
      if (!project.connections.some((connection) => connection.id === connectionId))
        return missing('connection', connectionId)
      return settle({
        ...project,
        connections: project.connections.filter((connection) => connection.id !== connectionId),
      })
    },

    /** Two zones the program wants apart; a warning to be read, never a limit. */
    keepApart(input: { a: string; b: string }): Result<string> {
      const project = state()
      const pair = { id: newId('apart'), a: input.a, b: input.b }
      const result = settle({ ...project, apart: [...project.apart, pair] })
      return result.ok ? ok(pair.id) : result
    },

    allowTogether(id: string): Result {
      const project = state()
      if (!project.apart.some((pair) => pair.id === id)) return missing('pair', id)
      return settle({ ...project, apart: project.apart.filter((pair) => pair.id !== id) })
    },

    /** A suggested connection the person took out, kept so it is not suggested again. */
    decline(a: Endpoint, b: Endpoint): Result {
      const project = state()
      if (project.declined.some(between(a, b))) return ok(undefined)
      return settle({ ...project, declined: [...project.declined, { a, b }] })
    },

    /** The declined suggestions forgotten: every one, or those of one zone when it is named. */
    forgetDeclined(zone?: string): Result {
      const project = state()
      const kept = project.declined.filter(
        (pair) => zone !== undefined && pair.a !== zone && pair.b !== zone,
      )
      if (kept.length === project.declined.length) return ok(undefined)
      return settle({ ...project, declined: kept })
    },

    setPlot: (plot: Plot): Result => settle({ ...state(), plot }),

    setNorth: (north: number): Result => settle({ ...state(), plot: { ...state().plot, north } }),

    setStreet: (street: readonly number[]): Result =>
      settle({ ...state(), plot: { ...state().plot, street } }),

    setHousehold: (household: Household): Result => settle({ ...state(), household }),

    /** A new storey opens at the height of the one below it, so a house of tall zones stays tall. */
    addStorey(): Result {
      const project = state()
      const top = project.heights[project.heights.length - 1] ?? STARTING_HEIGHT_M
      return settle({
        ...project,
        storeys: project.storeys + 1,
        heights: [...project.heights, top],
      })
    },

    setHeight(storey: number, metres: number): Result {
      const project = state()
      if (storey < 0 || storey >= project.storeys)
        return refused({ code: 'no-such-storey', message: `there is no storey ${storey}` })
      if (!Number.isFinite(metres) || metres <= 0)
        return refused({
          code: 'height-size',
          message: 'a storey height is a positive number of metres',
        })
      return settle({
        ...project,
        heights: project.heights.map((height, level) => (level === storey ? metres : height)),
      })
    },

    removeStorey(): Result {
      const project = state()
      const top = project.storeys - 1
      if (top < 1)
        return refused({ code: 'last-storey', message: 'a project has one storey at least' })
      const inUse =
        project.zones.some((zone) => occupiedStoreys(zone).includes(top)) ||
        project.connections.some((connection) => connection.storey === top)
      if (inUse)
        return refused({
          code: 'storey-in-use',
          message: `storey ${top} still holds zones or connections`,
        })
      return settle({ ...project, storeys: top, heights: project.heights.slice(0, top) })
    },

    addActor(input: { name: string; role: string }): Result<string> {
      const project = state()
      const actor = { id: newId('actor'), name: input.name, role: input.role, waypoints: [] }
      const result = settle({ ...project, actors: [...project.actors, actor] }, 'aside')
      return result.ok ? ok(actor.id) : result
    },

    updateActor(id: string, patch: { name?: string; role?: string }): Result {
      const project = state()
      if (!findActor(project, id)) return missing('actor', id)
      return settle(patchActor(project, id, patch), 'aside')
    },

    removeActor(id: string): Result {
      const project = state()
      if (!findActor(project, id)) return missing('actor', id)
      return settle(
        { ...project, actors: project.actors.filter((actor) => actor.id !== id) },
        'aside',
      )
    },

    addWaypoint(actorId: string, zoneId: string): Result {
      const project = state()
      const actor = findActor(project, actorId)
      if (!actor) return missing('actor', actorId)
      if (!findZone(project, zoneId)) return missing('zone', zoneId)
      return settle(
        patchActor(project, actorId, { waypoints: [...actor.waypoints, zoneId] }),
        'aside',
      )
    },

    removeWaypoint(actorId: string, at: number): Result {
      const project = state()
      const actor = findActor(project, actorId)
      if (!actor) return missing('actor', actorId)
      if (at < 0 || at >= actor.waypoints.length)
        return refused({ code: 'no-such-waypoint', message: `there is no waypoint ${at}` })
      return settle(
        patchActor(project, actorId, { waypoints: actor.waypoints.filter((_, i) => i !== at) }),
        'aside',
      )
    },
  }
}

export type Actions = ReturnType<typeof createActions>
