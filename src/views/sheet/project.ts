/**
 * Where the project's brief and the zoning sheet meet: the program the sheet draws is the project's
 * rooms, and a room added, taken out or moved on the sheet is added, taken out or moved in the
 * project. The two tables of kinds are not the same table, so this is also the one place that says
 * which room-type of the rulebook is which kind of the sheet.
 */

import { area } from '../../geometry'
import type { Plot, Room as ProjectRoom, Result, Store } from '../../model'
import { standingOf, typicalArea } from '../../rulebook'
import {
  KINDS,
  MAX_STOREYS,
  SIDES,
  followProgram,
  plotFrom,
  storeyOf,
  type Category,
  type PlotSpec,
  type ProgramRoom,
  type Room,
  type Sheet,
  type Side,
} from '../../sheet'

/** The room-type of the rulebook as a kind of the sheet; anything else is drawn as a plain room. */
const KIND_OF: Readonly<Record<string, string>> = {
  'womens-reception': 'women-reception',
  'ensuite-bathroom': 'ensuite',
  'dressing-room': 'dressing',
  'office-study': 'office',
  'prayer-room': 'prayer',
  garage: 'car-bay',
  'room-other': 'room',
  'roof-annex': 'room',
  lift: 'stair',
}

/** The kind of the sheet as a room-type of the rulebook, for a room the sheet hands back. */
const TYPE_OF: Readonly<Record<string, string>> = {
  'women-reception': 'womens-reception',
  ensuite: 'ensuite-bathroom',
  dressing: 'dressing-room',
  office: 'office-study',
  prayer: 'prayer-room',
  'car-bay': 'garage',
  room: 'room-other',
  garden: 'courtyard',
  court: 'courtyard',
}

export const kindFor = (type: string): string => {
  const kind = KIND_OF[type] ?? type
  return kind in KINDS ? kind : 'room'
}

export const typeFor = (kind: string): string => TYPE_OF[kind] ?? kind

const catFor = (kind: string): Category => KINDS[kind]?.cat ?? 'shared'

/** The project's rooms as the sheet's program, in the project's order, which is the order of importance. */
export function programOf(rooms: readonly ProjectRoom[]): readonly ProgramRoom[] {
  return rooms.map((room): ProgramRoom => {
    const kind = kindFor(room.type)
    return {
      id: room.id,
      name: room.name,
      kind,
      cat: catFor(kind),
      target: room.targetArea,
      storey: Math.max(0, Math.trunc(room.storey)),
    }
  })
}

/** Which side of the sheet a side of the plot polygon lies along, or none when it lies across. */
function sideAlong(
  from: readonly number[],
  to: readonly number[],
  box: { w: number; h: number },
): Side | null {
  const on = (a: number, b: number, at: number) =>
    Math.abs(a - at) < 0.01 && Math.abs(b - at) < 0.01
  if (on(from[0] ?? 0, to[0] ?? 0, 0)) return 'west'
  if (on(from[0] ?? 0, to[0] ?? 0, box.w)) return 'east'
  if (on(from[1] ?? 0, to[1] ?? 0, 0)) return 'north'
  if (on(from[1] ?? 0, to[1] ?? 0, box.h)) return 'street'
  return null
}

/**
 * The project's plot as the sheet draws one: its size from the boundary, its north, and the sides
 * the project marks as streets. A project whose plot has no area gives the sheet nothing, and the
 * fresh brief's corner plot stands.
 */
export function plotOf(plot: Plot): PlotSpec | null {
  const polygon = plot.polygon
  if (polygon.length < 3 || area(polygon) <= 0) return null
  const xs = polygon.map(([x]) => x)
  const ys = polygon.map(([, y]) => y)
  const box = {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    north: plot.north,
    streets: [] as Side[],
  }
  if (!(box.w > 0 && box.h > 0)) return null
  const streets = new Set<Side>()
  for (const index of plot.street) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    if (!from || !to) continue
    const side = sideAlong(from, to, box)
    if (side) streets.add(side)
  }
  return plotFrom({ ...box, streets: SIDES.filter((side) => streets.has(side)) })
}

/** What writing the program needs of the session, so a test can hand it a plain store. */
type Writing = Pick<Store, 'transaction' | 'actions' | 'getState'>

