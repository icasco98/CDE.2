import { describe, expect, it } from 'vitest'
import {
  MASS_VIEWS,
  blindWall,
  breaches,
  heightFromDrag,
  lookFrom,
  massPivot,
  massProjection,
  orderPrisms,
  prismsOf,
  seenWalls,
  worldLoop,
  MASS_START,
} from './mass'
import { heightOf, report, sheetOf, snapHeight, storeyCountOf, tallRoom, zTop } from './index'
import { voidOn, type Room, type Sheet } from './model'
import { hold, allowedBox } from './settle'
import { BUILD } from './plot'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 12,
  x: 4,
  y: 4,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  storey: 0,
  placed: true,
  placedAt: 1,
  ...over,
})

const sheet = (rooms: Room[], over: Partial<Sheet['settings']> = {}): Sheet =>
  sheetOf(rooms, over, 2)

describe('the projection', () => {
  it('puts the middle of the plot in the middle of the box and inverts a pixel back to the ground', () => {
    const P = massProjection(MASS_START, 600, 420)
    const middle = P.to(10, 12.5, 0)
    expect(Math.round(middle[0])).toBe(300)
    const back = P.ground(middle[0], middle[1])
    expect(back[0]).toBeCloseTo(10, 6)
    expect(back[1]).toBeCloseTo(12.5, 6)
  })

  it('draws a point higher up the screen the higher it stands', () => {
    const P = massProjection(MASS_START, 600, 420)
    expect(P.to(10, 12.5, 3.5)[1]).toBeLessThan(P.to(10, 12.5, 0)[1])
  })

  it('keeps the same scale from every preset, so turning never zooms the mass', () => {
    const scales = (Object.keys(MASS_VIEWS) as (keyof typeof MASS_VIEWS)[]).map(
      (name) => massProjection(lookFrom(MASS_START, name), 600, 420).s,
    )
    expect(new Set(scales.map((s) => s.toFixed(6))).size).toBe(1)
  })
})

describe('a height pulled on each storey', () => {
  it('snaps to the floor above and to two storeys on the ground', () => {
    const plan = sheet([room()])
    expect(snapHeight(3.6, plan.rooms[0]!, plan)).toEqual({ h: 3.5, why: 'the floor above' })
    expect(snapHeight(6.9, plan.rooms[0]!, plan)).toEqual({ h: 7, why: 'two storeys' })
  })

  it('snaps to the first storey’s own height, which may differ from the ground’s', () => {
    const plan = sheet([room({ storey: 1 })], { storeyH: 3.5, storeyH1: 4.2 })
    expect(snapHeight(4.3, plan.rooms[0]!, plan)).toEqual({ h: 4.2, why: 'the floor above' })
    expect(snapHeight(7.75, plan.rooms[0]!, plan)).toEqual({ h: 7.7, why: 'two storeys' })
  })

  it('the stair reaches the storeys’ roofs and stops at 18 m', () => {
    const stair = room({ id: 's', name: 'Stair', kind: 'stair', cat: 'circulation' })
    const plan = sheet([stair])
    expect(heightOf(stair, plan)).toBe(7)
    const pulled = heightFromDrag(stair, plan, 7, -400, 8)
    expect(pulled.h).toBe(18)
    expect(heightFromDrag(stair, plan, 7, -4, 8)).toEqual({
      h: 7,
      why: "the first storey's roof",
    })
  })

  it('a zone is never pulled past the rulebook’s 15 m', () => {
    const plan = sheet([room()])
    expect(heightFromDrag(plan.rooms[0]!, plan, 3.5, -900, 8).h).toBe(15)
  })
})

describe('a ground room taller than its storey', () => {
  const tall = room({ id: 'g', name: 'Diwaniya', height: 6 })
  const plan = sheet([tall])

  it('stands open to below on the storey above, where nothing may be placed on it', () => {
    expect(tallRoom(tall, plan)).toBe(true)
    expect(zTop(tall, plan)).toBe(6)
    expect(voidOn(tall, 1, plan)).toBe(true)
    // the landing rule never moves what is open to below, so a room dropped on it overlaps and waits
    expect(allowedBox(plan, 1)).toEqual(BUILD)
    const upstairs = hold(room({ id: 'u', storey: 1, x: 0, y: 0 }), plan, 1)
    expect(upstairs.x).toBeGreaterThanOrEqual(BUILD.x)
    expect(upstairs.y).toBeGreaterThanOrEqual(BUILD.y)
  })

  it('is no longer open to below once it is no taller than the storey', () => {
    const level = sheet([room({ id: 'g', name: 'Diwaniya', height: 3.5 })])
    expect(voidOn(level.rooms[0]!, 1, level)).toBe(false)
  })
})

