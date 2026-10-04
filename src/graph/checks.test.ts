import { describe, expect, it } from 'vitest'
import { EXTERIOR, type ConnectionKind } from '../model'
import { apartBroken, onlyThrough } from './apart'
import { graphChecks } from './checks'
import { crossings } from './crossings'
import { reachedFromOutside } from './reach'
import { noStair } from './stairs'
import { tierSkips } from './tierSkips'
import type { CheckConnection, CheckZone } from './types'
import { unreached } from './unreached'

/*
 * Every check against a graph small enough to read by eye, each with the answer worked out by
 * hand. The house: a front door into the entry, a hallway behind it, the family living off the
 * hallway, a bedroom off the family living, a diwaniya with only its own street door, and a store
 * with no door at all.
 */

const zone = (id: string, tier?: string, storey = 0, storeysSpanned = 1): CheckZone => ({
  id,
  name: id,
  storey,
  storeysSpanned,
  ...(tier === undefined ? {} : { tier }),
})

const connection = (
  a: string,
  b: string,
  kind: ConnectionKind = 'door',
  storey = 0,
): CheckConnection => ({
  a,
  b,
  kind,
  storey,
})

const zones = [
  zone('Entry', 'public'),
  zone('Hallway', 'semi-public'),
  zone('Family', 'private'),
  zone('Bedroom', 'private'),
  zone('Diwaniya', 'public'),
  zone('Store'),
]

const connections = [
  connection(EXTERIOR, 'Entry', 'main-door'),
  connection('Entry', 'Hallway', 'open'),
  connection('Hallway', 'Family'),
  connection('Family', 'Bedroom'),
  connection(EXTERIOR, 'Diwaniya'),
]

describe('reached from outside', () => {
  it('follows the connections in from every entrance, the diwaniya’s own street door as much as the main door', () => {
    expect([...reachedFromOutside(connections)].sort()).toEqual([
      'Bedroom',
      'Diwaniya',
      'Entry',
      'Family',
      'Hallway',
    ])
  })

  it('names the store, which no door leads to', () => {
    expect(unreached(zones, connections).map((check) => check.sentence)).toEqual([
      'Store is not reached from any entrance.',
    ])
  })

  it('says there is no front door, and still reaches the zones behind another entrance', () => {
    const found = unreached(zones, connections.slice(1))
    expect(found.map((check) => check.sentence)).toEqual([
      'There is no front door.',
      'Entry, Hallway, Family, Bedroom and Store are not reached from any entrance.',
    ])
  })

  it('says once that no zone has a door to the outside, rather than naming every zone', () => {
    const inside = connections.filter((each) => each.a !== EXTERIOR && each.b !== EXTERIOR)
    expect(unreached(zones, inside).map((check) => check.sentence)).toEqual([
      'No zone has a door to the outside, so no zone is reached.',
    ])
  })

  it('reaches a zone upstairs through the stair that spans both storeys', () => {
    const stairs = [
      connection(EXTERIOR, 'Entry', 'main-door'),
      connection('Entry', 'Stair', 'open'),
      connection('Stair', 'Landing', 'open', 1),
    ]
    const house = [
      zone('Entry', 'public'),
      zone('Stair', 'semi-public', 0, 2),
      zone('Landing', 'semi-public', 1),
    ]
    expect(unreached(house, stairs)).toEqual([])
  })
})

describe('tier skips', () => {
  it('finds a private zone joined to a public one or to the outside, and nothing else', () => {
    const skipping = [
      ...connections,
      connection('Bedroom', 'Diwaniya'),
      connection('Kitchen', EXTERIOR),
      connection('WC', EXTERIOR),
    ]
    const house = [...zones, zone('Kitchen', 'private'), zone('WC', 'exempt')]
    expect(tierSkips(house, skipping).map((check) => check.sentence)).toEqual([
      'Bedroom, a private zone, is joined to Diwaniya, a public one.',
      'Kitchen, a private zone, opens straight onto the outside.',
    ])
  })

  it('finds none in the reference house, whose doors step one tier at a time', () => {
    expect(tierSkips(zones, connections)).toEqual([])
  })
})

describe('crossings', () => {
  const five = ['A', 'B', 'C', 'D', 'E']
  const all = (names: readonly string[]) =>
    names.flatMap((one, i) => names.slice(i + 1).map((other) => connection(one, other)))

  it('finds five zones each joined to every other, which no plan draws', () => {
    const found = crossings(
      five.map((id) => zone(id)),
      all(five),
      2,
    )
    expect(found.map((check) => check.sentence)).toEqual([
      'Ground: its connections cannot all be drawn without one crossing another.',
    ])
  })

  it('lets four zones each joined to every other stand', () => {
    expect(
      crossings(
        five.slice(0, 4).map((id) => zone(id)),
        all(five.slice(0, 4)),
        1,
      ),
    ).toEqual([])
  })

  it('counts the outside: four zones all joined and all on the street is five nodes, joined each to each', () => {
    const four = five.slice(0, 4)
    const onStreet = [...all(four), ...four.map((id) => connection(EXTERIOR, id))]
    expect(
      crossings(
        four.map((id) => zone(id)),
        onStreet,
        1,
      ),
    ).toHaveLength(1)
  })
})

describe('keep apart', () => {
  it('finds a connection between a pair kept apart', () => {
    const found = apartBroken(zones, connections, [{ a: 'Hallway', b: 'Entry' }])
    expect(found.map((check) => check.code)).toContain('apart-joined')
  })

  it('finds the family living on every route from the front door to the bedroom', () => {
    expect(onlyThrough({ a: 'Family', b: 'Bedroom' }, connections)).toEqual({
      zone: 'Bedroom',
      through: 'Family',
    })
    const found = apartBroken(zones, connections, [{ a: 'Bedroom', b: 'Hallway' }])
    expect(found.map((check) => check.sentence)).toEqual([
      'Bedroom is reached only through Hallway, and the two are kept apart.',
    ])
  })

  it('lets a pair stand when a second route goes round the zone between', () => {
    const round = [...connections, connection('Hallway', 'Bedroom')]
    expect(apartBroken(zones, round, [{ a: 'Family', b: 'Bedroom' }]).map((c) => c.code)).toEqual([
      'apart-joined',
    ])
  })

  it('says nothing of a pair whose zones share an edge with no connection and no route through', () => {
    expect(apartBroken(zones, connections, [{ a: 'Diwaniya', b: 'Family' }])).toEqual([])
  })
})

describe('a stair between the storeys', () => {
  it('is wanted by a house of two storeys whose program has none', () => {
    expect(noStair(zones, 2).map((check) => check.sentence)).toEqual([
      'No stair connects the storeys.',
    ])
  })

  it('is not wanted on one storey, nor when a zone spans two', () => {
    expect(noStair(zones, 1)).toEqual([])
    expect(noStair([...zones, zone('Stair', 'semi-public', 0, 2)], 2)).toEqual([])
  })
})

describe('every check together', () => {
  it('reads the reference house with one keep-apart pair as three warnings, each with its source', () => {
    const found = graphChecks({
      zones,
      connections,
      apart: [{ a: 'Family', b: 'Bedroom' }],
      storeys: 1,
    })
    expect(found.map((check) => check.code)).toEqual(['unreached', 'apart-joined', 'apart-through'])
    for (const check of found) {
      expect(check.rule).not.toBe('')
      expect(check.source).not.toBe('')
    }
  })
})
