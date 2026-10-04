import { describe, expect, it } from 'vitest'
import {
  allowedBox,
  giveWay,
  hold,
  holdIn,
  outsideBuildable,
  overlapsOf,
  partingMove,
  pushFrom,
  resolve,
  settle,
  yieldTo,
} from './settle'
import { DEFAULT_PLOT } from './plot'

const BUILD = DEFAULT_PLOT.build
const PLOT = DEFAULT_PLOT
import { sheetOf, type Zone } from './model'
import { areaOf, r2 } from './geometry'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
  cat: 'shared',
  target: 16,
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

const push = (zones: Zone[]) => sheetOf(zones, { rule: 'push', closeGap: 0 })

describe('where a zone is held', () => {
  it('holds a zone inside the setback line, or out to the boundary, or on the plot', () => {
    const sheet = sheetOf([], { boundary: 'off', allowSpill: 0 })
    expect(allowedBox(sheet, 0)).toEqual(BUILD)
    expect(allowedBox(sheetOf([], { boundary: 'sides' }), 0)).toEqual({
      x: 0,
      y: 0,
      w: PLOT.w,
      h: BUILD.y + BUILD.h,
    })
    expect(allowedBox(sheetOf([], { boundary: 'all' }), 0)).toEqual({
      x: 0,
      y: 0,
      w: PLOT.w,
      h: PLOT.h,
    })
  })

  it('holds the setback hard upstairs whatever the boundary says', () => {
    expect(allowedBox(sheetOf([], { boundary: 'all', hardSetback: 1 }), 1)).toEqual(BUILD)
  })

  it('brings a zone back onto the plot', () => {
    const held = hold(zone({ x: 19, y: 24 }), sheetOf([], { allowSpill: 1 }), 0)
    expect([held.x, held.y]).toEqual([16, 21])
  })

  it('reads a zone past the line it may reach', () => {
    const box = allowedBox(sheetOf([], { boundary: 'off' }), 0)
    expect(outsideBuildable(zone({ x: 0, y: 0 }), box)).toBe(true)
    expect(outsideBuildable(zone({ x: 2, y: 2 }), box)).toBe(false)
    expect(holdIn(zone({ x: 0, y: 0 }), box).x).toBe(BUILD.x)
  })
})

describe('parting two zones', () => {
  it('gives the shortest way out, and nothing when they do not touch', () => {
    const a = zone({ x: 0, y: 0, w: 6, h: 6 })
    const b = zone({ id: 'b', x: 5, y: 1, w: 4, h: 4 })
    const m = partingMove(a, b)!
    expect([r2(m[0]), Math.abs(r2(m[1]))]).toEqual([1, 0])
    expect(partingMove(a, zone({ id: 'c', x: 9, y: 9 }))).toBeNull()
  })

  it('parts a turned zone along its own edge', () => {
    const a = zone({ x: 0, y: 0, w: 6, h: 6, angle: 45 })
    const m = partingMove(a, zone({ id: 'b', x: 3.5, y: 3.5, w: 2, h: 2, angle: 45 }))!
    expect(r2(Math.hypot(m[0], m[1]))).toBeGreaterThan(0)
  })
})

