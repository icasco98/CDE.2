/**
 * What Check shows on the zoning sheet, read from the project's edges and keep-apart pairs and from
 * the doors as each recorded its edge when it was placed. An edge is ready in the zoning step when
 * its two rooms share a run of wall a door wide, and met in the Openings step when a door drawing
 * it is placed. Nothing here changes the sheet or the graph.
 */

import {
  DOOR,
  acrossStoreys,
  doorsOf,
  meetingOf,
  placedRooms,
  storeyOf,
  type Room,
  type Sheet,
} from '../../sheet'

export type SheetEdge = { readonly a: string; readonly b: string; readonly storey: number }

export type SheetPair = { readonly a: string; readonly b: string }

export type Step = 'zoning' | 'openings'

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

export type CheckRead = {
  /** This storey's edges between two rooms that are not yet ready, or not yet met. */
  readonly waiting: readonly SheetEdge[]
  /** The doors that join a pair kept apart. */
  readonly apartDoors: ReadonlySet<string>
  /** The rooms on this storey of a pair where one is reached only through the other. */
  readonly apartRooms: ReadonlySet<string>
  /** The pairs kept apart that a door joins or that one is reached only through the other. */
  readonly broken: number
}

/** Whether two placed rooms share a run of wall at least a door wide; a corner is not a run. */
function sharesADoorsWidth(one: Room, other: Room, sheet: Sheet): boolean {
  const together =
    storeyOf(one) === storeyOf(other) ||
    acrossStoreys(one, sheet.settings) ||
    acrossStoreys(other, sheet.settings)
  if (!one.placed || !other.placed || !together) return false
  const met = meetingOf(one, other)
  return !!met && !('how' in met) && met.metres >= DOOR.door.w - 1e-6
}

/** Every pair a door on the sheet draws, as the doors recorded them. */
function drawnPairs(sheet: Sheet): ReadonlySet<string> {
  const drawn = new Set<string>()
  for (const room of sheet.rooms)
    for (const door of doorsOf(room)) if (door.pair) drawn.add(pairKey(...door.pair))
  return drawn
}

export function checkRead(
  sheet: Sheet,
  storey: number,
  input: {
    readonly edges: readonly SheetEdge[]
    readonly apart: readonly SheetPair[]
    /** The keep-apart pairs, by `pairKey`, where one room is reached only through the other. */
    readonly through: ReadonlySet<string>
  },
  step: Step,
): CheckRead {
  const byId = new Map(sheet.rooms.map((room) => [room.id, room]))
  const drawn = drawnPairs(sheet)
  const waiting = input.edges.filter((edge) => {
    if (edge.storey !== storey) return false
    const one = byId.get(edge.a)
    const other = byId.get(edge.b)
    if (!one || !other) return false
    return step === 'openings'
      ? !drawn.has(pairKey(edge.a, edge.b))
      : !sharesADoorsWidth(one, other, sheet)
  })
  const apartKeys = new Set(input.apart.map((pair) => pairKey(pair.a, pair.b)))
  const here = placedRooms(sheet, storey)
  const apartDoors = new Set<string>()
  for (const room of here)
    for (const door of doorsOf(room))
      if (door.pair && apartKeys.has(pairKey(...door.pair))) apartDoors.add(door.id)
  const shown = new Set(here.map((room) => room.id))
  const apartRooms = new Set<string>()
  let broken = 0
  for (const pair of input.apart) {
    const key = pairKey(pair.a, pair.b)
    const through = input.through.has(key)
    if (through || drawn.has(key)) broken += 1
    if (!through) continue
    for (const end of [pair.a, pair.b]) if (shown.has(end)) apartRooms.add(end)
  }
  return { waiting, apartDoors, apartRooms, broken }
}

/**
 * The rooms a line runs to from one room: to those placed on this storey, and to those still in the
 * program, whose line runs to their entry there. A room placed on another storey has no line.
 */
export function linesFrom(
  focus: string,
  waiting: readonly SheetEdge[],
  sheet: Sheet,
  storey: number,
): { readonly placed: readonly string[]; readonly tray: readonly string[] } {
  const here = new Set(placedRooms(sheet, storey).map((room) => room.id))
  const byId = new Map(sheet.rooms.map((room) => [room.id, room]))
  const placed: string[] = []
  const tray: string[] = []
  for (const edge of waiting) {
    if (edge.a !== focus && edge.b !== focus) continue
    const other = edge.a === focus ? edge.b : edge.a
    if (here.has(other)) placed.push(other)
    else if (byId.get(other) && !byId.get(other)!.placed) tray.push(other)
  }
  return { placed, tray }
}
