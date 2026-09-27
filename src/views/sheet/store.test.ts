import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureSheet } from '../../sheet/fixture'
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
  localSheet,
  localSpec,
  sheetFrom,
  sheetKept,
  storedMemory,
  storedSettings,
  storedSheet,
  storedSpec,
} from './store'
import { newMemory, withNote, type Sheet } from '../../sheet'
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
    const sheet = fixtureSheet()
    keepSheet(sheet, null)
    keepMemory(withNote(newMemory(), 'north is 25°', '2026-09-18T11:00:00.000Z'), null)
    expect(placed(localSheet([])!)).toBe(placed(sheet))
    expect(localMemory().notes[0]!.text).toBe('north is 25°')
    expect(globalThis.localStorage.getItem(SHEET_KEY)).toContain('Diwaniya')
    expect(globalThis.localStorage.getItem(MEMORY_KEY)).toContain('north is 25')
  })

  it('writes to the link’s store as well when there is one', async () => {
    const { store, docs } = fakeStore()
    keepSheet(fixtureSheet(), store)
    keepMemory(newMemory(), store)
    await Promise.resolve()
    expect(docs.has(SHEET_DOC)).toBe(true)
    expect(docs.has(MEMORY_DOC)).toBe(true)
    expect(placed((await storedSheet(store, () => []))!)).toBe(17)
    expect(await storedMemory(store)).toEqual(newMemory())
  })

  it('does not read back a layout of another program, or nonsense', () => {
    const kept = sheetKept(fixtureSheet())
    delete kept.format
    expect(sheetFrom({ ...kept, program: 'another-brief' }, [])).toBeNull()
    expect(sheetFrom(null, [])).toBeNull()
    expect(sheetFrom({ program: 'fresh-brief-2' }, [])).toBeNull()
    expect(localSheet([])).toBeNull()
    expect(localMemory()).toEqual(newMemory())
  })

  it('keeps the settings the sheet was saved with', () => {
    const kept = sheetKept(fixtureSheet({ rule: 'push', grid: 0.5 }))
    const read = sheetFrom(kept, [])!
    expect(read.settings.rule).toBe('push')
    expect(read.settings.grid).toBe(0.5)
  })

  it('writes the settings on their own as well, so a link that keeps them reads them back', async () => {
    const { store, docs } = fakeStore()
    keepSheet(fixtureSheet({ grid: 1, rule: 'push' }), store)
    await Promise.resolve()
    expect(docs.has(SETTINGS_DOC)).toBe(true)
    expect((await storedSettings(store))!.grid).toBe(1)
    expect((await storedSettings(store))!.rule).toBe('push')
  })

  it('round trips the spec This is it saved, and nothing of the sheet with it', async () => {
    const { store, docs } = fakeStore()
    const sheet = fixtureSheet({ jamb: 0.3, boundary: 'sides' })
    keepSpec(sheet.settings, store)
    await Promise.resolve()
    expect([...docs.keys()]).toEqual([SPEC_DOC])
    expect(localSpec()).toMatchObject({ jamb: 0.3, boundary: 'sides' })
    expect(await storedSpec(store)).toMatchObject({ jamb: 0.3, boundary: 'sides' })
    expect(localSheet([])).toBeNull()
  })

  it('reads back a cleared sheet as cleared, so an emptied plan stays empty', () => {
    const sheet = fixtureSheet()
    for (const room of sheet.rooms) room.placed = false
    keepSheet(sheet, null)
    expect(placed(localSheet([])!)).toBe(0)
  })

  it('opens a sheet of format 1, each door with a pair now the door of the matching edge', () => {
    const sheet = fixtureSheet()
    const kitchen = sheet.rooms.find((room) => room.name === 'Kitchen')!
    const entry = sheet.rooms.find((room) => room.name === 'Entry')!
    const saved = sheetKept(sheet) as Record<string, unknown> & { rooms: unknown[] }
    delete saved.format
    saved.program = 'fresh-brief-2'
    const door = { type: 'door', w: 0.9, flip: false, hinge: false }
    saved.rooms = sheet.rooms.map((room) =>
      room.id === entry.id
        ? {
            ...room,
            doors: [
              { ...door, id: 'd1', at: [0, 1], pair: [entry.id, 'EXTERIOR'] },
              { ...door, id: 'd2', at: [1, 0] },
              { ...door, id: 'd3', at: [1, 0], pair: [entry.id, 'nowhere'] },
            ],
          }
        : room.id === kitchen.id
          ? { ...room, doors: [{ ...door, id: 'd4', at: [0, 1], pair: [entry.id, kitchen.id] }] }
          : room,
    )
    const edges = [
      { id: 'e1', a: 'EXTERIOR', b: entry.id },
      { id: 'e2', a: kitchen.id, b: entry.id },
    ]
    const back = sheetFrom(saved, edges)!
    const doorsOf = (id: string) => back.rooms.find((room) => room.id === id)!.doors
    expect(doorsOf(entry.id)).toEqual([
      {
        id: 'd1',
        edge: 'e1',
        to: 'EXTERIOR',
        type: 'door',
        w: 0.9,
        flip: false,
        hinge: false,
        at: [0, 1],
      },
    ])
    expect(doorsOf(kitchen.id)).toMatchObject([{ id: 'd4', edge: 'e2', to: entry.id }])
    expect(typeof doorsOf(kitchen.id)![0]!.along).toBe('number')
  })

  it('writes the sheet as format 2 and reads its doors back untouched', () => {
    const sheet = fixtureSheet()
    sheet.rooms[0]!.doors = [
      {
        id: 'd1',
        edge: 'e1',
        to: 'b',
        type: 'door',
        w: 0.9,
        along: 0.3,
        flip: false,
        hinge: false,
      },
    ]
    const kept = sheetKept(sheet)
    expect(kept.format).toBe(2)
    expect(sheetFrom(kept, [])!.rooms[0]!.doors).toEqual(sheet.rooms[0]!.doors)
  })
})
