import type { IdGenerator } from './ids'
import {
  PROJECT_VERSION,
  type Actor,
  type Edge,
  type Household,
  type Plot,
  type Project,
  type Room,
  type Weights,
} from './types'

/** The floor-to-floor height a storey opens at, in metres. */
export const STARTING_HEIGHT_M = 3.5

/** What undo restores: rooms, edges, plot, storeys, heights, weights and household, and nothing else. */
export type Snapshot = {
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly plot: Plot
  readonly storeys: number
  readonly heights: readonly number[]
  readonly weights: Weights
  readonly household: Household
}

/** The plot a project opens on, wound as `rectangleToPolygon` winds one: side 0 north, side 2 south. */
export const startingPlot: Plot = {
  // A house is drawn on a plot from the first frame, so the boundary binds until a person says not.
  on: true,
  polygon: [
    [0, 0],
    [20, 0],
    [20, 25],
    [0, 25],
  ],
  north: 0,
  street: [2],
}

export const startingHousehold: Household = {
  familySize: 4,
  bedrooms: 3,
  cars: 2,
  maid: false,
  driver: false,
  womensReception: false,
  masterOnGround: false,
}

export function emptyProject(newId: IdGenerator, name = 'Untitled'): Project {
  return {
    id: newId('project'),
    name,
    storeys: 1,
    heights: [STARTING_HEIGHT_M],
    plot: startingPlot,
    household: startingHousehold,
    rooms: [],
    edges: [],
    weights: {},
    actors: [],
    version: PROJECT_VERSION,
  }
}

export function snapshotOf(project: Project): Snapshot {
  const { rooms, edges, plot, storeys, heights, weights, household } = project
  return { rooms, edges, plot, storeys, heights, weights, household }
}

export function restore(project: Project, snapshot: Snapshot): Project {
  return { ...project, ...snapshot }
}

export function findRoom(project: Project, id: string): Room | undefined {
  return project.rooms.find((room) => room.id === id)
}

export function findActor(project: Project, id: string): Actor | undefined {
  return project.actors.find((actor) => actor.id === id)
}

export function patchRoom(project: Project, id: string, patch: Partial<Room>): Project {
  return {
    ...project,
    rooms: project.rooms.map((room) => (room.id === id ? { ...room, ...patch } : room)),
  }
}

export function patchActor(project: Project, id: string, patch: Partial<Actor>): Project {
  return {
    ...project,
    actors: project.actors.map((actor) => (actor.id === id ? { ...actor, ...patch } : actor)),
  }
}

/** Deleting a room deletes its edges and drops it from every actor's route. */
export function dropRoom(project: Project, id: string): Project {
  return {
    ...project,
    rooms: project.rooms.filter((room) => room.id !== id),
    edges: project.edges.filter((edge) => edge.a !== id && edge.b !== id),
    actors: project.actors.map((actor) =>
      actor.waypoints.includes(id)
        ? { ...actor, waypoints: actor.waypoints.filter((waypoint) => waypoint !== id) }
        : actor,
    ),
  }
}

/** A room's footprint is absent while it is unplaced, so it is rebuilt without one. */
export function withoutFootprint(room: Room): Room {
  return {
    id: room.id,
    name: room.name,
    type: room.type,
    storey: room.storey,
    storeysSpanned: room.storeysSpanned,
    targetArea: room.targetArea,
    pinned: room.pinned,
    ...(room.bubble === undefined ? {} : { bubble: room.bubble }),
  }
}