/** The rooms of the sheet's program, in order: the blocks a person sees in the tray. */
const programRooms = (rooms: readonly Room[]): readonly Room[] => rooms.filter((r) => !r.extra)

/**
 * The project's room that stands for a room of the sheet: the one with its id, else the one at its
 * place in the program, which is how a sheet whose program was just taken up finds its rooms.
 */
function roomIn(store: Writing, rooms: readonly Room[], id: string): string | null {
  const project = store.getState()
  if (project.rooms.some((room) => room.id === id)) return id
  const at = programRooms(rooms).findIndex((r) => r.id === id)
  return at < 0 ? null : (project.rooms[at]?.id ?? null)
}

const clampStorey = (storey: number, storeys: number) =>
  Math.max(0, Math.min(Math.max(1, storeys) - 1, Math.trunc(storey)))

/**
 * A project with no program takes up the sheet's, so the two are one list from then on: a person who
 * has drawn on the sample and then adds a room finds the whole program in Requirements, not one room.
 */
function takeUpProgram(store: Writing, rooms: readonly Room[]): Result | null {
  if (store.getState().rooms.length > 0) return null
  const program = programRooms(rooms)
  // The rooms keep their ids and the storeys they stand on, so the drawing is untouched by this.
  const wanted = Math.min(MAX_STOREYS, Math.max(...program.map((r) => storeyOf(r) + 1), 1))
  while (store.getState().storeys < wanted) {
    const grown = store.actions.addStorey()
    if (!grown.ok) return grown
  }
  const storeys = store.getState().storeys
  for (const r of program) {
    const added = store.actions.addRoom({
      id: r.id,
      type: typeFor(r.kind),
      name: r.name,
      targetArea: r.target,
      storey: clampStorey(storeyOf(r), storeys),
      storeysSpanned: 1,
    })
    if (!added.ok) return added
  }
  return null
}

/** A room added on the sheet: it goes into the project's program, and the sheet follows it back. */
export function addToProgram(
  store: Writing,
  rooms: readonly Room[],
  input: { kind: string; name: string; target: number },
): Result {
  return store.transaction(() => {
    const stopped = takeUpProgram(store, rooms)
    if (stopped) return stopped
    const project = store.getState()
    const type = typeFor(input.kind)
    const standing = standingOf(type, project.storeys)
    const added = store.actions.addRoom({
      type,
      name: input.name.trim() || undefined,
      targetArea: input.target > 0 ? input.target : typicalArea(type, area(project.plot.polygon)),
      storey: clampStorey(standing.storey, project.storeys),
      storeysSpanned: Math.min(standing.storeysSpanned, project.storeys),
    })
    return added.ok ? undefined : added
  })
}

/** A room taken out of the program on the sheet: out of the project, and off the sheet with it. */
export function removeFromProgram(store: Writing, rooms: readonly Room[], id: string): Result {
  return store.transaction(() => {
    const stopped = takeUpProgram(store, rooms)
    if (stopped) return stopped
    const found = roomIn(store, rooms, id)
    return found ? store.actions.removeRoom(found) : undefined
  })
}

/** The order of importance changed on the sheet: the project's list is what holds it. */
export function moveInProgram(
  store: Writing,
  rooms: readonly Room[],
  id: string,
  before: string | null,
): Result {
  return store.transaction(() => {
    const stopped = takeUpProgram(store, rooms)
    if (stopped) return stopped
    const found = roomIn(store, rooms, id)
    if (!found) return undefined
    const ahead = before === null ? null : roomIn(store, rooms, before)
    return store.actions.moveRoom(found, ahead)
  })
}

/** Whether the plot the project gives is the plot the sheet already stands on. */
const samePlot = (one: PlotSpec, other: PlotSpec): boolean =>
  one.w === other.w &&
  one.h === other.h &&
  one.north === other.north &&
  one.streets.join() === other.streets.join()

/**
 * The sheet as the project asks for it: standing on the project's plot, drawing the project's
 * program. Where the two disagree the project wins, and a room it does not name is kept aside.
 */
export function followProject(
  sheet: Sheet,
  program: readonly ProgramRoom[],
  plot: PlotSpec | null,
): Sheet {
  const stood = !plot || samePlot(plot, sheet.plot) ? sheet : { ...sheet, plot }
  return followProgram(stood, program).sheet
}
