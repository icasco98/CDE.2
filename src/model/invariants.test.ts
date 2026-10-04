import { describe, expect, it } from 'vitest'
import { checkProject } from './invariants'
import { STARTING_HEIGHT_M, startingHousehold } from './project'
import { EXTERIOR, PROJECT_VERSION, type Connection, type Project, type Zone } from './types'

const zone = (id: string, extra: Partial<Zone> = {}): Zone => ({
  id,
  name: id,
  type: 'bedroom',
  storey: 0,
  storeysSpanned: 1,
  targetArea: 12,
  pinned: false,
  ...extra,
})

const connection = (
  id: string,
  a: string,
  b: string,
  extra: Partial<Connection> = {},
): Connection => ({
  id,
  a,
  b,
  kind: 'door',
  storey: 0,
  ...extra,
})

const project = (
  zones: readonly Zone[],
  connections: readonly Connection[] = [],
  storeys = 2,
): Project => ({
  id: 'project',
  name: 'test',
  storeys,
  heights: Array.from({ length: storeys }, () => STARTING_HEIGHT_M),
  plot: { on: false, polygon: [], north: 0, street: [] },
  household: startingHousehold,
  zones,
  connections,
  apart: [],
  declined: [],
  actors: [],
  version: PROJECT_VERSION,
})

const codes = (subject: Project): readonly string[] => checkProject(subject).map((v) => v.code)

describe('a connection joins zones that share a storey', () => {
  it('passes for two zones on the same storey', () => {
    expect(codes(project([zone('a'), zone('b')], [connection('e', 'a', 'b')]))).toEqual([])
  })

  it('passes for a stair and a zone on a storey it spans', () => {
    const stair = zone('s', { storeysSpanned: 2 })
    const upstairs = zone('u', { storey: 1 })
    expect(codes(project([stair, upstairs], [connection('e', 's', 'u', { storey: 1 })]))).toEqual(
      [],
    )
  })

  it('fails when the two zones stand on different storeys', () => {
    const upstairs = zone('b', { storey: 1 })
    expect(codes(project([zone('a'), upstairs], [connection('e', 'a', 'b')]))).toEqual([
      'connection-storey',
    ])
  })
})

describe('one connection per unordered pair per storey', () => {
  it('passes for the same pair on two storeys they both stand on', () => {
    const zones = [zone('a', { storeysSpanned: 2 }), zone('b', { storeysSpanned: 2 })]
    const connections = [connection('e1', 'a', 'b'), connection('e2', 'b', 'a', { storey: 1 })]
    expect(codes(project(zones, connections))).toEqual([])
  })

  it('fails for the same pair twice on one storey, in either order', () => {
    const connections = [connection('e1', 'a', 'b'), connection('e2', 'b', 'a')]
    expect(codes(project([zone('a'), zone('b')], connections))).toEqual(['connection-duplicate'])
  })
})

describe('connection endpoints', () => {
  it('passes when an endpoint is the outside', () => {
    expect(codes(project([zone('a')], [connection('e', EXTERIOR, 'a')]))).toEqual([])
  })

  it('fails when an endpoint names no zone', () => {
    expect(codes(project([zone('a')], [connection('e', 'a', 'ghost')]))).toEqual([
      'connection-endpoint-missing',
      'connection-storey',
    ])
  })
})

describe('the outside is never a zone', () => {
  it('passes for ordinary zone ids', () => {
    expect(codes(project([zone('a')]))).toEqual([])
  })

  it('fails when a zone carries the outside as its id', () => {
    expect(codes(project([zone(EXTERIOR)]))).toEqual(['exterior-as-zone'])
  })
})

describe('the main door', () => {
  it('passes for one main door from the outside', () => {
    expect(
      codes(project([zone('a')], [connection('e', EXTERIOR, 'a', { kind: 'main-door' })])),
    ).toEqual([])
  })

  it('fails for a second main door', () => {
    const connections = [
      connection('e1', EXTERIOR, 'a', { kind: 'main-door' }),
      connection('e2', EXTERIOR, 'b', { kind: 'main-door' }),
    ]
    expect(codes(project([zone('a'), zone('b')], connections))).toEqual(['main-door-count'])
  })

  it('fails for a main door between two zones', () => {
    expect(
      codes(project([zone('a'), zone('b')], [connection('e', 'a', 'b', { kind: 'main-door' })])),
    ).toEqual(['main-door-outside'])
  })
})

