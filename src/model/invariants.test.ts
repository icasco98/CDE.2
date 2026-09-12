import { describe, expect, it } from 'vitest'
import { checkProject } from './invariants'
import { STARTING_HEIGHT_M, startingHousehold, startingSite } from './project'
import { EXTERIOR, PROJECT_VERSION, type Edge, type Project, type Room } from './types'

const room = (id: string, extra: Partial<Room> = {}): Room => ({
  id,
  name: id,
  type: 'bedroom',
  storey: 0,
  storeysSpanned: 1,
  targetArea: 12,
  pinned: false,
  ...extra,
})

const edge = (id: string, a: string, b: string, extra: Partial<Edge> = {}): Edge => ({
  id,
  a,
  b,
  kind: 'door',
  storey: 0,
  ...extra,
})

const project = (rooms: readonly Room[], edges: readonly Edge[] = [], storeys = 2): Project => ({
  id: 'project',
  name: 'test',
  storeys,
  heights: Array.from({ length: storeys }, () => STARTING_HEIGHT_M),
  plot: { on: false, polygon: [], north: 0, street: [] },
  site: startingSite,
  household: startingHousehold,
  rooms,
  edges,
  weights: {},
  actors: [],
  version: PROJECT_VERSION,
})

const codes = (subject: Project): readonly string[] => checkProject(subject).map((v) => v.code)

describe('an edge joins rooms that share a storey', () => {
  it('passes for two rooms on the same storey', () => {
    expect(codes(project([room('a'), room('b')], [edge('e', 'a', 'b')]))).toEqual([])
  })

  it('passes for a stair and a room on a storey it spans', () => {
    const stair = room('s', { storeysSpanned: 2 })
    const upstairs = room('u', { storey: 1 })
    expect(codes(project([stair, upstairs], [edge('e', 's', 'u', { storey: 1 })]))).toEqual([])
  })

  it('fails when the two rooms stand on different storeys', () => {
    const upstairs = room('b', { storey: 1 })
    expect(codes(project([room('a'), upstairs], [edge('e', 'a', 'b')]))).toEqual(['edge-storey'])
  })
})

describe('one edge per unordered pair per storey', () => {
  it('passes for the same pair on two storeys they both stand on', () => {
    const rooms = [room('a', { storeysSpanned: 2 }), room('b', { storeysSpanned: 2 })]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a', { storey: 1 })]
    expect(codes(project(rooms, edges))).toEqual([])
  })

  it('fails for the same pair twice on one storey, in either order', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]
    expect(codes(project([room('a'), room('b')], edges))).toEqual(['edge-duplicate'])
  })
})

describe('edge endpoints', () => {
  it('passes when an endpoint is the outside', () => {
    expect(codes(project([room('a')], [edge('e', EXTERIOR, 'a')]))).toEqual([])
  })

  it('fails when an endpoint names no room', () => {
    expect(codes(project([room('a')], [edge('e', 'a', 'ghost')]))).toEqual([
      'edge-endpoint-missing',
      'edge-storey',
    ])
  })
})

describe('the outside is never a room', () => {
  it('passes for ordinary room ids', () => {
    expect(codes(project([room('a')]))).toEqual([])
  })

  it('fails when a room carries the outside as its id', () => {
    expect(codes(project([room(EXTERIOR)]))).toEqual(['exterior-as-room'])
  })
})

describe('the main door', () => {
  it('passes for one main door from the outside', () => {
    expect(codes(project([room('a')], [edge('e', EXTERIOR, 'a', { kind: 'main-door' })]))).toEqual(
      [],
    )
  })

  it('fails for a second main door', () => {
    const edges = [
      edge('e1', EXTERIOR, 'a', { kind: 'main-door' }),
      edge('e2', EXTERIOR, 'b', { kind: 'main-door' }),
    ]
    expect(codes(project([room('a'), room('b')], edges))).toEqual(['main-door-count'])
  })

  it('fails for a main door between two rooms', () => {
    expect(
      codes(project([room('a'), room('b')], [edge('e', 'a', 'b', { kind: 'main-door' })])),
    ).toEqual(['main-door-outside'])
  })
})

describe('a room is placed or unplaced, never half', () => {
  it('passes for a footprint with a real polygon', () => {
    const placed = room('a', {
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
    const half = room('a', { footprint: { polygon: [[0, 0]], rotation: 0 } })
    expect(codes(project([half]))).toEqual(['footprint-half'])
  })
})

describe('a room stands within the project', () => {
  it('passes for a stair that ends on the top storey', () => {
    expect(codes(project([room('s', { storeysSpanned: 2 })], [], 2))).toEqual([])
  })

  it('fails when a room spans less than one storey', () => {
    expect(codes(project([room('a', { storeysSpanned: 0 })]))).toEqual(['storeys-spanned'])
  })

  it('fails when a room reaches past the top storey', () => {
    expect(codes(project([room('a', { storey: 1, storeysSpanned: 2 })], [], 2))).toEqual([
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
    project([room('a'), room('b', { storey: 1 })], [edge('e', 'a', 'b')]),
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
    const quarter = room('a', {
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
    const wrong = room('a', {
      footprint: {
        polygon: square,
        rotation: 0,
        arcs: [{ from: 0, to: 1, centre: [2, 2], radius: 2, clockwise: true }],
      },
    })
    expect(codes(project([wrong]))).toEqual(['arc-off-circle'])
  })

  it('refuses an arc on a vertex the polygon does not have', () => {
    const missing = room('a', {
      footprint: {
        polygon: square,
        rotation: 0,
        arcs: [{ from: 0, to: 9, centre: [2, 2], radius: 2, clockwise: true }],
      },
    })
    expect(codes(project([missing]))).toEqual(['arc-range'])
  })
})
