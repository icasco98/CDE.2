/**
 * Where the sheet and the assistant's memory are kept so a link is worth opening twice: this
 * browser always, and the artifact's store when the link grants one. Nothing here renders.
 */

import {
  DEFAULTS,
  OUTSIDE,
  SETTINGS_V,
  alongAt,
  migrate,
  readMemory,
  repair,
  sheetOf,
  type Door,
  type Memory,
  type Point,
  type Room,
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

/** The sheet's own format: 2 is the first whose doors each name the edge they draw. */
const SHEET_FORMAT = 2

/** What the sheets of format 1 carried in place of a format, the program they were drawn for. */
const FORMAT_ONE = 'fresh-brief-2'

/** An edge as a saved door is matched to one: its id and its two ends. */
export type EdgeEnds = { readonly id: string; readonly a: string; readonly b: string }

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
  rooms: sheet.rooms,
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

/** A stored sheet, or nothing; a sheet of format 1 has its doors matched to the project's edges. */
export function sheetFrom(value: unknown, edges: readonly EdgeEnds[]): Sheet | null {
  if (!value || typeof value !== 'object') return null
  const held = value as Record<string, unknown>
  const current = held.format === SHEET_FORMAT
  if ((!current && held.program !== FORMAT_ONE) || !Array.isArray(held.rooms)) return null
  const settings = settingsFrom(held.settings) ?? {}
  const count = Number(held.storeyCount)
  const sheet = sheetOf([], settings, Number.isFinite(count) ? count : 2)
  sheet.rooms = repair((held.rooms as Room[]).map(asRoom), sheet.settings)
  if (!current) doorsOnEdges(sheet, edges)
  return sheet
}

const isPair = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((end) => typeof end === 'string' && end.length > 0)

/** A stored room read back: its own copy, with the fields an older store may not have carried. */
function asRoom(saved: Room): Room {
  const room = JSON.parse(JSON.stringify(saved)) as Room
  room.angle = Number(room.angle) || 0
  room.pieces = room.pieces ?? null
  const kept = room as Room & { extra?: unknown; aside?: unknown }
  delete kept.extra
  delete kept.aside
  return room
}

/** A door of format 1: a point on its room's wall and, when placed after doors knew it, its pair. */
type FormatOneDoor = Omit<Door, 'edge' | 'to' | 'along' | 'at'> & { at: Point; pair?: unknown }

/**
 * Format 1 doors onto the edges they drew: each door that recorded its pair becomes the door of the
 * project's edge between those two, standing where it stood; a door with no pair, or whose pair the
 * project no longer joins, is dropped.
 */
function doorsOnEdges(sheet: Sheet, edges: readonly EdgeEnds[]): void {
  const byId = new Map(sheet.rooms.map((r) => [r.id, r]))
  for (const room of sheet.rooms) {
    const old = (room.doors ?? []) as unknown as FormatOneDoor[]
    const doors: Door[] = []
    for (const door of old) {
      if (!isPair(door.pair) || !door.pair.includes(room.id)) continue
      const to = door.pair[0] === room.id ? door.pair[1] : door.pair[0]
      const edge = edges.find(
        (each) => (each.a === room.id && each.b === to) || (each.a === to && each.b === room.id),
      )
      if (!edge) continue
      const { id, type, w, flip, hinge, at } = door
      const other = byId.get(to)
      doors.push(
        to === OUTSIDE
          ? { id, edge: edge.id, to, type, w, flip, hinge, at }
          : {
              id,
              edge: edge.id,
              to,
              type,
              w,
              flip,
              hinge,
              along: other ? alongAt(room, other, at) : 0.5,
            },
      )
    }
    if (doors.length) room.doors = doors
    else delete room.doors
  }
}

/** An emptied sheet comes back empty: its rooms are stored waiting in the program, not dropped. */
export const localSheet = (edges: readonly EdgeEnds[]): Sheet | null =>
  sheetFrom(readLocal(SHEET_KEY), edges)

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
  edges: () => readonly EdgeEnds[],
): Promise<Sheet | null> => {
  const held = await readDoc(store, SHEET_DOC)
  return sheetFrom(held, edges())
}

export const storedSettings = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SETTINGS_DOC))

export const storedSpec = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SPEC_DOC))

export const storedMemory = async (store: Store): Promise<Memory | null> => {
  const held = await readDoc(store, MEMORY_DOC)
  return held ? readMemory(held) : null
}
