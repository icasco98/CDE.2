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
import { sheetOf, type Room } from './model'
import { areaOf, r2 } from './geometry'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
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

const push = (rooms: Room[]) => sheetOf(rooms, { rule: 'push', closeGap: 0 })

describe('where a room is held', () => {
  it('holds a room inside the setback line, or out to the boundary, or on the plot', () => {
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

  it('brings a room back onto the plot', () => {
    const held = hold(room({ x: 19, y: 24 }), sheetOf([], { allowSpill: 1 }), 0)
    expect([held.x, held.y]).toEqual([16, 21])
  })

  it('reads a room past the line it may reach', () => {
    const box = allowedBox(sheetOf([], { boundary: 'off' }), 0)
    expect(outsideBuildable(room({ x: 0, y: 0 }), box)).toBe(true)
    expect(outsideBuildable(room({ x: 2, y: 2 }), box)).toBe(false)
    expect(holdIn(room({ x: 0, y: 0 }), box).x).toBe(BUILD.x)
  })
})

describe('parting two rooms', () => {
  it('gives the shortest way out, and nothing when they do not touch', () => {
    const a = room({ x: 0, y: 0, w: 6, h: 6 })
    const b = room({ id: 'b', x: 5, y: 1, w: 4, h: 4 })
    const m = partingMove(a, b)!
    expect([r2(m[0]), Math.abs(r2(m[1]))]).toEqual([1, 0])
    expect(partingMove(a, room({ id: 'c', x: 9, y: 9 }))).toBeNull()
  })

  it('parts a turned room along its own wall', () => {
    const a = room({ x: 0, y: 0, w: 6, h: 6, angle: 45 })
    const m = partingMove(a, room({ id: 'b', x: 3.5, y: 3.5, w: 2, h: 2, angle: 45 }))!
    expect(r2(Math.hypot(m[0], m[1]))).toBeGreaterThan(0)
  })
})

describe('Push', () => {
  /** The 4 × 4 dropped on the middle of the 6 × 6: the overlap is square, so it slides down. */
  it('a 4 × 4 dropped on the middle of a 6 × 6 slides the lower room by the least parting move', () => {
    const mover = room({ id: 'm', name: 'M', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const lower = room({ id: 'l', name: 'L', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = push([mover, lower])
    const moved = pushFrom(mover, sheet.rooms, sheet, 0)
    expect([...moved.keys()]).toEqual(['l'])
    expect([lower.x, lower.y]).toEqual([0, 5])
    expect([mover.x, mover.y]).toEqual([1, 1])
  })

  it('never moves a locked room: what landed on it is set off instead', () => {
    const mover = room({ id: 'm', name: 'M', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const locked = room({ id: 'l', name: 'L', x: 0, y: 0, w: 6, h: 6, locked: true })
    const sheet = push([mover, locked])
    pushFrom(mover, sheet.rooms, sheet, 0)
    expect([locked.x, locked.y]).toEqual([0, 0])
    expect(mover.y).toBe(6)
  })

  it('takes a grouped room along', () => {
    const mover = room({ id: 'm', x: 1, y: 1, w: 4, h: 4, placedAt: 2 })
    const lower = room({ id: 'l', x: 0, y: 0, w: 6, h: 6, group: 'g1', placedAt: 1 })
    const mate = room({ id: 'k', x: 12, y: 0, w: 2, h: 2, group: 'g1', placedAt: 1 })
    const sheet = push([mover, lower, mate])
    pushFrom(mover, sheet.rooms, sheet, 0)
    expect(mate.y).toBe(5)
  })
})

describe('Yield and carve', () => {
  it('cuts the dropped room back on the side that loses least', () => {
    const mover = room({ id: 'm', x: 0, y: 0, w: 4, h: 4 })
    const other = room({ id: 'o', x: 3, y: 0, w: 4, h: 4 })
    const out = yieldTo(mover, [mover, other], sheetOf([]).settings)!
    expect(r2(areaOf(out))).toBe(12)
    expect(out.w).toBe(3)
  })

  it('sends the room back when yielding leaves it under a metre', () => {
    const mover = room({ id: 'm', x: 0, y: 0, w: 4, h: 4 })
    const other = room({ id: 'o', x: 0.5, y: 0, w: 4, h: 4 })
    expect(yieldTo(mover, [mover, other], sheetOf([]).settings)).toBeNull()
    expect(mover.placed).toBe(false)
  })

  it('carves the loser by the winner’s shape', () => {
    const winner = room({ id: 'w', x: 3, y: 0, w: 4, h: 4 })
    const loser = room({ id: 'l', x: 0, y: 0, w: 4, h: 4 })
    const sheet = sheetOf([winner, loser])
    expect(giveWay(loser, winner, 'carve', new Map(), sheet, 0)).toBe(true)
    expect(r2(areaOf(loser))).toBe(12)
  })

  it('refuses to make a fixed room give way', () => {
    const winner = room({ id: 'w', x: 3, y: 0 })
    const court = room({ id: 'c', x: 0, y: 0, fixed: true })
    const sheet = sheetOf([winner, court])
    expect(giveWay(court, winner, 'carve', new Map(), sheet, 0)).toBe(false)
  })

  it('resolves an overlap by hand for every room under the one in hand', () => {
    const mover = room({ id: 'm', name: 'M', x: 3, y: 0, w: 4, h: 4, placedAt: 2 })
    const under = room({ id: 'u', name: 'U', x: 0, y: 0, w: 4, h: 4, placedAt: 1 })
    const sheet = sheetOf([mover, under])
    resolve(mover, 'carve', sheet, 0)
    expect(r2(areaOf(under))).toBe(12)
  })
})

describe('settling after a move', () => {
  it('leaves the overlap tinted and waiting under Wait', () => {
    const mover = room({ id: 'm', x: 1, y: 1, placedAt: 2 })
    const lower = room({ id: 'l', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = sheetOf([mover, lower], { rule: 'wait' })
    expect(settle(mover, sheet.settings.rule, sheet, 0).size).toBe(0)
    expect(overlapsOf(sheet, 0).length).toBe(1)
  })

  it('settles every overlap the move made under Push, the lower room giving way', () => {
    const mover = room({ id: 'm', x: 1, y: 1, w: 4, h: 4, placedAt: 3 })
    const lower = room({ id: 'l', x: 0, y: 0, w: 6, h: 6, placedAt: 1 })
    const sheet = push([mover, lower])
    const moved = settle(mover, 'push', sheet, 0)
    expect(moved.has('l')).toBe(true)
    expect(overlapsOf(sheet, 0).length).toBe(0)
  })

  it('reads the overlaps of a storey, each pair once', () => {
    const sheet = sheetOf([
      room({ id: 'a', x: 0, y: 0 }),
      room({ id: 'b', x: 2, y: 0 }),
      room({ id: 'c', x: 12, y: 0 }),
    ])
    const ov = overlapsOf(sheet, 0)
    expect(ov.length).toBe(1)
    expect([ov[0]!.a.id, ov[0]!.b.id]).toEqual(['a', 'b'])
  })
})
