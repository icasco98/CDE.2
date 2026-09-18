/**
 * The program the sheet draws: the rooms the brief asks for, in the order of importance, as the
 * project holds them. The sheet follows that list — a room in it keeps whatever the hand has done
 * to it, a room the list does not name is kept aside as the sheet's own — and nothing here knows
 * what a project is: the caller hands over the list.
 */

import { cloneRoom, storeyOf, type Category, type Room, type Settings, type Sheet } from './model'
import { sizeFor } from './sample'

/** One room of the brief, as the sheet reads it. */
export type ProgramRoom = {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly cat: Category
  readonly target: number
  readonly storey: number
}

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

/**
 * The room on the sheet that stands for a room of the brief: the one with its id, else one of the
 * same kind and name, which is how a sheet saved before the program had ids finds its rooms again.
 */
function claim(rooms: Room[], entry: ProgramRoom, taken: Set<string>): Room | null {
  const byId = rooms.find((r) => r.id === entry.id && !taken.has(r.id))
  if (byId) return byId
  return (
    rooms.find(
      (r) => !taken.has(r.id) && !r.extra && r.kind === entry.kind && r.name === entry.name,
    ) ?? null
  )
}

/** A room of the brief the sheet already holds: the brief's words and target, the sheet's drawing. */
function follow(held: Room, entry: ProgramRoom, settings: Settings): Room {
  const r = cloneRoom(held)
  r.id = entry.id
  r.name = entry.name
  r.kind = entry.kind
  r.cat = entry.cat
  r.target = entry.target
  delete r.extra
  delete r.aside
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
  one.extra === other.extra &&
  one.aside === other.aside

type Followed = {
  readonly sheet: Sheet
  /** The rooms the brief does not name, kept aside on the sheet. */
  readonly aside: readonly Room[]
}

/**
 * The sheet's program brought in line with the brief: the brief's rooms, in the brief's order, then
 * whatever else the sheet holds. A brief with no rooms in it says nothing, so the sheet keeps the
 * program it has: an owner who has not filled Requirements in still has the sample to draw on.
 */
export function followProgram(sheet: Sheet, program: readonly ProgramRoom[]): Followed {
  if (!program.length) return { sheet, aside: [] }
  const taken = new Set<string>()
  const rooms: Room[] = []
  for (const entry of program) {
    const held = claim(sheet.rooms, entry, taken)
    if (held) taken.add(held.id)
    rooms.push(held ? follow(held, entry, sheet.settings) : roomFromProgram(entry, sheet.settings))
  }
  const aside: Room[] = []
  for (const held of sheet.rooms) {
    if (taken.has(held.id)) continue
    // A court or a corridor the sheet itself made is already its own; a program room the brief has
    // dropped is set aside, so the drawing keeps it and the sentence says it is not asked for.
    const kept = cloneRoom(held)
    kept.extra = true
    if (!held.extra) kept.aside = true
    rooms.push(kept)
    if (kept.aside) aside.push(kept)
  }
  const storeys = Math.max(sheet.storeyCount, ...rooms.map((r) => storeyOf(r) + 1))
  const still =
    storeys === sheet.storeyCount &&
    rooms.length === sheet.rooms.length &&
    rooms.every((r, i) => sameRoom(r, sheet.rooms[i]!))
  return { sheet: still ? sheet : { ...sheet, rooms, storeyCount: storeys }, aside }
}
