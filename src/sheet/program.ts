/**
 * The program the sheet draws: the zones the brief asks for, in the order of importance, as the
 * project holds them, and the connections its doors draw. The sheet follows both exactly — a zone in the
 * brief keeps whatever the hand has done to it, a zone the brief no longer names leaves the sheet,
 * and a door whose connection is gone goes with it — and nothing here knows what a project is: the caller
 * hands over the list and the connections, and keeps what was set down so an undo can give it back.
 */

import {
  acrossStoreys,
  cloneZone,
  doorsOf,
  storeyOf,
  type Category,
  type Door,
  type Zone,
  type Settings,
  type Sheet,
} from './model'
import { sizeFor } from './kinds'

/** One zone of the brief, as the sheet reads it. */
export type ProgramZone = {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly cat: Category
  readonly target: number
  readonly storey: number
}

/** A door the sheet set down with the zone that held it, so it can stand there again. */
export type HeldDoor = { readonly host: string; readonly door: Door }

/** What following the brief took off the sheet, and what it may put back. */
export type SetDown = { readonly zones: readonly Zone[]; readonly doors: readonly HeldDoor[] }

/** A zone of the brief the sheet has not drawn yet: sized from its target, waiting in the program. */
export function zoneFromProgram(entry: ProgramZone, settings: Settings): Zone {
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

/** A zone of the brief the sheet already holds: the brief's words and target, the sheet's drawing. */
function follow(held: Zone, entry: ProgramZone, settings: Settings): Zone {
  const r = cloneZone(held)
  r.id = entry.id
  r.name = entry.name
  r.kind = entry.kind
  r.cat = entry.cat
  r.target = entry.target
  // A zone already drawn keeps its footprint, and the sentence reads the new target against the
  // area it has; one still waiting takes the brief's size. Either stands on the brief's storey,
  // except a stair the sheet stands on every storey.
  if (!r.placed) {
    const size = sizeFor(entry.kind, entry.target, settings)
    r.w = size.w
    r.h = size.h
  }
  if (!r.placed || !acrossStoreys(r, settings)) r.storey = entry.storey
  return r
}

/** What following the brief may change about a zone, so a sheet already in line is left alone. */
const sameZone = (one: Zone, other: Zone): boolean =>
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
 * The sheet brought in line with the brief: the brief's zones in the brief's order and nothing else,
 * each door drawing a connection the project still holds. What was set down aside earlier comes back when
 * the brief names its zone or holds its connection again, which is how an undo in the brief is followed.
 */
export function followProgram(
  sheet: Sheet,
  program: readonly ProgramZone[],
  connections: ReadonlySet<string>,
  aside: SetDown = { zones: [], doors: [] },
): { readonly sheet: Sheet; readonly setDown: SetDown } {
  const taken = new Set<string>()
  const zones: Zone[] = []
  for (const entry of program) {
    // A zone is the brief's by its id alone: a zone of the same name is another zone.
    const held =
      sheet.zones.find((r) => r.id === entry.id && !taken.has(r.id)) ??
      aside.zones.find((r) => r.id === entry.id) ??
      null
    if (held) taken.add(held.id)
    zones.push(held ? follow(held, entry, sheet.settings) : zoneFromProgram(entry, sheet.settings))
  }
  const setDownZones = sheet.zones.filter((held) => !taken.has(held.id)).map(cloneZone)
  const setDownDoors: HeldDoor[] = []
  const standing = new Set(zones.flatMap((r) => doorsOf(r).map((d) => d.id)))
  // A connection that kept a door on the sheet has been drawn again since, so what was set down stays down.
  const drawn = new Set(
    zones.flatMap((r) =>
      doorsOf(r)
        .filter((d) => connections.has(d.connection))
        .map((d) => d.connection),
    ),
  )
  for (const r of zones) {
    const kept = doorsOf(r).filter((d) => connections.has(d.connection))
    for (const d of doorsOf(r))
      if (!connections.has(d.connection)) setDownDoors.push({ host: r.id, door: d })
    const back = aside.doors.filter(
      (held) =>
        held.host === r.id &&
        connections.has(held.door.connection) &&
        !standing.has(held.door.id) &&
        !drawn.has(held.door.connection),
    )
    const doors = [...kept, ...back.map((held) => ({ ...held.door }))]
    if (doors.length) r.doors = doors
    else delete r.doors
  }
  const storeys = Math.max(sheet.storeyCount, ...zones.map((r) => storeyOf(r) + 1))
  const still =
    storeys === sheet.storeyCount &&
    zones.length === sheet.zones.length &&
    zones.every((r, i) => sameZone(r, sheet.zones[i]!))
  return {
    sheet: still ? sheet : { ...sheet, zones, storeyCount: storeys },
    setDown: { zones: setDownZones, doors: setDownDoors },
  }
}
