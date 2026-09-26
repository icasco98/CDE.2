/**
 * Where the project's brief and the zoning sheet meet: the program the sheet draws is the project's
 * rooms, and a room added, taken out or moved on the sheet is added, taken out or moved in the
 * project. The two tables of kinds are not the same table, so this is also the one place that says
 * which room-type of the rulebook is which kind of the sheet.
 */

import { area } from '../../geometry'
import { ok, type Plot, type Room as ProjectRoom, type Result, type Store } from '../../model'
import { spansAllStoreys, standingOf, typicalArea } from '../../rulebook'
import { sendRoomsToStorey, type StoreyMove } from '../../app/sendToStorey'
import {
  KINDS,
  MAX_STOREYS,
  SIDES,
  followProgram,
  plotFrom,
  storeyOf,
  type Category,
  type HeldDoor,
  type PlotSpec,
  type ProgramRoom,
  type Room,
  type SetDown,
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

const clampStorey = (storey: number, storeys: number) =>
  Math.max(0, Math.min(Math.max(1, storeys) - 1, Math.trunc(storey)))

/** A room added on the sheet: it goes into the project's program, and the sheet follows it back. */
export function addToProgram(
  store: Writing,
  input: { kind: string; name: string; target: number },
): Result {
  return store.transaction(() => {
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
export const removeFromProgram = (store: Writing, id: string): Result =>
  store.actions.removeRoom(id)

/** The order of importance changed on the sheet: the project's list is what holds it. */
export const moveInProgram = (store: Writing, id: string, before: string | null): Result =>
  store.actions.moveRoom(id, before)

/**
 * Rooms the sheet made itself — a court or a corridor given a pocket, a copy, a piece a cut split
 * off — join the program with the ids they have, so the bubbles and the program show them too. The
 * project gains the storeys they stand on. One step to undo; the ids added are given back.
 */
export function adoptRooms(store: Writing, rooms: readonly Room[]): Result<readonly string[]> {
  const known = new Set(store.getState().rooms.map((room) => room.id))
  const born = rooms.filter((r) => !known.has(r.id))
  if (!born.length) return ok([])
  const made = store.transaction(() => {
    const wanted = Math.min(MAX_STOREYS, Math.max(...born.map((r) => storeyOf(r) + 1)))
    while (store.getState().storeys < wanted) {
      const grown = store.actions.addStorey()
      if (!grown.ok) return grown
    }
    const storeys = store.getState().storeys
    for (const r of born) {
      const added = store.actions.addRoom({
        id: r.id,
        type: typeFor(r.kind),
        name: r.name,
        targetArea: r.target > 0 ? r.target : 1,
        storey: clampStorey(storeyOf(r), storeys),
        storeysSpanned: 1,
      })
      if (!added.ok) return added
    }
  })
  return made.ok ? ok(born.map((r) => r.id)) : made
}

/** A room the sheet moved to another storey: where it stood in the project and where it went. */
export type StoreyShift = { readonly id: string; readonly from: number; readonly to: number }

/**
 * Rooms the sheet step moved to another storey go there in the project too, in one step to undo,
 * by the program's own storey move: the links they can no longer hold are let go with a sentence
 * each. A companion still waiting in the program goes with its room; one drawn on the sheet stays
 * where the hand put it. The project gains the storeys they reach, its stairs stretched to the top.
 * Only rooms whose storey this step changed are read, so a room the program moved stays moved.
 */
export function followSheetStoreys(
  store: Writing,
  before: Sheet,
  after: Sheet,
): Result<{ readonly shifts: readonly StoreyShift[]; readonly letGo: readonly string[] }> {
  const project = store.getState()
  const was = new Map(before.rooms.map((r) => [r.id, r]))
  const shifts: StoreyShift[] = []
  for (const r of after.rooms) {
    const old = was.get(r.id)
    const room = project.rooms.find((each) => each.id === r.id)
    if (!old || !room || !r.placed || storeyOf(old) === storeyOf(r)) continue
    if (room.storeysSpanned > 1 || room.storey === storeyOf(r)) continue
    shifts.push({ id: r.id, from: room.storey, to: storeyOf(r) })
  }
  if (!shifts.length) return ok({ shifts, letGo: [] })
  const wanted = Math.min(MAX_STOREYS, Math.max(...shifts.map((shift) => shift.to + 1)))
  const stretch = project.rooms.filter(
    (room) =>
      spansAllStoreys(room.type) &&
      room.storey + Math.max(1, room.storeysSpanned) === project.storeys,
  )
  const grow = (): Result | void => {
    if (project.storeys >= wanted) return
    while (store.getState().storeys < wanted) {
      const added = store.actions.addStorey()
      if (!added.ok) return added
    }
    for (const room of stretch) {
      const reaching = store.actions.setStorey(room.id, room.storey, wanted - room.storey)
      if (!reaching.ok) return reaching
    }
  }
  const drawn = new Set(after.rooms.filter((r) => r.placed).map((r) => r.id))
  const moves: StoreyMove[] = shifts.map((shift) => ({ id: shift.id, storey: shift.to }))
  const moved = sendRoomsToStorey(store, moves, (companion) => !drawn.has(companion), grow)
  return moved.ok ? ok({ shifts, letGo: moved.value }) : moved
}

/** Whether the plot the project gives is the plot the sheet already stands on. */
const samePlot = (one: PlotSpec, other: PlotSpec): boolean =>
  one.w === other.w &&
  one.h === other.h &&
  one.north === other.north &&
  one.streets.join() === other.streets.join()

/**
 * What the sheet set down while following the project: the rooms the program stopped naming and the
 * doors whose edges went, with their drawing, so an undo in the project finds them where they stood.
 * It lives as long as the page, which is as long as the project's undo does.
 */
export function createAside() {
  const rooms = new Map<string, Room>()
  const doors = new Map<string, HeldDoor>()
  return {
    held: (): SetDown => ({ rooms: [...rooms.values()], doors: [...doors.values()] }),
    keep(down: SetDown, now: Sheet): void {
      for (const room of down.rooms) rooms.set(room.id, room)
      for (const held of down.doors) doors.set(held.door.id, held)
      for (const room of now.rooms) {
        rooms.delete(room.id)
        for (const door of room.doors ?? []) doors.delete(door.id)
      }
    },
  }
}

export type Aside = ReturnType<typeof createAside>

/**
 * The sheet as the project asks for it: standing on the project's plot, drawing the project's
 * program and no other room, each door drawing an edge the project holds. Where the two disagree
 * the project wins; what it no longer names is set aside for an undo to bring back.
 */
export function followProject(
  sheet: Sheet,
  program: readonly ProgramRoom[],
  plot: PlotSpec | null,
  edges: readonly { readonly id: string }[],
  aside: Aside,
): Sheet {
  const stood = !plot || samePlot(plot, sheet.plot) ? sheet : { ...sheet, plot }
  const followed = followProgram(
    stood,
    program,
    new Set(edges.map((edge) => edge.id)),
    aside.held(),
  )
  aside.keep(followed.setDown, followed.sheet)
  return followed.sheet
}
