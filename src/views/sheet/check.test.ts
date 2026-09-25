import { describe, expect, it } from 'vitest'
import { sheetOf, type Door, type Room, type Sheet } from '../../sheet'
import { checkRead, linesFrom, pairKey, type SheetEdge } from './check'

/*
 * Reference cases worked on paper: rooms 4 × 3 m on the ground, standing side by side so the wall
 * they share is known before anything is measured.
 */

const room = (id: string, over: Partial<Room> = {}): Room => ({
  id,
  name: id,
  kind: 'room',
  cat: 'shared',
  target: 12,
  x: 2,
  y: 2,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  storey: 0,
  ...over,
})

const door = (id: string, pair?: [string, string]): Door => ({
  id,
  type: 'door',
  w: 0.9,
  at: [4, 1.5],
  flip: false,
  hinge: false,
  ...(pair ? { pair } : {}),
})

const edge = (a: string, b: string): SheetEdge => ({ a, b, storey: 0 })

const none = { apart: [], through: new Set<string>() }

const sheet = (rooms: Room[]): Sheet => sheetOf(rooms)

describe('ready in the zoning step', () => {
  it('is a shared run of wall a door wide, and not a shorter run or a corner', () => {
    const a = room('a')
    // b beside a along its whole 3 m wall; c meets a for 0.5 m; d touches a at one corner.
    const b = room('b', { x: 6 })
    const c = room('c', { x: 6, y: 4.5, h: 3 })
    const d = room('d', { x: 6, y: 5 })
    const read = checkRead(
      sheet([a, b, c, d]),
      0,
      { edges: [edge('a', 'b'), edge('a', 'c'), edge('a', 'd')], ...none },
      'zoning',
    )
    expect(read.waiting.map((each) => each.b)).toEqual(['c', 'd'])
  })

  it('is never ready while either room waits in the program', () => {
    const read = checkRead(
      sheet([room('a'), room('b', { x: 6, placed: false })]),
      0,
      { edges: [edge('a', 'b')], ...none },
      'zoning',
    )
    expect(read.waiting).toHaveLength(1)
  })
})

describe('met in the Openings step', () => {
  it('is a door that recorded the pair, and not a door on the same wall that did not', () => {
    const paired = checkRead(
      sheet([room('a', { doors: [door('d1', ['b', 'a'])] }), room('b', { x: 6 })]),
      0,
      { edges: [edge('a', 'b')], ...none },
      'openings',
    )
    expect(paired.waiting).toEqual([])
    const bare = checkRead(
      sheet([room('a', { doors: [door('d1')] }), room('b', { x: 6 })]),
      0,
      { edges: [edge('a', 'b')], ...none },
      'openings',
    )
    expect(bare.waiting).toHaveLength(1)
  })
})

describe('keep apart on the sheet', () => {
  it('marks a door that joins a pair kept apart, and both rooms of a pair one reaches only through the other', () => {
    const rooms = [
      room('a', { doors: [door('d1', ['a', 'b'])] }),
      room('b', { x: 6 }),
      room('c', { y: 5 }),
      room('e', { x: 6, y: 5 }),
    ]
    const read = checkRead(
      sheet(rooms),
      0,
      {
        edges: [],
        apart: [
          { a: 'a', b: 'b' },
          { a: 'c', b: 'e' },
        ],
        through: new Set([pairKey('c', 'e')]),
      },
      'zoning',
    )
    expect([...read.apartDoors]).toEqual(['d1'])
    expect([...read.apartRooms].sort()).toEqual(['c', 'e'])
    expect(read.broken).toBe(2)
  })
})

describe('the lines from a room', () => {
  it('run to rooms placed on this storey and to rooms still in the program', () => {
    const rooms = [
      room('a'),
      room('b', { x: 9 }),
      room('t', { placed: false }),
      room('u', { storey: 1, x: 12 }),
    ]
    const waiting = [edge('a', 'b'), edge('t', 'a'), edge('a', 'u'), edge('b', 't')]
    expect(linesFrom('a', waiting, sheet(rooms), 0)).toEqual({ placed: ['b'], tray: ['t'] })
  })
})

describe('the budget', () => {
  it('reads forty rooms and the lines from one of them in under 4 ms', () => {
    const rooms = Array.from({ length: 40 }, (_, i) =>
      room(`r${i}`, {
        x: 1 + (i % 8) * 4,
        y: 1 + Math.floor(i / 8) * 3,
        placed: i % 10 !== 9,
        doors: i % 3 === 0 ? [door(`d${i}`, [`r${i}`, `r${i + 1}`])] : [],
      }),
    )
    const big = sheetOf(rooms, {}, 1, { ...sheetOf([]).plot, w: 40, h: 20 })
    const edges = rooms.flatMap((_, i) => [
      edge(`r${i}`, `r${(i + 1) % 40}`),
      edge(`r${i}`, `r${(i + 8) % 40}`),
    ])
    const input = { edges, apart: [{ a: 'r0', b: 'r1' }], through: new Set<string>() }
    const once = () => {
      const read = checkRead(big, 0, input, 'zoning')
      linesFrom('r12', read.waiting, big, 0)
    }
    for (let i = 0; i < 5; i++) once()
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const started = performance.now()
      once()
      best = Math.min(best, performance.now() - started)
    }
    console.info(`check on the sheet, 40 rooms, 80 edges: ${best.toFixed(3)} ms`)
    expect(best).toBeLessThan(4)
  })
})