describe('Push', () => {
  /** The 4 × 4 dropped on the middle of the 6 × 6: the overlap is square, so it slides down. */
  it('a 4 × 4 dropped on the middle of a 6 × 6 slides the lower zone by the least parting move', () => {
    const mover = zone({ id: 'm', name: 'M', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const lower = zone({ id: 'l', name: 'L', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = push([mover, lower])
    const moved = pushFrom(mover, sheet.zones, sheet, 0)
    expect([...moved.keys()]).toEqual(['l'])
    expect([lower.x, lower.y]).toEqual([0, 5])
    expect([mover.x, mover.y]).toEqual([1, 1])
  })

  it('never moves a locked zone: what landed on it is set off instead', () => {
    const mover = zone({ id: 'm', name: 'M', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const locked = zone({ id: 'l', name: 'L', x: 0, y: 0, w: 6, h: 6, locked: true })
    const sheet = push([mover, locked])
    pushFrom(mover, sheet.zones, sheet, 0)
    expect([locked.x, locked.y]).toEqual([0, 0])
    expect(mover.y).toBe(6)
  })

  it('takes a grouped zone along', () => {
    const mover = zone({ id: 'm', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const lower = zone({ id: 'l', x: 0, y: 0, w: 6, h: 6, group: 'g1', placedAt: 1 })
    const mate = zone({ id: 'k', x: 12, y: 0, w: 2, h: 2, group: 'g1', placedAt: 1 })
    const sheet = push([mover, lower, mate])
    pushFrom(mover, sheet.zones, sheet, 0)
    expect(mate.y).toBe(5)
  })
})

describe('Yield and carve', () => {
  it('cuts the dropped zone back on the side that loses least', () => {
    const mover = zone({ id: 'm', x: 0, y: 0, w: 4, h: 4 })
    const other = zone({ id: 'o', x: 3, y: 0, w: 4, h: 4 })
    const out = yieldTo(mover, [mover, other], sheetOf([]).settings)!
    expect(r2(areaOf(out))).toBe(12)
    expect(out.w).toBe(3)
  })

  it('sends the zone back when yielding leaves it under a metre', () => {
    const mover = zone({ id: 'm', x: 0, y: 0, w: 4, h: 4 })
    const other = zone({ id: 'o', x: 0.5, y: 0, w: 4, h: 4 })
    expect(yieldTo(mover, [mover, other], sheetOf([]).settings)).toBeNull()
    expect(mover.placed).toBe(false)
  })

  it('carves the loser by the winner’s shape', () => {
    const winner = zone({ id: 'w', x: 3, y: 0, w: 4, h: 4 })
    const loser = zone({ id: 'l', x: 0, y: 0, w: 4, h: 4 })
    const sheet = sheetOf([winner, loser])
    expect(giveWay(loser, winner, 'carve', new Map(), sheet, 0)).toBe(true)
    expect(r2(areaOf(loser))).toBe(12)
  })

  it('refuses to make a fixed zone give way', () => {
    const winner = zone({ id: 'w', x: 3, y: 0 })
    const court = zone({ id: 'c', x: 0, y: 0, fixed: true })
    const sheet = sheetOf([winner, court])
    expect(giveWay(court, winner, 'carve', new Map(), sheet, 0)).toBe(false)
  })

  it('resolves an overlap by hand for every zone under the one in hand', () => {
    const mover = zone({ id: 'm', name: 'M', x: 3, y: 0, w: 4, h: 4, placedAt: 2 })
    const under = zone({ id: 'u', name: 'U', x: 0, y: 0, w: 4, h: 4, placedAt: 1 })
    const sheet = sheetOf([mover, under])
    resolve(mover, 'carve', sheet, 0)
    expect(r2(areaOf(under))).toBe(12)
  })
})

describe('settling after a move', () => {
  it('leaves the overlap tinted and waiting under Wait', () => {
    const mover = zone({ id: 'm', x: 1, y: 1, placedAt: 2 })
    const lower = zone({ id: 'l', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = sheetOf([mover, lower], { rule: 'wait' })
    expect(settle(mover, sheet.settings.rule, sheet, 0).size).toBe(0)
    expect(overlapsOf(sheet, 0).length).toBe(1)
  })

  it('settles every overlap the move made under Push, the lower zone giving way', () => {
    const mover = zone({ id: 'm', x: 1, y: 1, w: 4, h: 4, placedAt: 3 })
    const lower = zone({ id: 'l', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = push([mover, lower])
    const moved = settle(mover, 'push', sheet, 0)
    expect(moved.has('l')).toBe(true)
    expect(overlapsOf(sheet, 0).length).toBe(0)
  })

  it('reads the overlaps of a storey, each pair once', () => {
    const sheet = sheetOf([
      zone({ id: 'a', x: 0, y: 0 }),
      zone({ id: 'b', x: 2, y: 0 }),
      zone({ id: 'c', x: 12, y: 0 }),
    ])
    const ov = overlapsOf(sheet, 0)
    expect(ov.length).toBe(1)
    expect([ov[0]!.a.id, ov[0]!.b.id]).toEqual(['a', 'b'])
  })
})
