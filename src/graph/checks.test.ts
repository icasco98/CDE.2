import { describe, expect, it } from 'vitest'
import { EXTERIOR, type EdgeKind } from '../model'
import { apartBroken, onlyThrough } from './apart'
import { graphChecks } from './checks'
import { crossings } from './crossings'
import { reachedFromOutside } from './reach'
import { noStair } from './stairs'
import { tierSkips } from './tierSkips'
import type { CheckEdge, CheckRoom } from './types'
import { unreached } from './unreached'

/*
 * Every check against a graph small enough to read by eye, each with the answer worked out by
 * hand. The house: a front door into the entry, a hallway behind it, the family living off the
 * hallway, a bedroom off the family living, a diwaniya with only its own street door, and a store
 * with no door at all.
 */

const room = (id: string, tier?: string, storey = 0, storeysSpanned = 1): CheckRoom => ({
  id,
  name: id,
  storey,
  storeysSpanned,
  ...(tier === undefined ? {} : { tier }),
})

const edge = (a: string, b: string, kind: EdgeKind = 'door', storey = 0): CheckEdge => ({
  a,
  b,
  kind,
  storey,
})

const rooms = [
  room('Entry', 'public'),
  room('Hallway', 'semi-public'),
  room('Family', 'private'),
  room('Bedroom', 'private'),
  room('Diwaniya', 'public'),
  room('Store'),
]

const edges = [
  edge(EXTERIOR, 'Entry', 'main-door'),
  edge('Entry', 'Hallway', 'open'),
  edge('Hallway', 'Family'),
  edge('Family', 'Bedroom'),
  edge(EXTERIOR, 'Diwaniya'),
]

describe('reached from outside', () => {
  it('follows the edges in from every entrance, the diwaniya’s own street door as much as the main door', () => {
    expect([...reachedFromOutside(edges)].sort()).toEqual([
      'Bedroom',
      'Diwaniya',
      'Entry',
      'Family',
      'Hallway',
    ])
  })

  it('names the store, which no door leads to', () => {
    expect(unreached(rooms, edges).map((check) => check.sentence)).toEqual([
      'Store is not reached from any entrance.',
    ])
  })

  it('says there is no front door, and still reaches the rooms behind another entrance', () => {
    const found = unreached(rooms, edges.slice(1))
    expect(found.map((check) => check.sentence)).toEqual([
      'There is no front door.',
      'Entry, Hallway, Family, Bedroom and Store are not reached from any entrance.',
    ])
  })

  it('says once that no room has a door to the outside, rather than naming every room', () => {
    const inside = edges.filter((each) => each.a !== EXTERIOR && each.b !== EXTERIOR)
    expect(unreached(rooms, inside).map((check) => check.sentence)).toEqual([
      'No room has a door to the outside, so no room is reached.',
    ])
  })

  it('reaches a room upstairs through the stair that spans both storeys', () => {
    const stairs = [
      edge(EXTERIOR, 'Entry', 'main-door'),
      edge('Entry', 'Stair', 'open'),
      edge('Stair', 'Landing', 'open', 1),
    ]
    const house = [
      room('Entry', 'public'),
      room('Stair', 'semi-public', 0, 2),
      room('Landing', 'semi-public', 1),
    ]
    expect(unreached(house, stairs)).toEqual([])
  })
})

describe('tier skips', () => {
  it('finds a private room joined to a public one or to the outside, and nothing else', () => {
    const skipping = [
      ...edges,
      edge('Bedroom', 'Diwaniya'),
      edge('Kitchen', EXTERIOR),
      edge('WC', EXTERIOR),
    ]
    const house = [...rooms, room('Kitchen', 'private'), room('WC', 'exempt')]
    expect(tierSkips(house, skipping).map((check) => check.sentence)).toEqual([
      'Bedroom, a private room, is joined to Diwaniya, a public one.',
      'Kitchen, a private room, opens straight onto the outside.',
    ])
  })

  it('finds none in the reference house, whose doors step one tier at a time', () => {
    expect(tierSkips(rooms, edges)).toEqual([])
  })
})

describe('crossings', () => {
  const five = ['A', 'B', 'C', 'D', 'E']
  const all = (names: readonly string[]) =>
    names.flatMap((one, i) => names.slice(i + 1).map((other) => edge(one, other)))

  it('finds five rooms each joined to every other, which no plan draws', () => {
    const found = crossings(
      five.map((id) => room(id)),
      all(five),
      2,
    )
    expect(found.map((check) => check.sentence)).toEqual([
      'Ground: its edges cannot all be drawn without one crossing another.',
    ])
  })

  it('lets four rooms each joined to every other stand', () => {
    expect(
      crossings(
        five.slice(0, 4).map((id) => room(id)),
        all(five.slice(0, 4)),
        1,
      ),
    ).toEqual([])
  })

  it('counts the outside: four rooms all joined and all on the street is five nodes, joined each to each', () => {
    const four = five.slice(0, 4)
    const onStreet = [...all(four), ...four.map((id) => edge(EXTERIOR, id))]
    expect(
      crossings(
        four.map((id) => room(id)),
        onStreet,
        1,
      ),
    ).toHaveLength(1)
  })
})

describe('keep apart', () => {
  it('finds an edge between a pair kept apart', () => {
    const found = apartBroken(rooms, edges, [{ a: 'Hallway', b: 'Entry' }])
    expect(found.map((check) => check.code)).toContain('apart-joined')
  })

  it('finds the family living on every route from the front door to the bedroom', () => {
    expect(onlyThrough({ a: 'Family', b: 'Bedroom' }, edges)).toEqual({
      room: 'Bedroom',
      through: 'Family',
    })
    const found = apartBroken(rooms, edges, [{ a: 'Bedroom', b: 'Hallway' }])
    expect(found.map((check) => check.sentence)).toEqual([
      'Bedroom is reached only through Hallway, and the two are kept apart.',
    ])
  })

  it('lets a pair stand when a second route goes round the room between', () => {
    const round = [...edges, edge('Hallway', 'Bedroom')]
    expect(apartBroken(rooms, round, [{ a: 'Family', b: 'Bedroom' }]).map((c) => c.code)).toEqual([
      'apart-joined',
    ])
  })

  it('says nothing of a pair whose rooms share a wall with no edge and no route through', () => {
    expect(apartBroken(rooms, edges, [{ a: 'Diwaniya', b: 'Family' }])).toEqual([])
  })
})

describe('a stair between the storeys', () => {
  it('is wanted by a house of two storeys whose program has none', () => {
    expect(noStair(rooms, 2).map((check) => check.sentence)).toEqual([
      'No stair connects the storeys.',
    ])
  })

  it('is not wanted on one storey, nor when a room spans two', () => {
    expect(noStair(rooms, 1)).toEqual([])
    expect(noStair([...rooms, room('Stair', 'semi-public', 0, 2)], 2)).toEqual([])
  })
})

describe('every check together', () => {
  it('reads the reference house with one keep-apart pair as three warnings, each with its source', () => {
    const found = graphChecks({ rooms, edges, apart: [{ a: 'Family', b: 'Bedroom' }], storeys: 1 })
    expect(found.map((check) => check.code)).toEqual(['unreached', 'apart-joined', 'apart-through'])
    for (const check of found) {
      expect(check.rule).not.toBe('')
      expect(check.source).not.toBe('')
    }
  })
})
