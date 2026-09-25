import { beforeEach, describe, expect, it } from 'vitest'
import {
  MEMORY_DOC,
  MEMORY_KEY,
  SETTINGS_DOC,
  SHEET_DOC,
  SHEET_KEY,
  SPEC_DOC,
  keepMemory,
  keepSheet,
  keepSpec,
  localMemory,
  localSample,
  localSheet,
  localSpec,
  sheetFrom,
  sheetKept,
  storedMemory,
  storedSample,
  storedSettings,
  storedSheet,
  storedSpec,
} from './store'
import { newMemory, sampleSheet, withNote, type Sheet } from '../../sheet'
import type { Store } from './claude'

/** A browser's store, as much of one as the tool uses. */
function fakeLocal(): void {
  const held = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
    },
  })
}

/** The artifact's store: one document per path, last write standing. */
function fakeStore(): { store: Store; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>()
  return {
    docs,
    store: {
      doc: (path) => ({
        get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
        set: async (data) => {
          docs.set(path, data)
        },
      }),
    },
  }
}

const placed = (sheet: Sheet) => sheet.rooms.filter((r) => r.placed).length

describe('where the sheet and the memory are kept', () => {
  beforeEach(fakeLocal)

  it('writes the sheet and the memory to this browser and reads them back', () => {
    const sheet = sampleSheet()
    keepSheet(sheet, null)
    keepMemory(withNote(newMemory(), 'north is 25°', '2026-09-18T11:00:00.000Z'), null)
    expect(placed(localSheet()!)).toBe(placed(sheet))
    expect(localMemory().notes[0]!.text).toBe('north is 25°')
    expect(globalThis.localStorage.getItem(SHEET_KEY)).toContain('Diwaniya')
    expect(globalThis.localStorage.getItem(MEMORY_KEY)).toContain('north is 25')
  })

  it('writes to the link’s store as well when there is one', async () => {
    const { store, docs } = fakeStore()
    keepSheet(sampleSheet(), store)
    keepMemory(newMemory(), store)
    await Promise.resolve()
    expect(docs.has(SHEET_DOC)).toBe(true)
    expect(docs.has(MEMORY_DOC)).toBe(true)
    expect(placed((await storedSheet(store))!)).toBe(17)
    expect(await storedMemory(store)).toEqual(newMemory())
  })

  it('does not read back a layout of another program, or nonsense', () => {
    expect(sheetFrom({ ...sheetKept(sampleSheet()), program: 'another-brief' })).toBeNull()
    expect(sheetFrom(null)).toBeNull()
    expect(sheetFrom({ program: 'fresh-brief-2' })).toBeNull()
    expect(localSheet()).toBeNull()
    expect(localMemory()).toEqual(newMemory())
  })

  it('keeps the settings the sheet was saved with', () => {
    const kept = sheetKept(sampleSheet({ rule: 'push', grid: 0.5 }))
    const read = sheetFrom(kept)!
    expect(read.settings.rule).toBe('push')
    expect(read.settings.grid).toBe(0.5)
  })

  it('writes the settings on their own as well, so a link that keeps them reads them back', async () => {
    const { store, docs } = fakeStore()
    keepSheet(sampleSheet({ grid: 1, rule: 'push' }), store)
    await Promise.resolve()
    expect(docs.has(SETTINGS_DOC)).toBe(true)
    expect((await storedSettings(store))!.grid).toBe(1)
    expect((await storedSettings(store))!.rule).toBe('push')
  })

  it('round trips the spec and the sample This is it saved', async () => {
    const { store, docs } = fakeStore()
    const sheet = sampleSheet({ jamb: 0.3, boundary: 'sides' })
    keepSpec(sheet, store)
    await Promise.resolve()
    expect(docs.has(SPEC_DOC)).toBe(true)
    expect(localSpec()).toMatchObject({ jamb: 0.3, boundary: 'sides' })
    expect(placed(localSample()!)).toBe(placed(sheet))
    expect(await storedSpec(store)).toMatchObject({ jamb: 0.3, boundary: 'sides' })
    expect(placed((await storedSample(store))!)).toBe(placed(sheet))
  })

  it('reads back a cleared sheet as cleared, so an emptied plan stays empty', () => {
    const sheet = sampleSheet()
    for (const room of sheet.rooms) room.placed = false
    keepSheet(sheet, null)
    expect(placed(localSheet()!)).toBe(0)
  })

  it('opens a sheet saved before doors knew their edge, and keeps the pair of one that does', () => {
    const sheet = sampleSheet()
    const withDoors = sheet.rooms.filter((room) => room.doors?.length)
    expect(withDoors.length).toBeGreaterThan(1)
    const [old, paired] = withDoors
    old!.doors = old!.doors!.map((door) => ({
      ...door,
      pair: 'garbled' as unknown as [string, string],
    }))
    paired!.doors = paired!.doors!.map((door) => ({ ...door, pair: ['r1', 'EXTERIOR'] }))
    const back = sheetFrom(sheetKept(sheet))!
    const doorsOf = (id: string) => back.rooms.find((room) => room.id === id)!.doors!
    expect(doorsOf(old!.id).every((door) => door.pair === undefined)).toBe(true)
    expect(doorsOf(paired!.id).every((door) => door.pair?.join() === 'r1,EXTERIOR')).toBe(true)
    const untouched = sampleSheet().rooms.find((room) => room.doors?.length)!
    expect(back.rooms.find((room) => room.id === untouched.id)).toBeDefined()
  })
})
