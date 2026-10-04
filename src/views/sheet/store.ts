/**
 * Where the sheet and the assistant's memory are kept so a link is worth opening twice: this
 * browser always, and the artifact's store when the link grants one. Nothing here renders.
 */

import {
  DEFAULTS,
  OUTSIDE,
  SETTINGS_V,
  migrate,
  readMemory,
  repair,
  sheetOf,
  standingAt,
  type Door,
  type Memory,
  type Point,
  type Zone,
  type Settings,
  type Sheet,
} from '../../sheet'
import type { Store } from './claude'

export const SHEET_KEY = 'cde.sheet'
export const MEMORY_KEY = 'cde.agent.memory'
export const SPEC_KEY = 'cde.spec'
export const SHEET_DOC = 'sheet/current'
export const MEMORY_DOC = 'agent/memory'
export const SETTINGS_DOC = 'settings/current'
export const SPEC_DOC = 'settings/spec'

/**
 * The sheet's own format: 2 is the first whose doors each name the connection they draw, 3 the first
 * written in the words of decision 44.
 */
const SHEET_FORMAT = 3

/** Format 2 differs from 3 only in its names, so it is read by renaming. */
const FORMAT_TWO = 2

/** Where formats 1 and 2 kept the zones, under the model's old word for them. */
const ZONES_BEFORE_3 = 'rooms'

/** The kind formats 1 and 2 gave a zone of no listed kind. */
const OTHER_BEFORE_3 = 'room'

/** What the sheets of format 1 carried in place of a format, the program they were drawn for. */
const FORMAT_ONE = 'fresh-brief-2'

/** A connection as a saved door is matched to one: its id and its two ends. */
export type ConnectionEnds = { readonly id: string; readonly a: string; readonly b: string }

const box = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readLocal = (key: string): unknown => {
  try {
    const held = box()?.getItem(key)
    return held ? JSON.parse(held) : null
  } catch {
    return null
  }
}

const keepLocal = (key: string, value: unknown): void => {
  try {
    box()?.setItem(key, JSON.stringify(value))
  } catch {
    // a browser with its store switched off keeps nothing; the sheet still works
  }
}

export const sheetKept = (sheet: Sheet): Record<string, unknown> => ({
  zones: sheet.zones,
  storeyCount: sheet.storeyCount,
  settings: { ...sheet.settings, v: SETTINGS_V },
  format: SHEET_FORMAT,
  at: new Date().toISOString(),
})

export const settingsKept = (settings: Settings): Record<string, unknown> => ({
  ...settings,
  v: SETTINGS_V,
  at: new Date().toISOString(),
})

/** The settings held in a stored document, whatever else it carries, older names migrated. */
export function settingsFrom(value: unknown): Partial<Settings> | null {
  if (!value || typeof value !== 'object') return null
  const saved = migrate(value as Record<string, unknown>) ?? {}
  const settings: Partial<Settings> = {}
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[])
    if (saved[key] !== undefined) Object.assign(settings, { [key]: saved[key] })
  return Object.keys(settings).length ? settings : null
}

/** A stored sheet, or nothing; a sheet of format 1 has its doors matched to the project's connections. */
export function sheetFrom(value: unknown, connections: readonly ConnectionEnds[]): Sheet | null {
  if (!value || typeof value !== 'object') return null
  const held = value as Record<string, unknown>
  const current = held.format === SHEET_FORMAT || held.format === FORMAT_TWO
  const zones = held.format === SHEET_FORMAT ? held.zones : held[ZONES_BEFORE_3]
  if ((!current && held.program !== FORMAT_ONE) || !Array.isArray(zones)) return null
  const settings = settingsFrom(held.settings) ?? {}
  const count = Number(held.storeyCount)
  const sheet = sheetOf([], settings, Number.isFinite(count) ? count : 2)
  sheet.zones = repair((zones as Zone[]).map(asZone), sheet.settings)
  if (!current) doorsOnConnections(sheet, connections)
  return sheet
}

const isPair = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((end) => typeof end === 'string' && end.length > 0)

