import type { IdGenerator } from './ids'
import {
  PROJECT_VERSION,
  type Actor,
  type Edge,
  type Plot,
  type Project,
  type Room,
  type Weights,
} from './types'

/** What undo restores: rooms, edges, plot and weights, and nothing else. */
export type Snapshot = {
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly plot: Plot
  readonly weights: Weights
}

export const emptyPlot: Plot = { on: '', polygon: [], north: 0, street: [] }

export function emptyProject(newId: IdGenerator, name = 'Untitled'): Project {
  return {
    id: newId('project'),
    name,
    storeys: 1,
    plot: emptyPlot,
    rooms: [],
    edges: [],
    weights: {},
    actors: [],
    version: PROJECT_VERSION,
  }
}

export function snapshotOf(project: Project): Snapshot {
  const { rooms, edges, plot, weights } = project
  return { rooms, edges, plot, weights }
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

/** A room's footprint is absent while it is unplaced, so it is deleted rather than set to nothing. */
export function withoutFootprint(room: Room): Room {
  const { footprint: _footprint, ...rest } = room
  return rest
}
