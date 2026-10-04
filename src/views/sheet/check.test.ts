import { describe, expect, it } from 'vitest'
import { sheetOf, type Door, type Zone, type Sheet } from '../../sheet'
import { checkRead, linesFrom, pairKey, type SheetConnection } from './check'

/*
 * Reference cases worked on paper: zones 4 × 3 m on the ground, standing side by side so the edge
 * they share is known before anything is measured.
 */

const zone = (id: string, over: Partial<Zone> = {}): Zone => ({
  id,
  name: id,
  kind: 'zone',
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

/** A door drawing connection `connection` into zone `to`, halfway along the edge the two share. */
const door = (id: string, connection: string, to: string): Door => ({
  id,
  connection,
  to,
  type: 'door',
  w: 0.9,
  along: 0.5,
  flip: false,
  hinge: false,
})

const connection = (a: string, b: string): SheetConnection => ({ id: `${a}-${b}`, a, b, storey: 0 })

const none = { apart: [], through: new Set<string>() }

const sheet = (zones: Zone[]): Sheet => sheetOf(zones)

describe('ready in the zoning step', () => {
  it('is a shared run of edge a door wide, and not a shorter run or a corner', () => {
    const a = zone('a')
    // b beside a along its whole 3 m edge; c meets a for 0.5 m; d touches a at one corner.
    const b = zone('b', { x: 6 })
    const c = zone('c', { x: 6, y: 4.5, h: 3 })
    const d = zone('d', { x: 6, y: 5 })
    const read = checkRead(
      sheet([a, b, c, d]),
      0,
      { connections: [connection('a', 'b'), connection('a', 'c'), connection('a', 'd')], ...none },
      'zoning',
    )
    expect(read.waiting.map((each) => each.b)).toEqual(['c', 'd'])
  })

  it('is never ready while either zone waits in the program', () => {
    const read = checkRead(
      sheet([zone('a'), zone('b', { x: 6, placed: false })]),
      0,
      { connections: [connection('a', 'b')], ...none },
      'zoning',
    )
    expect(read.waiting).toHaveLength(1)
  })
})

describe('met in the Openings step', () => {
  it('is the door of that connection, drawn on the edge the two zones share', () => {
    const met = checkRead(
      sheet([zone('a', { doors: [door('d1', 'a-b', 'b')] }), zone('b', { x: 6 })]),
      0,
      { connections: [connection('a', 'b')], ...none },
      'openings',
    )
    expect(met.waiting).toEqual([])
  })

  it('is not met by the door of another connection, nor by its own door once the zones part', () => {
    const other = checkRead(
      sheet([zone('a', { doors: [door('d1', 'elsewhere', 'b')] }), zone('b', { x: 6 })]),
      0,
      { connections: [connection('a', 'b')], ...none },
      'openings',
    )
    expect(other.waiting).toHaveLength(1)
    const parted = checkRead(
      sheet([zone('a', { doors: [door('d1', 'a-b', 'b')] }), zone('b', { x: 9 })]),
      0,
      { connections: [connection('a', 'b')], ...none },
      'openings',
    )
    expect(parted.waiting).toHaveLength(1)
  })
})

describe('keep apart on the sheet', () => {
  it('marks a door that joins a pair kept apart, and both zones of a pair one reaches only through the other', () => {
    const zones = [
      zone('a', { doors: [door('d1', 'a-b', 'b')] }),
      zone('b', { x: 6 }),
      zone('c', { y: 5 }),
      zone('e', { x: 6, y: 5 }),
    ]
    const read = checkRead(
      sheet(zones),
      0,
      {
        connections: [],
        apart: [
          { a: 'a', b: 'b' },
          { a: 'c', b: 'e' },
        ],
        through: new Set([pairKey('c', 'e')]),
      },
      'zoning',
    )
    expect([...read.apartDoors]).toEqual([['d1', [6, 3.5]]])
    expect([...read.apartZones].sort()).toEqual(['c', 'e'])
    expect(read.broken).toBe(2)
  })
})

describe('the lines from a zone', () => {
  it('run to zones placed on this storey and to zones still in the program', () => {
    const zones = [
      zone('a'),
      zone('b', { x: 9 }),
      zone('t', { placed: false }),
      zone('u', { storey: 1, x: 12 }),
    ]
    const waiting = [
      connection('a', 'b'),
      connection('t', 'a'),
      connection('a', 'u'),
      connection('b', 't'),
    ]
    expect(linesFrom('a', waiting, sheet(zones), 0)).toEqual({ placed: ['b'], tray: ['t'] })
  })
})

describe('the budget', () => {
  it('reads forty zones in both steps and the lines from one of them in under 4 ms', () => {
    const zones = Array.from({ length: 40 }, (_, i) =>
      zone(`r${i}`, {
        x: 1 + (i % 8) * 4,
        y: 1 + Math.floor(i / 8) * 3,
        placed: i % 10 !== 9,
        doors: i % 3 === 0 ? [door(`d${i}`, `r${i}-r${i + 1}`, `r${i + 1}`)] : [],
      }),
    )
    const big = sheetOf(zones, {}, 1, { ...sheetOf([]).plot, w: 40, h: 20 })
    const connections = zones.flatMap((_, i) => [
      connection(`r${i}`, `r${(i + 1) % 40}`),
      connection(`r${i}`, `r${(i + 8) % 40}`),
    ])
    const input = { connections, apart: [{ a: 'r0', b: 'r1' }], through: new Set<string>() }
    const once = () => {
      const read = checkRead(big, 0, input, 'zoning')
      linesFrom('r12', read.waiting, big, 0)
      checkRead(big, 0, input, 'openings')
    }
    for (let i = 0; i < 5; i++) once()
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const started = performance.now()
      once()
      best = Math.min(best, performance.now() - started)
    }
    console.info(`check on the sheet, 40 zones, 80 connections: ${best.toFixed(3)} ms`)
    expect(best).toBeLessThan(4)
  })
})
