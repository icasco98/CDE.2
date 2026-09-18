/**
 * Where the sheet and the assistant's memory are kept so a link is worth opening twice: this
 * browser always, and the artifact's store when the link grants one. Nothing here renders.
 */

import {
  DEFAULTS,
  PROGRAM_TAG,
  SETTINGS_V,
  migrate,
  readMemory,
  repair,
  sheetOf,
  type Memory,
  type Room,
  type Settings,
  type Sheet,
} from '../../sheet'
import type { Store } from './claude'

export const SHEET_KEY = 'cde.sheet'
export const MEMORY_KEY = 'cde.agent.memory'
export const SPEC_KEY = 'cde.spec'
export const SAMPLE_KEY = 'cde.sample'
export const SHEET_DOC = 'sheet/current'
export const MEMORY_DOC = 'agent/memory'
export const SETTINGS_DOC = 'settings/current'
export const SPEC_DOC = 'settings/spec'
export const SAMPLE_DOC = 'sheet/sample'

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
  program: PROGRAM_TAG,
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

/** A stored sheet, or nothing: a layout of another program is not read back. */
export function sheetFrom(value: unknown): Sheet | null {
  if (!value || typeof value !== 'object') return null
  const held = value as Record<string, unknown>
  if (held.program !== PROGRAM_TAG || !Array.isArray(held.rooms)) return null
  const settings = settingsFrom(held.settings) ?? {}
  const count = Number(held.storeyCount)
  const sheet = sheetOf([], settings, Number.isFinite(count) ? count : 2)
  sheet.rooms = repair((held.rooms as Room[]).map(asRoom), sheet.settings)
  return sheet
}

/** A stored room read back: its own copy, with the fields an older store may not have carried. */
function asRoom(saved: Room): Room {
  const room = JSON.parse(JSON.stringify(saved)) as Room
  room.angle = Number(room.angle) || 0
  room.pieces = room.pieces ?? null
  return room
}

/** An emptied sheet comes back empty: its rooms are stored waiting in the program, not dropped. */
export const localSheet = (): Sheet | null => sheetFrom(readLocal(SHEET_KEY))

export const localSpec = (): Partial<Settings> | null => settingsFrom(readLocal(SPEC_KEY))

export const localSample = (): Sheet | null => sheetFrom(readLocal(SAMPLE_KEY))

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

/** This is it: the settings as the spec, the sheet as the sample, for Reset to the spec to put back. */
export function keepSpec(sheet: Sheet, store: Store | null): void {
  const spec = settingsKept(sheet.settings)
  const sample = sheetKept(sheet)
  keepLocal(SPEC_KEY, spec)
  keepLocal(SAMPLE_KEY, sample)
  write(store, SPEC_DOC, spec)
  write(store, SAMPLE_DOC, sample)
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
export const storedSheet = async (store: Store): Promise<Sheet | null> =>
  sheetFrom(await readDoc(store, SHEET_DOC))

export const storedSettings = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SETTINGS_DOC))

export const storedSpec = async (store: Store): Promise<Partial<Settings> | null> =>
  settingsFrom(await readDoc(store, SPEC_DOC))

export const storedSample = async (store: Store): Promise<Sheet | null> =>
  sheetFrom(await readDoc(store, SAMPLE_DOC))

export const storedMemory = async (store: Store): Promise<Memory | null> => {
  const held = await readDoc(store, MEMORY_DOC)
  return held ? readMemory(held) : null
}
