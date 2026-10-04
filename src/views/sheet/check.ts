/**
 * What Check shows on the zoning sheet, read from the project's connections and keep-apart pairs and from
 * the doors drawn, each drawing the connection it names. A connection is ready in the zoning step when its two
 * zones share a run of edge a door wide, and met in the Openings step when one of its doors is drawn: a
 * door whose zones have moved apart is not drawn, and its connection is not met. Nothing here changes the
 * sheet or the graph.
 */

import {
  DOOR,
  acrossStoreys,
  drawnDoors,
  meetingOf,
  placedZones,
  storeyOf,
  toWorld,
  type Point,
  type Zone,
  type Sheet,
} from '../../sheet'

export type SheetConnection = {
  readonly id: string
  readonly a: string
  readonly b: string
  readonly storey: number
}

type SheetPair = { readonly a: string; readonly b: string }

type Step = 'zoning' | 'openings'

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

type CheckRead = {
  /** This storey's connections between two zones that are not yet ready, or not yet met. */
  readonly waiting: readonly SheetConnection[]
  /** The doors drawn that join a pair kept apart, and where each stands in plot metres. */
  readonly apartDoors: ReadonlyMap<string, Point>
  /** The zones on this storey of a pair where one is reached only through the other. */
  readonly apartZones: ReadonlySet<string>
  /** The pairs kept apart that a door joins or that one is reached only through the other. */
  readonly broken: number
}

/** Whether two placed zones share a run of edge at least a door wide; a corner is not a run. */
function sharesADoorsWidth(one: Zone, other: Zone, sheet: Sheet): boolean {
  const together =
    storeyOf(one) === storeyOf(other) ||
    acrossStoreys(one, sheet.settings) ||
    acrossStoreys(other, sheet.settings)
  if (!one.placed || !other.placed || !together) return false
  const met = meetingOf(one, other)
  return !!met && !('how' in met) && met.metres >= DOOR.door.w - 1e-6
}

export function checkRead(
  sheet: Sheet,
  storey: number,
  input: {
    readonly connections: readonly SheetConnection[]
    readonly apart: readonly SheetPair[]
    /** The keep-apart pairs, by `pairKey`, where one zone is reached only through the other. */
    readonly through: ReadonlySet<string>
  },
  step: Step,
): CheckRead {
  const byId = new Map(sheet.zones.map((zone) => [zone.id, zone]))
  const doors = drawnDoors(sheet, storey)
  const met = new Set(doors.map((each) => each.door.connection))
  const drawn = new Set(doors.map((each) => pairKey(each.zone.id, each.door.to)))
  const waiting = input.connections.filter((connection) => {
    if (connection.storey !== storey) return false
    const one = byId.get(connection.a)
    const other = byId.get(connection.b)
    if (!one || !other) return false
    return step === 'openings' ? !met.has(connection.id) : !sharesADoorsWidth(one, other, sheet)
  })
  const apartKeys = new Set(input.apart.map((pair) => pairKey(pair.a, pair.b)))
  const here = placedZones(sheet, storey)
  const apartDoors = new Map<string, Point>()
  for (const { zone, door, pl } of doors)
    if (apartKeys.has(pairKey(zone.id, door.to)))
      apartDoors.set(door.id, toWorld(zone, pl.p[0], pl.p[1]))
  const shown = new Set(here.map((zone) => zone.id))
  const apartZones = new Set<string>()
  let broken = 0
  for (const pair of input.apart) {
    const key = pairKey(pair.a, pair.b)
    const through = input.through.has(key)
    if (through || drawn.has(key)) broken += 1
    if (!through) continue
    for (const end of [pair.a, pair.b]) if (shown.has(end)) apartZones.add(end)
  }
  return { waiting, apartDoors, apartZones, broken }
}

/**
 * The zones a line runs to from one zone: to those placed on this storey, and to those still in the
 * program, whose line runs to their entry there. A zone placed on another storey has no line.
 */
export function linesFrom(
  focus: string,
  waiting: readonly SheetConnection[],
  sheet: Sheet,
  storey: number,
): { readonly placed: readonly string[]; readonly tray: readonly string[] } {
  const here = new Set(placedZones(sheet, storey).map((zone) => zone.id))
  const byId = new Map(sheet.zones.map((zone) => [zone.id, zone]))
  const placed: string[] = []
  const tray: string[] = []
  for (const connection of waiting) {
    if (connection.a !== focus && connection.b !== focus) continue
    const other = connection.a === focus ? connection.b : connection.a
    if (here.has(other)) placed.push(other)
    else if (byId.get(other) && !byId.get(other)!.placed) tray.push(other)
  }
  return { placed, tray }
}
