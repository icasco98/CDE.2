import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureSheet } from '../../sheet/fixture'
import {
  MEMORY_DOC,
  MEMORY_KEY,
  SETTINGS_DOC,
  SHEET_DOC,
  SHEET_KEY,
  SPEC_DOC,
  SPEC_KEY,
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
import { newMemory, withNote, type Door, type Settings, type Sheet } from '../../sheet'
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

const placed = (sheet: Sheet) => sheet.zones.filter((r) => r.placed).length

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

  it('drags one zone’s edge alone unless the sheet or the spec saved shared edges on', () => {
    const kept = sheetKept(fixtureSheet())
    const settings = { ...(kept.settings as Record<string, unknown>) }
    delete settings.sharedEdges
    expect(sheetFrom({ ...kept, settings }, [])!.settings.sharedEdges).toBe(0)
    expect(
      sheetFrom({ ...kept, settings: { ...settings, sharedEdges: 1 } }, [])!.settings.sharedEdges,
    ).toBe(1)
    expect(
      sheetFrom({ ...kept, settings: { ...settings, sharedWalls: 1, v: 48 } }, [])!.settings
        .sharedEdges,
    ).toBe(0)
    expect(
      sheetFrom({ ...kept, settings: { ...settings, sharedWalls: 1, v: 49 } }, [])!.settings
        .sharedEdges,
    ).toBe(1)
    localStorage.setItem(SPEC_KEY, JSON.stringify(settings))
    expect(localSpec()).not.toHaveProperty('sharedEdges')
    localStorage.setItem(SPEC_KEY, JSON.stringify({ ...settings, sharedEdges: 1 }))
    expect(localSpec()!.sharedEdges).toBe(1)
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
    for (const zone of sheet.zones) zone.placed = false
    keepSheet(sheet, null)
    expect(placed(localSheet([])!)).toBe(0)
  })

  it('opens a sheet of format 1, each door with a pair now the door of the matching connection', () => {
    const sheet = fixtureSheet()
    const kitchen = sheet.zones.find((zone) => zone.name === 'Kitchen')!
    const entry = sheet.zones.find((zone) => zone.name === 'Entry')!
    const saved = sheetKept(sheet)
    delete saved.format
    delete saved.zones
    saved.program = 'fresh-brief-2'
    const door = { type: 'door', w: 0.9, flip: false, hinge: false }
    saved.rooms = sheet.zones.map((zone) =>
      zone.id === entry.id
        ? {
            ...zone,
            doors: [
              { ...door, id: 'd1', at: [0, 1], pair: [entry.id, 'EXTERIOR'] },
              { ...door, id: 'd2', at: [1, 0] },
              { ...door, id: 'd3', at: [1, 0], pair: [entry.id, 'nowhere'] },
            ],
          }
        : zone.id === kitchen.id
          ? { ...zone, doors: [{ ...door, id: 'd4', at: [0, 1], pair: [entry.id, kitchen.id] }] }
          : zone,
    )
    const connections = [
      { id: 'e1', a: 'EXTERIOR', b: entry.id },
      { id: 'e2', a: kitchen.id, b: entry.id },
    ]
    const back = sheetFrom(saved, connections)!
    const doorsOf = (id: string) => back.zones.find((zone) => zone.id === id)!.doors
    expect(doorsOf(entry.id)).toEqual([
      {
        id: 'd1',
        connection: 'e1',
        to: 'EXTERIOR',
        type: 'door',
        w: 0.9,
        flip: false,
        hinge: false,
        at: [0, 1],
      },
    ])
    expect(doorsOf(kitchen.id)).toMatchObject([{ id: 'd4', connection: 'e2', to: entry.id }])
    expect(typeof doorsOf(kitchen.id)![0]!.along).toBe('number')
  })

  it('writes the sheet as format 3 and reads its doors back untouched', () => {
    const sheet = fixtureSheet()
    sheet.zones[0]!.doors = [
      {
        id: 'd1',
        connection: 'e1',
        to: 'b',
        type: 'door',
        w: 0.9,
        along: 0.3,
        flip: false,
        hinge: false,
      },
    ]
    const kept = sheetKept(sheet)
    expect(kept.format).toBe(3)
    expect(sheetFrom(kept, [])!.zones[0]!.doors).toEqual(sheet.zones[0]!.doors)
  })

  it('opens a format 2 sheet, written under the old words, without loss', () => {
    const sheet = fixtureSheet()
    const door = { id: 'd1', to: 'b', type: 'door', w: 0.9, along: 0.3, flip: false, hinge: false }
    sheet.zones[0]!.kind = 'zone'
    sheet.zones[0]!.doors = [{ ...door, connection: 'e1' } as Door]
    const kept = sheetKept(sheet)
    const { zones, settings, ...rest } = kept
    const rooms = JSON.parse(JSON.stringify(zones)) as Record<string, unknown>[]
    rooms[0]!.kind = 'room'
    rooms[0]!.doors = [{ ...door, edge: 'e1' }]
    const { sharedEdges, ...older } = settings as Settings
    const file = {
      ...rest,
      rooms,
      settings: { ...older, sharedWalls: sharedEdges, v: 49 },
      format: 2,
    }
    expect(sheetFrom(file, [])).toEqual(sheetFrom(kept, []))
    expect(sheetFrom(file, [])!.zones[0]!.doors).toEqual([{ ...door, connection: 'e1' }])
  })
})
