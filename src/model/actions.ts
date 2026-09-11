import { checkProject, occupiedStoreys } from './invariants'
import type { IdGenerator } from './ids'
import {
  STARTING_HEIGHT_M,
  dropRoom,
  findActor,
  findRoom,
  patchActor,
  patchRoom,
  withoutFootprint,
  emptyProject,
} from './project'
import {
  EXTERIOR,
  ok,
  refused,
  type Bubble,
  type EdgeKind,
  type Endpoint,
  type Household,
  type Plot,
  type Project,
  type Result,
  type Room,
  type WallHint,
  type Weights,
} from './types'
import type { Footprint } from '../geometry/types'
// The table, not the store, says which kinds stand on every storey. The import reaches past the
// rulebook's index because that index imports the model back.
import { spansAllStoreys } from '../rulebook/sizes'

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
  const room = findRoom(project, endpoint)
  return room ? occupiedStoreys(room) : []
}

function sharedStorey(project: Project, a: Endpoint, b: Endpoint): number | undefined {
  const onB = storeysOf(project, b)
  return storeysOf(project, a).find((storey) => onB.includes(storey))
}

/** A stair or a lift stands on every storey it serves, so it grows and shrinks with the house. */
function spanningEveryStorey(rooms: readonly Room[], storeys: number): readonly Room[] {
  return rooms.map((room) =>
    spansAllStoreys(room.type) && room.storey === 0 && room.storeysSpanned !== storeys
      ? { ...room, storeysSpanned: storeys }
      : room,
  )
}

export function createActions(context: Context) {
  const { settle, newId } = context
  const state = context.project

  function onRoom(id: string, mode: Mode, change: (project: Project) => Project): Result {
    const project = state()
    if (!findRoom(project, id)) return missing('room', id)
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

    addRoom(input: {
      type: string
      targetArea: number
      name?: string
      storey?: number
      storeysSpanned?: number
    }): Result<string> {
      if (!positive(input.targetArea)) return badArea
      const project = state()
      const room = {
        id: newId('room'),
        name: input.name ?? input.type,
        type: input.type,
        storey: input.storey ?? 0,
        storeysSpanned: input.storeysSpanned ?? 1,
        targetArea: input.targetArea,
        pinned: false,
      }
      const result = settle({ ...project, rooms: [...project.rooms, room] })
      return result.ok ? ok(room.id) : result
    },

    removeRoom: (id: string): Result => onRoom(id, 'record', (project) => dropRoom(project, id)),

    rename: (id: string, name: string): Result =>
      onRoom(id, 'record', (project) => patchRoom(project, id, { name })),

    setType: (id: string, type: string): Result =>
      onRoom(id, 'record', (project) => patchRoom(project, id, { type })),

    setTargetArea: (id: string, targetArea: number): Result =>
      positive(targetArea)
        ? onRoom(id, 'record', (project) => patchRoom(project, id, { targetArea }))
        : badArea,

    setStorey: (id: string, storey: number, storeysSpanned?: number): Result =>
      onRoom(id, 'record', (project) =>
        patchRoom(project, id, {
          storey,
          ...(storeysSpanned === undefined ? {} : { storeysSpanned }),
        }),
      ),

    setBubble: (id: string, bubble: Bubble, commit: Commit = 'commit'): Result =>
      onRoom(id, commit === 'commit' ? 'record' : 'preview', (project) =>
        patchRoom(project, id, { bubble }),
      ),

    place: (id: string, footprint: Footprint, commit: Commit = 'commit'): Result =>
      onRoom(id, commit === 'commit' ? 'record' : 'preview', (project) =>
        patchRoom(project, id, { footprint }),
      ),

    unplace: (id: string): Result =>
      onRoom(id, 'record', (project) => ({
        ...project,
        rooms: project.rooms.map((room) => (room.id === id ? withoutFootprint(room) : room)),
      })),

    pin: (id: string): Result =>
      onRoom(id, 'record', (project) => patchRoom(project, id, { pinned: true })),

    unpin: (id: string): Result =>
      onRoom(id, 'record', (project) => patchRoom(project, id, { pinned: false })),

    connect(input: {
      a: Endpoint
      b: Endpoint
      kind: EdgeKind
      storey?: number
      hint?: WallHint
    }): Result<string> {
      const project = state()
      const edge = {
        id: newId('edge'),
        a: input.a,
        b: input.b,
        kind: input.kind,
        storey: input.storey ?? sharedStorey(project, input.a, input.b) ?? 0,
        ...(input.hint === undefined ? {} : { hint: input.hint }),
      }
      const result = settle({ ...project, edges: [...project.edges, edge] })
      return result.ok ? ok(edge.id) : result
    },

    disconnect(edgeId: string): Result {
      const project = state()
      if (!project.edges.some((edge) => edge.id === edgeId)) return missing('edge', edgeId)
      return settle({ ...project, edges: project.edges.filter((edge) => edge.id !== edgeId) })
    },

    setPlot: (plot: Plot): Result => settle({ ...state(), plot }),

    setNorth: (north: number): Result => settle({ ...state(), plot: { ...state().plot, north } }),

    setStreet: (street: readonly number[]): Result =>
      settle({ ...state(), plot: { ...state().plot, street } }),

    setWeights: (weights: Weights): Result => settle({ ...state(), weights }),

    setHousehold: (household: Household): Result => settle({ ...state(), household }),

    /** A new storey opens at the height of the one below it, so a house of tall rooms stays tall. */
    addStorey(): Result {
      const project = state()
      const top = project.heights[project.heights.length - 1] ?? STARTING_HEIGHT_M
      const storeys = project.storeys + 1
      return settle(
        {
          ...project,
          storeys,
          heights: [...project.heights, top],
          rooms: spanningEveryStorey(project.rooms, storeys),
        },
        'aside',
      )
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
      const rooms = spanningEveryStorey(project.rooms, top)
      const inUse =
        rooms.some((room) => occupiedStoreys(room).includes(top)) ||
        project.edges.some((edge) => edge.storey === top)
      if (inUse)
        return refused({
          code: 'storey-in-use',
          message: `storey ${top} still holds rooms or edges`,
        })
      return settle(
        { ...project, storeys: top, heights: project.heights.slice(0, top), rooms },
        'aside',
      )
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

    addWaypoint(actorId: string, roomId: string): Result {
      const project = state()
      const actor = findActor(project, actorId)
      if (!actor) return missing('actor', actorId)
      if (!findRoom(project, roomId)) return missing('room', roomId)
      return settle(
        patchActor(project, actorId, { waypoints: [...actor.waypoints, roomId] }),
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
