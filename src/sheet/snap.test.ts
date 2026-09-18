import { describe, expect, it } from 'vitest'
import {
  alignWall,
  closeGaps,
  gridRest,
  nearWalls,
  onPlot,
  snapAngle,
  snapHeight,
  snapMove,
  snapPoint,
  wallCandidates,
} from './snap'
import { DEFAULT_PLOT } from './plot'

const BUILD = DEFAULT_PLOT.build
const NORTH = DEFAULT_PLOT.north
const PLOT_BOX = DEFAULT_PLOT.box
import { DEFAULTS, heightCap, heightOf, sheetOf, type Room, type Sheet } from './model'
import { outlineOf, r2 } from './geometry'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 12,
  x: 0,
  y: 0,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

const onGround = (rooms: Room[], settings = {}): Sheet => sheetOf(rooms, settings)

describe('a room dropped', () => {
  const neighbour = room({ id: 'n', name: 'N', x: 0, y: 0, w: 4, h: 3 })
  const cands = wallCandidates([neighbour], { ...DEFAULTS, snapBuild: 0 })

  it('dropped 0.3 m from a neighbour lands on that wall; 0.53 m away it rests on the 0.25 m grid', () => {
    const near = snapMove(room({ id: 'm', x: 4.3, y: 0 }), cands, DEFAULTS)
    expect([near.rect.x, near.rect.y]).toEqual([4, 0])
    const far = snapMove(room({ id: 'm', x: 4.53, y: 0 }), cands, DEFAULTS)
    expect([far.rect.x, far.rect.y]).toEqual([4.5, 0])
  })

  it('rests a turned room on the grid by its middle', () => {
    const r = gridRest(room({ x: 0.13, y: 0.13, angle: 25 }), DEFAULTS)
    expect([r2(r.x + r.w / 2), r2(r.y + r.h / 2)]).toEqual([2.25, 1.75])
  })

  it('does not snap at all with the distance at nought', () => {
    const out = snapMove(room({ id: 'm', x: 4.3, y: 0 }), cands, { ...DEFAULTS, snapDist: 0 })
    expect(out.rect.x).toBe(4.25)
  })

  it('lands a corner on the setback line', () => {
    const out = snapMove(room({ id: 'm', x: 1.65, y: 1.7 }), wallCandidates([], DEFAULTS), DEFAULTS)
    expect([out.rect.x, out.rect.y]).toEqual([BUILD.x, BUILD.y])
  })

  it('draws the guide of the wall it agreed with', () => {
    const out = snapMove(room({ id: 'm', x: 4.3, y: 0 }), cands, DEFAULTS)
    expect(out.corner).toEqual([4, 0])
  })
})

describe('a wall dragged', () => {
  it('lines up with a neighbour’s wall within the snap distance', () => {
    const r = room({ x: 0, y: 0, w: 4, h: 3 })
    const seg = outlineOf(r).find((s) => s.n[0] === 1)!
    const other = room({ id: 'b', x: 4.7, y: 0, w: 2, h: 3 })
    const out = alignWall(r, seg, 0.5, [other], { ...DEFAULTS, snapBuild: 0 })
    expect(out.s).toBe(0.7)
    expect(out.guide).toBeDefined()
  })

  it('leaves the pull alone when nothing is in reach', () => {
    const r = room()
    const seg = outlineOf(r)[0]!
    expect(alignWall(r, seg, 0.5, [], { ...DEFAULTS, snapBuild: 0 }).s).toBe(0.5)
  })
})

describe('a point drawn', () => {
  const cands = wallCandidates([room({ x: 2, y: 2, w: 4, h: 3 })], { ...DEFAULTS, snapBuild: 0 })

  it('catches a corner first', () => {
    const out = snapPoint([2.1, 2.1], cands, null, false, DEFAULTS, [])
    expect(out.kind).toBe('corner')
    expect(out.at).toEqual([2, 2])
  })

  it('lands on a wall, and says so', () => {
    const out = snapPoint([4, 2.2], cands, null, false, DEFAULTS, [])
    expect(out.kind).toBe('wall')
    expect(out.at[1]).toBe(2)
  })

  it('stays where the pointer is with Shift held', () => {
    expect(snapPoint([2.1, 2.1], cands, null, true, DEFAULTS, []).kind).toBe('free')
  })

  it('falls back to the grid', () => {
    const out = snapPoint([9.1, 9.1], cands, null, false, DEFAULTS, [])
    expect([out.kind, out.at]).toEqual(['grid', [9, 9]])
  })

  it('keeps a drawn point on the plot', () => {
    expect(onPlot([-3, 40], PLOT_BOX)).toEqual([0, 25])
  })
})

