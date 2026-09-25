/**
 * The program the sheet draws: the rooms the brief asks for, in the order of importance, as the
 * project holds them, and the edges its doors draw. The sheet follows both exactly — a room in the
 * brief keeps whatever the hand has done to it, a room the brief no longer names leaves the sheet,
 * and a door whose edge is gone goes with it — and nothing here knows what a project is: the caller
 * hands over the list and the edges, and keeps what was set down so an undo can give it back.
 */

import {
  cloneRoom,
  doorsOf,
  storeyOf,
  type Category,
  type Door,
  type Room,
  type Settings,
  type Sheet,
} from './model'
import { sizeFor } from './kinds'

/** One room of the brief, as the sheet reads it. */
export type ProgramRoom = {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly cat: Category
  readonly target: number
  readonly storey: number
}

/** A door the sheet set down with the room that held it, so it can stand there again. */
export type HeldDoor = { readonly host: string; readonly door: Door }

/** What following the brief took off the sheet, and what it may put back. */
export type SetDown = { readonly rooms: readonly Room[]; readonly doors: readonly HeldDoor[] }

/** A room of the brief the sheet has not drawn yet: sized from its target, waiting in the program. */
export function roomFromProgram(entry: ProgramRoom, settings: Settings): Room {
  const size = sizeFor(entry.kind, entry.target, settings)
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    cat: entry.cat,
    target: entry.target,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    angle: 0,
    pieces: null,
    storey: entry.storey,
    placed: false,
  }
}

/** A room of the brief the sheet already holds: the brief's words and target, the sheet's drawing. */
function follow(held: Room, entry: ProgramRoom, settings: Settings): Room {
  const r = cloneRoom(held)
  r.id = entry.id
  r.name = entry.name
  r.kind = entry.kind
  r.cat = entry.cat
  r.target = entry.target
  // A room already drawn keeps its footprint and the storey it stands on; the sentence reads the
  // new target against the area it has. One still waiting takes the brief's size and storey.
  if (!r.placed) {
    const size = sizeFor(entry.kind, entry.target, settings)
    r.w = size.w
    r.h = size.h
    r.storey = entry.storey
  }
  return r
}

/** What following the brief may change about a room, so a sheet already in line is left alone. */
const sameRoom = (one: Room, other: Room): boolean =>
  one.id === other.id &&
  one.name === other.name &&
  one.kind === other.kind &&
  one.cat === other.cat &&
  one.target === other.target &&
  one.w === other.w &&
  one.h === other.h &&
  one.storey === other.storey &&
  doorsOf(one).length === doorsOf(other).length

/**
 * The sheet brought in line with the brief: the brief's rooms in the brief's order and nothing else,
 * each door drawing an edge the project still holds. What was set down aside earlier comes back when
 * the brief names its room or holds its edge again, which is how an undo in the brief is followed.
 */
export function followProgram(
  sheet: Sheet,
  program: readonly ProgramRoom[],
  edges: ReadonlySet<string>,
  aside: SetDown = { rooms: [], doors: [] },
): { readonly sheet: Sheet; readonly setDown: SetDown } {
  const taken = new Set<string>()
  const rooms: Room[] = []
  for (const entry of program) {
    // A room is the brief's by its id alone: a room of the same name is another room.
    const held =
      sheet.rooms.find((r) => r.id === entry.id && !taken.has(r.id)) ??
      aside.rooms.find((r) => r.id === entry.id) ??
      null
    if (held) taken.add(held.id)
    rooms.push(held ? follow(held, entry, sheet.settings) : roomFromProgram(entry, sheet.settings))
  }
  const setDownRooms = sheet.rooms.filter((held) => !taken.has(held.id)).map(cloneRoom)
  const setDownDoors: HeldDoor[] = []
  const standing = new Set(rooms.flatMap((r) => doorsOf(r).map((d) => d.id)))
  for (const r of rooms) {
    const kept = doorsOf(r).filter((d) => edges.has(d.edge))
    for (const d of doorsOf(r)) if (!edges.has(d.edge)) setDownDoors.push({ host: r.id, door: d })
    const back = aside.doors.filter(
      (held) =>
        held.host === r.id &&
        edges.has(held.door.edge) &&
        !standing.has(held.door.id) &&
        !rooms.some((o) => doorsOf(o).some((d) => d.edge === held.door.edge)),
    )
    const doors = [...kept, ...back.map((held) => ({ ...held.door }))]
    if (doors.length) r.doors = doors
    else delete r.doors
  }
  const storeys = Math.max(sheet.storeyCount, ...rooms.map((r) => storeyOf(r) + 1))
  const still =
    storeys === sheet.storeyCount &&
    rooms.length === sheet.rooms.length &&
    rooms.every((r, i) => sameRoom(r, sheet.rooms[i]!))
  return {
    sheet: still ? sheet : { ...sheet, rooms, storeyCount: storeys },
    setDown: { rooms: setDownRooms, doors: setDownDoors },
  }
}
