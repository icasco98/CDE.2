import { describe, expect, it } from 'vitest'
import {
  DEFAULTS,
  RULE_HINT,
  SETTINGS_V,
  acrossStoreys,
  allPlaced,
  cloneZone,
  cloneSheet,
  doorsOf,
  ghostsOf,
  heightCap,
  heightOf,
  isCourt,
  isGhost,
  isOpen,
  isStair,
  kin,
  migrate,
  piecesOf,
  placedZones,
  rank,
  ruleOf,
  sheetOf,
  snapZones,
  stH,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  tallZone,
  zTop,
  type Zone,
} from './model'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
  cat: 'shared',
  target: 10,
  x: 4,
  y: 4,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

describe('the settings', () => {
  it('holds the mock’s defaults and its version', () => {
    expect(SETTINGS_V).toBe(50)
    expect(DEFAULTS.rule).toBe('wait')
    expect(DEFAULTS.jamb).toBe(0.15)
    expect(DEFAULTS.grid).toBe(0.25)
    expect(DEFAULTS.snapDist).toBe(0.4)
    expect(DEFAULTS.boundary).toBe('all')
    expect(DEFAULTS.courtArea).toBe(9)
    expect(DEFAULTS.courtSide).toBe(1.5)
    expect(DEFAULTS.maxHeight).toBe(15)
    expect(DEFAULTS.stairTop).toBe(18)
    expect(RULE_HINT.push).toContain('never shrinks')
  })

  it('reads a landing rule, and nothing else', () => {
    expect(ruleOf('push')).toBe('push')
    expect(ruleOf('anything')).toBe('wait')
  })

  it('gives an older page’s unused boundary switch the new default', () => {
    expect(migrate({ boundary: 'off' })!.boundary).toBe('all')
    expect(migrate({ boundary: 'off', v: 48 })!.boundary).toBe('off')
    expect(migrate(null)).toBeNull()
  })

  it('drops the shared-edge drag an older page wrote out whole, and keeps one saved since', () => {
    expect(migrate({ sharedWalls: 1, v: 48 })).toEqual({ v: 48 })
    expect(migrate({ sharedWalls: 1, v: 49 })).toEqual({ sharedEdges: 1, v: 49 })
    expect(migrate({ sharedEdges: 1, v: 50 })!.sharedEdges).toBe(1)
  })

  it('copies a sheet without sharing anything with it', () => {
    const sheet = sheetOf([zone()])
    const copy = cloneSheet(sheet)
    copy.zones[0]!.x = 99
    copy.settings.colors.shared = '#000000'
    expect(sheet.zones[0]!.x).toBe(4)
    expect(sheet.settings.colors.shared).toBe(DEFAULTS.colors.shared)
    expect(cloneZone(sheet.zones[0]!)).not.toBe(sheet.zones[0])
  })
})

describe('what a zone is', () => {
  it('knows open ground, a stair and a court', () => {
    expect(isOpen(zone({ cat: 'open' }))).toBe(true)
    expect(isStair(zone({ kind: 'stair' }))).toBe(true)
    expect(isCourt(zone({ kind: 'court', fixed: true }))).toBe(true)
    expect(isCourt(zone({ kind: 'court' }))).toBe(false)
  })

  it('is its rectangle until it has pieces', () => {
    expect(piecesOf(zone())).toEqual([
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    ])
    expect(doorsOf(zone())).toEqual([])
  })

  it('reads the program order as the order of importance', () => {
    const a = zone({ id: 'a' })
    const b = zone({ id: 'b' })
    const sheet = sheetOf([a, b])
    expect(rank(a, sheet)).toBeLessThan(rank(b, sheet))
  })

  it('brings its group, or only itself', () => {
    const a = zone({ id: 'a', group: 'g1' })
    const b = zone({ id: 'b', group: 'g1' })
    const c = zone({ id: 'c' })
    expect(kin(a, [a, b, c]).length).toBe(2)
    expect(kin(c, [a, b, c])).toEqual([c])
  })
})

describe('storeys', () => {
  it('counts what was added and never fewer than the zones need', () => {
    expect(storeyCountOf(sheetOf([]))).toBe(2)
    expect(storeyCountOf(sheetOf([zone({ storey: 2 })]))).toBe(3)
    expect(storeyOf(zone({ storey: 9 }))).toBe(2)
    expect(storeyNameOf(1)).toBe('First')
  })

  it('shows one storey, and the stair on every one', () => {
    const ground = zone({ id: 'g', storey: 0 })
    const up = zone({ id: 'u', storey: 1 })
    const stair = zone({ id: 's', kind: 'stair', cat: 'circulation', storey: 0 })
    const sheet = sheetOf([ground, up, stair])
    expect(placedZones(sheet, 1).map((r) => r.id)).toEqual(['u', 's'])
    expect(acrossStoreys(stair, sheet.settings)).toBe(true)
    expect(acrossStoreys(stair, { ...sheet.settings, stairAcross: 0 })).toBe(false)
    expect(allPlaced(sheet).length).toBe(3)
  })

  it('reads a zone taller than its storey as open to below on the floor above', () => {
    const tall = zone({ id: 't', storey: 0, height: 7 })
    const sheet = sheetOf([tall])
    expect(stH(sheet.settings, 0)).toBe(3.5)
    expect(tallZone(tall, sheet)).toBe(true)
    expect(ghostsOf(sheet, 1).map((r) => r.id)).toEqual(['t'])
    expect(isGhost(tall, 1, sheet)).toBe(true)
    expect(isGhost(tall, 0, sheet)).toBe(false)
    expect(zTop(tall, sheet)).toBe(7)
  })

  it('gives a zone its storey’s height unless it has its own, and caps it', () => {
    const plain = zone()
    const sheet = sheetOf([plain])
    expect(heightOf(plain, sheet)).toBe(3.5)
    expect(heightOf(zone({ height: 5 }), sheet)).toBe(5)
    expect(heightCap(plain, sheet.settings)).toBe(15)
    expect(zTop(zone({ height: 20 }), sheet)).toBe(15)
  })

  it('offers the storeys below and above to snap to, unless the setting says not to', () => {
    const ground = zone({ id: 'g', storey: 0 })
    const up = zone({ id: 'u', storey: 1 })
    expect(snapZones(sheetOf([ground, up]), 0, null).map((r) => r.id)).toEqual(['g', 'u'])
    expect(snapZones(sheetOf([ground, up], { snapStoreys: 0 }), 0, null).map((r) => r.id)).toEqual([
      'g',
    ])
  })
})