describe('a zone is placed or unplaced, never half', () => {
  it('passes for a footprint with a real polygon', () => {
    const placed = zone('a', {
      footprint: {
        polygon: [
          [0, 0],
          [3, 0],
          [3, 4],
        ],
        rotation: 0,
      },
    })
    expect(codes(project([placed]))).toEqual([])
  })

  it('fails for a footprint that is not a shape', () => {
    const half = zone('a', { footprint: { polygon: [[0, 0]], rotation: 0 } })
    expect(codes(project([half]))).toEqual(['footprint-half'])
  })
})

describe('a zone stands within the project', () => {
  it('passes for a stair that ends on the top storey', () => {
    expect(codes(project([zone('s', { storeysSpanned: 2 })], [], 2))).toEqual([])
  })

  it('fails when a zone spans less than one storey', () => {
    expect(codes(project([zone('a', { storeysSpanned: 0 })]))).toEqual(['storeys-spanned'])
  })

  it('fails when a zone reaches past the top storey', () => {
    expect(codes(project([zone('a', { storey: 1, storeysSpanned: 2 })], [], 2))).toEqual([
      'storey-range',
    ])
  })
})

describe('a height for every storey', () => {
  it('passes when there is one positive height per storey', () => {
    expect(codes(project([], [], 3))).toEqual([])
  })

  it('fails when the heights and the storeys do not agree', () => {
    expect(codes({ ...project([], [], 2), heights: [3.5] })).toEqual(['heights-count'])
    expect(codes({ ...project([], [], 2), heights: [3.5, 3.5, 3.5] })).toEqual(['heights-count'])
  })

  it('fails on a height that is not a positive number of metres', () => {
    expect(codes({ ...project([], [], 2), heights: [3.5, 0] })).toEqual(['height-size'])
    expect(codes({ ...project([], [], 2), heights: [-1, 3.5] })).toEqual(['height-size'])
  })
})

it('says what is wrong in a sentence', () => {
  const violations = checkProject(
    project([zone('a'), zone('b', { storey: 1 })], [connection('e', 'a', 'b')]),
  )
  expect(violations[0]?.message).toContain('storey 0')
})

describe('the arcs a footprint remembers', () => {
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ] as const

  it('passes an arc whose vertices lie on its circle', () => {
    const quarter = zone('a', {
      footprint: {
        polygon: [
          [0, 0],
          [2, 0],
          [0, 2],
        ],
        rotation: 0,
        arcs: [{ from: 1, to: 2, centre: [0, 0], radius: 2, clockwise: true }],
      },
    })
    expect(codes(project([quarter]))).toEqual([])
  })

  it('refuses an arc whose vertices stand off its circle', () => {
    const wrong = zone('a', {
      footprint: {
        polygon: square,
        rotation: 0,
        arcs: [{ from: 0, to: 1, centre: [2, 2], radius: 2, clockwise: true }],
      },
    })
    expect(codes(project([wrong]))).toEqual(['arc-off-circle'])
  })

  it('refuses an arc on a vertex the polygon does not have', () => {
    const missing = zone('a', {
      footprint: {
        polygon: square,
        rotation: 0,
        arcs: [{ from: 0, to: 9, centre: [2, 2], radius: 2, clockwise: true }],
      },
    })
    expect(codes(project([missing]))).toEqual(['arc-range'])
  })
})

describe('keep-apart pairs', () => {
  const two = [zone('diwaniya'), zone('family')]

  it('passes for two zones, on any storeys', () => {
    const upstairs = [zone('garage'), zone('bedroom', { storey: 1 })]
    const pairs = [{ id: 'k1', a: 'garage', b: 'bedroom' }]
    expect(checkProject({ ...project(upstairs), apart: pairs })).toEqual([])
  })

  it('fails for a zone that is not there, the outside, the same zone twice, or a pair twice', () => {
    const codes = (apart: Project['apart']) =>
      checkProject({ ...project(two), apart }).map((problem) => problem.code)
    expect(codes([{ id: 'k1', a: 'diwaniya', b: 'ghost' }])).toEqual(['apart-endpoint'])
    expect(codes([{ id: 'k1', a: 'diwaniya', b: EXTERIOR }])).toEqual(['apart-endpoint'])
    expect(codes([{ id: 'k1', a: 'diwaniya', b: 'diwaniya' }])).toEqual(['apart-self'])
    expect(
      codes([
        { id: 'k1', a: 'diwaniya', b: 'family' },
        { id: 'k2', a: 'family', b: 'diwaniya' },
      ]),
    ).toEqual(['apart-duplicate'])
  })
})