describe('the report of two storeys', () => {
  it('adds both storeys and reads them against the 1050 m² the 210 % ratio allows', () => {
    const plan = sheet([
      room({ id: 'a', w: 10, h: 10 }),
      room({ id: 'b', storey: 1, w: 10, h: 10, x: 2, y: 2 }),
    ])
    expect(storeyCountOf(plan)).toBe(2)
    const read = report(plan, 1)
    expect(read.floors).toEqual([100, 100])
    expect(read.total).toBe(200)
    expect(read.allowed).toBe(1050)
    expect(read.overRatio).toBe(false)
    expect(read.storeyName).toBe('First')
  })

  it('says so when the two storeys together pass what the ratio allows', () => {
    const wide = (over: Partial<Room>) => room({ w: 17, h: 21.5, x: 1.5, y: 1.5, ...over })
    const plan = sheet([
      wide({ id: 'a' }),
      wide({ id: 'b', storey: 1 }),
      wide({ id: 'c', storey: 2 }),
    ])
    const read = report(plan, 2)
    expect(read.total).toBe(1096.5)
    expect(read.overRatio).toBe(true)
  })
})

describe('the wall-line tree', () => {
  const near = room({ id: 'near', name: 'Near', x: 4, y: 16, w: 5, h: 4 })
  const far = room({ id: 'far', name: 'Far', x: 4, y: 4, w: 5, h: 4, angle: 25 })

  const orderFrom = (view: keyof typeof MASS_VIEWS, plan: Sheet) => {
    const P = massProjection(lookFrom(MASS_START, view), 600, 420)
    const { order } = orderPrisms(prismsOf(plan, P), P)
    return order.map((b) => b.room.id)
  }

  it('draws the far volume first from the service street and the near one first from the north', () => {
    const plan = sheet([near, far])
    expect(orderFrom('service', plan)[0]).toBe('far')
    const P = massProjection({ ...MASS_START, theta: 180, phi: 28 }, 600, 420)
    const { order } = orderPrisms(prismsOf(plan, P), P)
    expect(order.map((b) => b.room.id)[0]).toBe('near')
  })

  it('keeps a turned room in the right order from every preset', () => {
    const plan = sheet([near, far])
    for (const view of ['service', 'corner', 'plan', 'side'] as const) {
      const ids = orderFrom(view, plan)
      expect(ids.length).toBeGreaterThanOrEqual(2)
      expect(new Set(ids).size).toBe(2)
    }
    // from the side street the two stand side by side across the view, so neither hides the other
    expect(orderFrom('side', plan).sort()).toEqual(['far', 'near'])
  })

  it('draws the storey above after the ground where the two stand over one another', () => {
    const plan = sheet([
      room({ id: 'g', name: 'Ground room', x: 4, y: 4, w: 5, h: 4 }),
      room({ id: 'u', name: 'Upper room', x: 4, y: 4, w: 5, h: 4, storey: 1 }),
    ])
    expect(orderFrom('corner', plan)).toEqual(['g', 'u'])
  })
})

describe('the walls the eye sees', () => {
  it('shows the two walls turned toward the viewer and hides the two behind', () => {
    const plan = sheet([room({ w: 5, h: 4 })])
    const P = massProjection(lookFrom(MASS_START, 'corner'), 600, 420)
    const prisms = prismsOf(plan, P)
    expect(prisms.length).toBe(1)
    expect(seenWalls(prisms[0]!, P).length).toBe(2)
  })

  it('reads a wall on the plot boundary as blind, and over 5 m as a breach', () => {
    expect(blindWall([0, 4], [0, 9])).toBe(true)
    expect(blindWall([4, 4], [4, 9])).toBe(false)
    expect(breaches(5)).toBe(false)
    expect(breaches(6)).toBe(true)
  })
})

describe('what the view turns about', () => {
  it('is the middle of the plot with nothing selected, and the selection otherwise', () => {
    const plan = sheet([room({ x: 2, y: 3, w: 4, h: 4 })])
    expect(massPivot(plan, [])).toEqual([10, 12.5, 0])
    expect(massPivot(plan, ['a'])).toEqual([4, 5, 0])
  })

  it('reads a room’s footprint in plot metres, turned and all', () => {
    const turned = room({ x: 4, y: 4, w: 4, h: 4, angle: 45 })
    const loop = worldLoop(turned)
    expect(loop.length).toBe(4)
    for (const p of loop) expect(Math.hypot(p[0] - 6, p[1] - 6)).toBeCloseTo(Math.hypot(2, 2), 6)
  })
})