/** A stored zone read back: its own copy, with the fields an older store may not have carried. */
function asZone(saved: Zone): Zone {
  const zone = JSON.parse(JSON.stringify(saved)) as Zone
  zone.angle = Number(zone.angle) || 0
  zone.pieces = zone.pieces ?? null
  const kept = zone as Zone & { extra?: unknown; aside?: unknown }
  delete kept.extra
  delete kept.aside
  // Formats 1 and 2 called a zone of no listed kind by the old word.
  if (zone.kind === OTHER_BEFORE_3) zone.kind = 'zone'
  for (const door of zone.doors ?? []) {
    // Format 2 called the connection a door draws its edge.
    const old = door as Door & { edge?: unknown }
    if (door.connection === undefined && typeof old.edge === 'string') door.connection = old.edge
    delete old.edge
  }
  return zone
}

/** A door of format 1: a point on its zone's edge and, when placed after doors knew it, its pair. */
type FormatOneDoor = Omit<Door, 'connection' | 'to' | 'along' | 'at'> & {
  at: Point
  pair?: unknown
}

/**
 * Format 1 doors onto the connections they drew: each door that recorded its pair becomes the door of the
 * project's connection between those two, standing where it stood; a door with no pair, or whose pair the
 * project no longer joins, is dropped.
 */
function doorsOnConnections(sheet: Sheet, connections: readonly ConnectionEnds[]): void {
  const byId = new Map(sheet.zones.map((r) => [r.id, r]))
  for (const zone of sheet.zones) {
    const old = (zone.doors ?? []) as unknown as FormatOneDoor[]
    const doors: Door[] = []
    for (const door of old) {
      if (!isPair(door.pair) || !door.pair.includes(zone.id)) continue
      const to = door.pair[0] === zone.id ? door.pair[1] : door.pair[0]
      const connection = connections.find(
        (each) => (each.a === zone.id && each.b === to) || (each.a === to && each.b === zone.id),
      )
      if (!connection) continue
      const { id, type, w, flip, hinge, at } = door
      const other = byId.get(to)
      doors.push(
        to === OUTSIDE
          ? { id, connection: connection.id, to, type, w, flip, hinge, at }
          : {
              id,
              connection: connection.id,
              to,
              type,
              w,
              flip,
              hinge,
              ...(other ? standingAt(zone, other, at) : { along: 0.5 }),
            },
      )
    }
    if (doors.length) zone.doors = doors
    else delete zone.doors
  }
}

/** An emptied sheet comes back empty: its zones are stored waiting in the program, not dropped. */
export const localSheet = (connections: readonly ConnectionEnds[]): Sheet | null =>
  sheetFrom(readLocal(SHEET_KEY), connections)

export const localSpec = (): Partial<Settings> | null => settingsFrom(readLocal(SPEC_KEY))

export const localMemory = (): Memory => readMemory(readLocal(MEMORY_KEY))

const write = (store: Store | null, path: string, data: Record<string, unknown>): void => {
  if (!store) return
  void store
    .doc(path)
    .set(data)
    .catch(() => {
      // the store is the link's, not the sheet's: a failed write leaves the browser's copy
    })
}

export function keepSheet(sheet: Sheet, store: Store | null): void {
  const kept = sheetKept(sheet)
  keepLocal(SHEET_KEY, kept)
  write(store, SHEET_DOC, kept)
  write(store, SETTINGS_DOC, settingsKept(sheet.settings))
}

/** This is it: the settings as the spec, for Reset to the spec to put back. */
export function keepSpec(settings: Settings, store: Store | null): void {
  const spec = settingsKept(settings)
  keepLocal(SPEC_KEY, spec)
  write(store, SPEC_DOC, spec)
}

export function keepMemory(memory: Memory, store: Store | null): void {
  keepLocal(MEMORY_KEY, memory)
  write(store, MEMORY_DOC, memory as unknown as Record<string, unknown>)
}

const readDoc = async (store: Store, path: string): Promise<unknown> => {
  try {
    const got = await store.doc(path).get()
    return got.exists ? got.data() : null
  } catch {
    return null
  }
}

/** The store's sheet, read once the link answers; the browser's copy stands until then. */
export const storedSheet = async (
  store: Store,
  connections: () => readonly ConnectionEnds[],
): Promise<Sheet | null> => {
  const held = await readDoc(store, SHEET_DOC)
  return sheetFrom(held, connections())
}

export const storedSettings = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SETTINGS_DOC))

export const storedSpec = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SPEC_DOC))

export const storedMemory = async (store: Store): Promise<Memory | null> => {
  const held = await readDoc(store, MEMORY_DOC)
  return held ? readMemory(held) : null
}