describe('turning', () => {
  it('locks onto an angle a neighbour already stands at', () => {
    const mate = room({ id: 'b', angle: 25 })
    const out = snapAngle(27, [], [mate], DEFAULTS, NORTH)
    expect([out.angle, out.locked, out.mate?.id]).toEqual([25, true, 'b'])
  })

  it('falls back to the step, counted from the sheet or from north', () => {
    expect(snapAngle(37, [], [], DEFAULTS, NORTH).angle).toBe(30)
    expect(snapAngle(37, [], [], { ...DEFAULTS, turnFrom: 'north' }, NORTH).angle).toBe(40)
    expect(snapAngle(37.4, [], [], { ...DEFAULTS, rotSnap: 0 }, NORTH).angle).toBe(37.4)
  })
})

describe('a height pulled', () => {
  it('a ground room with storeys of 3.5 pulled to 3.6 reads 3.5, the floor above', () => {
    const sheet = onGround([room()])
    const out = snapHeight(3.6, sheet.rooms[0]!, sheet)
    expect(out).toEqual({ h: 3.5, why: 'the floor above' })
    expect(snapHeight(7.05, sheet.rooms[0]!, sheet)).toEqual({ h: 7, why: 'two storeys' })
  })

  it('the stair unset reads 7 and stops at 18', () => {
    const stair = room({ id: 's', name: 'Stair', kind: 'stair', cat: 'circulation' })
    const sheet = onGround([stair])
    expect(heightOf(stair, sheet)).toBe(7)
    expect(heightCap(stair, sheet.settings)).toBe(18)
    expect(snapHeight(7.1, stair, sheet)).toEqual({ h: 7, why: "the first storey's roof" })
  })

  it('snaps to another zone’s height, and else to the tenth of a metre', () => {
    const tall = room({ id: 'b', name: 'B', x: 9, y: 9, height: 5 })
    const sheet = onGround([room(), tall])
    expect(snapHeight(4.95, sheet.rooms[0]!, sheet)).toEqual({ h: 5, why: 'same as B' })
    expect(snapHeight(4.44, sheet.rooms[0]!, sheet)).toEqual({ h: 4.4, why: '' })
  })
})

describe('gaps', () => {
  it('finds the facing walls of two rooms a few centimetres apart', () => {
    const a = room({ x: 4.08, y: 0, w: 4, h: 3, placedAt: 2 })
    const b = room({ id: 'b', x: 0, y: 0, w: 4, h: 3, placedAt: 1 })
    const near = nearWalls(a, b, 0.1)
    expect(near.length).toBe(1)
    expect(r2(near[0]!.d)).toBe(0.08)
  })

  it('closes the gap, the newer room’s wall moving', () => {
    const a = room({ x: 4.08, y: 0, w: 4, h: 3, placedAt: 2 })
    const b = room({ id: 'b', x: 0, y: 0, w: 4, h: 3, placedAt: 1 })
    const moved = closeGaps([a, b], null, DEFAULTS)
    expect([...moved]).toEqual(['a'])
    expect(r2(a.x)).toBe(4)
    expect(b.x).toBe(0)
  })

  it('leaves the rooms alone with gap closing off', () => {
    const a = room({ x: 4.08, y: 0, placedAt: 2 })
    const b = room({ id: 'b', x: 0, y: 0, placedAt: 1 })
    expect(closeGaps([a, b], null, { ...DEFAULTS, closeGap: 0 }).size).toBe(0)
    expect(a.x).toBe(4.08)
  })
})
