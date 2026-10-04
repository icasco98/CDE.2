import type { IdGenerator } from './ids'
import {
  PROJECT_VERSION,
  type Actor,
  type Apart,
  type Declined,
  type Connection,
  type Household,
  type Plot,
  type Project,
  type Zone,
} from './types'

/** The floor-to-floor height a storey opens at, in metres. */
export const STARTING_HEIGHT_M = 3.5

/** What undo restores: zones, connections, keep-apart pairs, declined suggestions, plot, storeys, heights and household. */
export type Snapshot = {
  readonly zones: readonly Zone[]
  readonly connections: readonly Connection[]
  readonly apart: readonly Apart[]
  readonly declined: readonly Declined[]
  readonly plot: Plot
  readonly storeys: number
  readonly heights: readonly number[]
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
  cars: 1,
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
    zones: [],
    connections: [],
    apart: [],
    declined: [],
    actors: [],
    version: PROJECT_VERSION,
  }
}

export function snapshotOf(project: Project): Snapshot {
  const { zones, connections, apart, declined, plot, storeys, heights, household } = project
  return { zones, connections, apart, declined, plot, storeys, heights, household }
}

export function restore(project: Project, snapshot: Snapshot): Project {
  return { ...project, ...snapshot }
}

export function findZone(project: Project, id: string): Zone | undefined {
  return project.zones.find((zone) => zone.id === id)
}

export function findActor(project: Project, id: string): Actor | undefined {
  return project.actors.find((actor) => actor.id === id)
}

export function patchZone(project: Project, id: string, patch: Partial<Zone>): Project {
  return {
    ...project,
    zones: project.zones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
  }
}

export function patchActor(project: Project, id: string, patch: Partial<Actor>): Project {
  return {
    ...project,
    actors: project.actors.map((actor) => (actor.id === id ? { ...actor, ...patch } : actor)),
  }
}

/**
 * Deleting a zone deletes its connections, its keep-apart pairs and the suggestions declined for it, and
 * drops it from every actor's route.
 */
export function dropZone(project: Project, id: string): Project {
  return {
    ...project,
    zones: project.zones.filter((zone) => zone.id !== id),
    connections: project.connections.filter(
      (connection) => connection.a !== id && connection.b !== id,
    ),
    apart: project.apart.filter((pair) => pair.a !== id && pair.b !== id),
    declined: project.declined.filter((pair) => pair.a !== id && pair.b !== id),
    actors: project.actors.map((actor) =>
      actor.waypoints.includes(id)
        ? { ...actor, waypoints: actor.waypoints.filter((waypoint) => waypoint !== id) }
        : actor,
    ),
  }
}

/** A zone's footprint is absent while it is unplaced, so it is rebuilt without one. */
export function withoutFootprint(zone: Zone): Zone {
  return {
    id: zone.id,
    name: zone.name,
    type: zone.type,
    storey: zone.storey,
    storeysSpanned: zone.storeysSpanned,
    targetArea: zone.targetArea,
    pinned: zone.pinned,
    ...(zone.bubble === undefined ? {} : { bubble: zone.bubble }),
  }
}
