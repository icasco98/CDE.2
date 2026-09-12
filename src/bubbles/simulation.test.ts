import { describe, expect, it } from 'vitest'
import { pointInPolygon, type Polygon } from '../geometry'
import { createIdGenerator, createStore, deserialize, serialize, startingSite } from '../model'
import {
  createState,
  defaultLayout,
  layoutFor,
  radiusOf,
  settle,
  shareAStorey,
  SPREAD_SECONDS,
  spreadLayout,
  step,
  STILL_FRAMES,
  TOUCHING,
  twinsOf,
  type SimulationEdge,
  type SimulationRoom,
  type SimulationState,
} from './simulation'
import { groundOf } from './ground'

/**
 * Floor enough for any program in these tests, with its middle on the origin, and no side of it
 * marked a street, so the rulebook's own rows stand back and these tests are about the physics.
 */
const wide = groundOf(
  {
    on: true,
    polygon: [
      [-50, -50],
      [50, -50],
      [50, 50],
      [-50, 50],
    ],
    north: 0,
    street: [],
  },
  startingSite,
)

/** The starting plot inside its setbacks: 17 m across and 21.5 m deep, as the rulebook leaves it. */
const FLOOR: Polygon = [
  [1.5, 1.5],
  [18.5, 1.5],
  [18.5, 23],
  [1.5, 23],
]
const floor = groundOf(
  {
    on: true,
    polygon: [
      [0, 0],
      [20, 0],
      [20, 25],
      [0, 25],
    ],
    north: 0,
    street: [2],
  },
  startingSite,
)

function room(id: string, targetArea: number, storey = 0, extra: Partial<SimulationRoom> = {}) {
  return { id, storey, storeysSpanned: 1, targetArea, pinned: false, ...extra }
}

/** The kinds and tiers a villa's rooms really carry, cycled, so the rows of the rulebook act. */
const kinds = ['bedroom', 'kitchen', 'dining-room', 'formal-living', 'office-study'] as const
const tiers = ['private', 'private', 'semi-public', 'public', 'private'] as const

function program(count: number, storeys: number, links: number) {
  const rooms = Array.from({ length: count }, (_, i) =>
    room(`room_${i}`, 8 + ((i * 7) % 45), i % storeys, {
      kind: kinds[i % kinds.length],
      tier: tiers[i % tiers.length],
    }),
  )
  const edges: SimulationEdge[] = []
  const seen = new Set<string>()
  for (let gap = 1; edges.length < links && gap < count; gap++)
    for (let i = 0; i < count && edges.length < links; i++) {
      const j = (i + gap * storeys) % count
      if (i === j || rooms[i]?.storey !== rooms[j]?.storey) continue
      const key = i < j ? `${i}:${j}` : `${j}:${i}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a: `room_${i}`, b: `room_${j}`, storey: rooms[i]?.storey ?? 0 })
    }
  return { rooms, edges }
}

describe('radius from area', () => {
  it('gives a circle of the room’s own area', () => {
    const r = radiusOf(50)
    expect(Math.PI * r * r).toBeCloseTo(50, 9)
  })
})

describe('settling', () => {
  it('draws the same picture twice from the same input', () => {
    const { rooms, edges } = program(12, 2, 14)
    const first = settle(createState(rooms, edges, wide), defaultLayout)
    const second = settle(createState(rooms, edges, wide), defaultLayout)
    expect(first.state).toEqual(second.state)
    expect(first.iterations).toBe(second.iterations)
  })

  it('starts rooms without a bubble in the same place every time, inside the buildable area', () => {
    const rooms = [room('kitchen', 20), room('majlis', 45)]
    const opened = createState(rooms, [], floor)
    expect(opened.bodies).toEqual(createState(rooms, [], floor).bodies)
    for (const body of opened.bodies) expect(pointInPolygon(FLOOR, [body.x, body.y])).toBe(true)
  })

  it('leaves a pinned room exactly where it was', () => {
    const rooms = [
      room('a', 30, 0, { pinned: true, bubble: { x: 3, y: 4 } }),
      room('b', 30, 0, { bubble: { x: 3.5, y: 4.5 } }),
    ]
    const out = settle(createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], wide), defaultLayout)
    expect(out.state.bodies[0]).toMatchObject({ id: 'a', x: 3, y: 4, vx: 0, vy: 0 })
  })

  it('pulls a stretched link back towards its rest length', () => {
    const rooms = [
      room('a', 20, 0, { bubble: { x: -40, y: 0 } }),
      room('b', 20, 0, { bubble: { x: 40, y: 0 } }),
    ]
    const start = createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], wide)
    const before = Math.abs(start.bodies[1]!.x - start.bodies[0]!.x)
    const out = settle(start, defaultLayout)
    const after = Math.abs(out.state.bodies[1]!.x - out.state.bodies[0]!.x)
    // A link's rest length is touching, rim to rim, so a stretched one comes back to the pair
    // standing against each other rather than to the air two strangers keep.
    const rest = radiusOf(20) * 2
    expect(after).toBeLessThan(before)
    expect(after).toBeLessThanOrEqual(rest + 0.05)
    expect(after).toBeGreaterThan(rest - 0.6 * radiusOf(20))
  })

  it('parts two circles drawn on top of each other', () => {
    const rooms = [
      room('a', 30, 0, { bubble: { x: 0, y: 0 } }),
      room('b', 30, 0, { bubble: { x: 0, y: 0 } }),
    ]
    const out = settle(createState(rooms, [], wide), defaultLayout)
    const [a, b] = out.state.bodies
    const between = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    expect(between).toBeGreaterThanOrEqual(a!.radius + b!.radius)
  })

  it('stops when the picture stops moving', () => {
    const { rooms, edges } = program(12, 2, 14)
    const out = settle(createState(rooms, edges, wide), defaultLayout)
    expect(out.settled).toBe(true)
    expect(out.iterations).toBeLessThan(defaultLayout.maxIterations)
    // Settled again it stops sooner than it did the first time, which is what a picture that has
    // found its arrangement does; a cloud with nothing but its links to hold it still has a little
    // of the movement left in it, and no run ever has to start from the beginning again.
    expect(settle(out.state, defaultLayout).iterations).toBeLessThan(out.iterations)
  })

  it('leaves an empty program alone', () => {
    const out = settle(createState([], [], wide), defaultLayout)
    expect(out).toEqual({
      state: {
        bodies: [],
        links: [],
        corridors: [],
        companions: [],
        ground: wide,
        energy: 0,
      },
      iterations: STILL_FRAMES,
      settled: true,
    })
  })

  it('ignores an edge whose ends are not both rooms', () => {
    const rooms = [room('a', 20)]
    expect(createState(rooms, [{ a: 'a', b: 'EXTERIOR', storey: 0 }], wide).links).toEqual([])
  })

  it('settles thirty rooms and forty links well inside the budget', () => {
    const { rooms, edges } = program(30, 2, 40)
    expect(edges).toHaveLength(40)
    settle(createState(rooms, edges, wide), defaultLayout)
    const started = performance.now()
    const out = settle(createState(rooms, edges, wide), defaultLayout)
    const elapsed = performance.now() - started
    expect(out.settled).toBe(true)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('the buildable line as a wall', () => {
  it('brings a bubble started outside it to rest inside it, its whole circle within', () => {
    const rooms = [room('shed', 20, 0, { bubble: { x: 40, y: -12 } })]
    const out = settle(createState(rooms, [], floor), defaultLayout)
    const body = out.state.bodies[0]!
    expect(pointInPolygon(FLOOR, [body.x, body.y])).toBe(true)
    expect(body.x).toBeLessThanOrEqual(18.5 - body.radius + 1e-6)
    expect(body.y).toBeGreaterThanOrEqual(1.5 + body.radius - 1e-6)
  })

  it('holds every bubble of a whole program inside it, radius included', () => {
    const { rooms, edges } = program(12, 2, 14)
    const out = settle(createState(rooms, edges, floor), defaultLayout)
    expect(out.settled).toBe(true)
    for (const body of out.state.bodies) {
      expect(body.x).toBeGreaterThanOrEqual(
        1.5 + Math.min(body.radius, floor.inside.deepest) - 1e-6,
      )
      expect(body.x).toBeLessThanOrEqual(18.5 - Math.min(body.radius, floor.inside.deepest) + 1e-6)
      expect(body.y).toBeGreaterThanOrEqual(
        1.5 + Math.min(body.radius, floor.inside.deepest) - 1e-6,
      )
      expect(body.y).toBeLessThanOrEqual(23 - Math.min(body.radius, floor.inside.deepest) + 1e-6)
    }
  })

  it('rests a room too big for the floor at the middle of it rather than jamming it about', () => {
    const rooms = [room('hall', 900, 0, { bubble: { x: 3, y: 3 } })]
    const out = settle(createState(rooms, [], floor), defaultLayout)
    const body = out.state.bodies[0]!
    expect(
      Math.hypot(body.x - floor.inside.middle[0], body.y - floor.inside.middle[1]),
    ).toBeLessThan(0.5)
  })

  it('puts a bubble back inside in the one frame it is let go outside', () => {
    const rooms = [room('shed', 20, 0, { bubble: { x: 60, y: 4 } })]
    // The wall is positional, so one frame is the whole of it; the pull to the middle is a force
    // like any other and would have barely begun to move the bubble.
    const held = step(createState(rooms, [], floor), defaultLayout)
    expect(held.bodies[0]!.x).toBeLessThan(18.5)
    expect(pointInPolygon(FLOOR, [held.bodies[0]!.x, held.bodies[0]!.y])).toBe(true)
  })
})

describe('a single step', () => {
  it('returns a new state and leaves the old one untouched', () => {
    const rooms = [
      room('a', 20, 0, { bubble: { x: 0, y: 0 } }),
      room('b', 20, 0, { bubble: { x: 1, y: 0 } }),
    ]
    const before = createState(rooms, [], wide)
    const after = step(before, defaultLayout)
    expect(after).not.toBe(before)
    expect(before.bodies[0]).toEqual({ ...before.bodies[0] })
    expect(before.bodies[1]!.x).toBe(1)
    expect(after.bodies[1]!.x).toBeGreaterThan(1)
  })
})

describe('the same picture every time', () => {
  it('settles two states built from one program to the same places', () => {
    const { rooms, edges } = program(16, 2, 18)
    const first = settle(createState(rooms, edges, wide), defaultLayout).state
    const second = settle(createState(rooms, edges, wide), defaultLayout).state
    for (const [index, body] of first.bodies.entries()) {
      const other = second.bodies[index]!
      expect(other.x).toBeCloseTo(body.x, 9)
      expect(other.y).toBeCloseTo(body.y, 9)
    }
  })
})

describe('the correction after the forces', () => {
  /** Where two rooms of 40 m² touch, and the nearest the correction ever lets them stand. */
  const touching = radiusOf(40) * 2
  const closest = touching - 0.6 * radiusOf(40)

  /** Two circles of one size, lying over each other by half a metre. */
  function pair(extra: Partial<SimulationRoom> = {}) {
    const inside = touching / 2 - 0.25
    return [
      room('a', 40, 0, { bubble: { x: -inside, y: 6 }, ...extra }),
      room('b', 40, 0, { bubble: { x: inside, y: 6 } }),
    ]
  }

  const between = (state: SimulationState): number => {
    const [a, b] = state.bodies
    return Math.hypot(a!.x - b!.x, a!.y - b!.y)
  }

  it('parts two free bubbles in the one frame they lie over each other in', () => {
    const start = createState(pair(), [], wide)
    expect(between(start)).toBeLessThan(touching)
    expect(between(step(start, defaultLayout))).toBeGreaterThanOrEqual(closest)
  })

  it('leaves a pinned bubble where it is and moves the free one clear of it', () => {
    const after = step(createState(pair({ pinned: true }), [], wide), defaultLayout)
    expect(after.bodies[0]).toMatchObject({ id: 'a', y: 6 })
    expect(after.bodies[0]!.x).toBe(-(touching / 2 - 0.25))
    expect(between(after)).toBeGreaterThanOrEqual(closest)
  })

  it('never lets one bubble lie over another by more than the model allows', () => {
    const rooms = [
      room('a', 40, 0, { pinned: true, bubble: { x: 0, y: 0 } }),
      room('b', 10, 0, { bubble: { x: 0.1, y: 0 } }),
    ]
    const [a, b] = settle(createState(rooms, [], wide), defaultLayout).state.bodies
    const over = a!.radius + b!.radius - Math.hypot(a!.x - b!.x, a!.y - b!.y)
    expect(over).toBeLessThanOrEqual(0.6 * Math.min(a!.radius, b!.radius) + 1e-9)
  })

  it('leaves two pinned bubbles on each other, because pinned is the person’s hand', () => {
    const rooms = [
      room('a', 40, 0, { pinned: true, bubble: { x: -1, y: 6 } }),
      room('b', 40, 0, { pinned: true, bubble: { x: 1, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], wide), defaultLayout)
    expect(out.state.bodies[0]).toMatchObject({ x: -1, y: 6 })
    expect(out.state.bodies[1]).toMatchObject({ x: 1, y: 6 })
  })

  it('brings a bubble dropped on another to rest clear of it, with the air they keep between', () => {
    const rooms = [
      room('a', 40, 0, { bubble: { x: -0.5, y: 6 } }),
      room('b', 40, 0, { bubble: { x: 0.5, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], wide), defaultLayout)
    expect(out.settled).toBe(true)
    expect(out.iterations).toBeLessThan(defaultLayout.maxIterations)
    // Clear of it, with no more than the air two strangers keep between them: the gather onto the
    // middle of the floor holds them a little inside that air, and never inside each other.
    expect(between(out.state)).toBeGreaterThan(touching)
    expect(between(out.state)).toBeLessThanOrEqual(touching + defaultLayout.restGap + 1e-9)
  })

  it('leaves no two bubbles of a storey resting on each other', () => {
    const { rooms, edges } = program(16, 2, 18)
    const out = settle(createState(rooms, edges, wide), defaultLayout)
    expect(out.settled).toBe(true)
    for (const [i, a] of out.state.bodies.entries())
      for (const b of out.state.bodies.slice(i + 1)) {
        if (!shareAStorey(a, b)) continue
        // A linked pair rests touching, so what no two bubbles do is lie over each other by more
        // than the quarter the model allows.
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
          a.radius + b.radius - 0.6 * Math.min(a.radius, b.radius) - 0.01,
        )
      }
  })
})

describe('the privacy gradient and the weights', () => {
  /** Two rooms of a size on the starting plot, each with a tier for U2 to read. */
  function twoRooms(first: string, second: string) {
    return [
      room('a', 8, 0, { kind: 'room-other', tier: first, bubble: { x: 6, y: 12 } }),
      room('b', 8, 0, { kind: 'room-other', tier: second, bubble: { x: 13, y: 12 } }),
    ]
  }
  const settledAt = (rooms: readonly SimulationRoom[], weight: number): SimulationState => {
    const out = settle(createState(rooms, [], floor), layoutFor({ userRequirements: weight }))
    expect(out.settled).toBe(true)
    return out.state
  }
  const apartAt = (rooms: readonly SimulationRoom[], weight: number): number => {
    const [a, b] = settledAt(rooms, weight).bodies
    return Math.hypot(a!.x - b!.x, a!.y - b!.y)
  }

  it('takes a public room toward the street and a private one toward the back', () => {
    // The street is the south side of the starting plot, so the gradient runs down the sheet.
    const [pub, priv] = settledAt(twoRooms('public', 'private'), 1).bodies
    expect(pub!.y).toBeGreaterThan(priv!.y + 4)
  })

  it('parts a public room from a private one further as the weight rises', () => {
    const rooms = twoRooms('public', 'private')
    expect(apartAt(rooms, 1)).toBeGreaterThan(apartAt(rooms, 0) + 0.2)
  })

  it('leaves an exempt room, such as a bathroom, out of the gradient', () => {
    const [pub, exempt] = settledAt(twoRooms('public', 'exempt'), 1).bodies
    expect(Math.abs(exempt!.y - floor.inside.middle[1])).toBeLessThan(
      Math.abs(pub!.y - floor.inside.middle[1]),
    )
  })

  it('lets a link win over the gradient, which is what the rulebook says it does', () => {
    const rooms = twoRooms('public', 'private')
    const out = settle(
      createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], floor),
      layoutFor({ userRequirements: 1 }),
    )
    const [a, b] = out.state.bodies
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeLessThanOrEqual(
      a!.radius + b!.radius + TOUCHING,
    )
  })

  it('pulls a wanted link harder as the weight rises', () => {
    expect(layoutFor({ userRequirements: 1 }).springStiffness).toBeGreaterThan(
      layoutFor({ userRequirements: 0 }).springStiffness,
    )
    expect(layoutFor({}).springStiffness).toBe(defaultLayout.springStiffness)
  })
})

describe('spread', () => {
  it('triples the push between bubbles and the air they keep', () => {
    const opened = spreadLayout(defaultLayout)
    expect(opened.repulsion).toBe(defaultLayout.repulsion * 3)
    expect(opened.spread).toBe(defaultLayout.spread * 3)
    expect(opened.restGap).toBe(defaultLayout.restGap * 3)
    expect(opened.springStiffness).toBe(defaultLayout.springStiffness)
  })

  it('opens a settled cloud out and lets it settle again', () => {
    const { rooms, edges } = program(16, 2, 18)
    const settled = settle(createState(rooms, edges, wide), defaultLayout).state
    const reach = (state: typeof settled): number =>
      state.bodies.reduce((widest, body) => Math.max(widest, Math.abs(body.x)), 0)
    let opened = settled
    for (let frame = 0; frame < SPREAD_SECONDS / defaultLayout.timeStep; frame++)
      opened = step(opened, spreadLayout(defaultLayout))
    expect(reach(opened)).toBeGreaterThan(reach(settled) * 1.1)
    expect(settle(opened, defaultLayout).settled).toBe(true)
  })
})

describe('a room on every storey it serves', () => {
  it('is drawn on every storey it spans, and only those', () => {
    expect(twinsOf({ storey: 0, storeysSpanned: 3 })).toEqual([0, 1, 2])
    expect(twinsOf({ storey: 1, storeysSpanned: 2 })).toEqual([1, 2])
    expect(twinsOf({ storey: 2, storeysSpanned: 1 })).toEqual([2])
  })

  it('shares a floor with what stands on any storey it reaches, and with nothing else', () => {
    const stair = { storey: 0, storeysSpanned: 2 }
    expect(shareAStorey(stair, { storey: 1, storeysSpanned: 1 })).toBe(true)
    expect(shareAStorey(stair, { storey: 0, storeysSpanned: 1 })).toBe(true)
    expect(shareAStorey(stair, { storey: 2, storeysSpanned: 1 })).toBe(false)
  })

  it('is one body at one point, however many storeys it reaches', () => {
    const rooms = [
      room('stair', 12, 0, { storeysSpanned: 2, bubble: { x: 8, y: 12 } }),
      room('bedroom', 24, 1, { bubble: { x: 16, y: 12 } }),
    ]
    const out = settle(createState(rooms, [{ a: 'stair', b: 'bedroom', storey: 1 }], wide))
    const [stair, bedroom] = out.state.bodies
    expect(out.state.bodies).toHaveLength(2)
    expect(Math.hypot(stair!.x - bedroom!.x, stair!.y - bedroom!.y)).toBeLessThanOrEqual(
      stair!.radius + bedroom!.radius + 0.05,
    )
  })

  it('leaves a room upstairs free to stand over one below it', () => {
    const rooms = [
      room('kitchen', 20, 0, { bubble: { x: 6, y: 6 } }),
      room('bedroom', 20, 1, { bubble: { x: 6, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], wide), defaultLayout)
    const [kitchen, bedroom] = out.state.bodies
    expect(Math.hypot(kitchen!.x - bedroom!.x, kitchen!.y - bedroom!.y)).toBeCloseTo(0, 6)
  })

  it('keeps a stair clear of the rooms on either storey it serves', () => {
    const rooms = [
      room('stair', 12, 0, { storeysSpanned: 2, bubble: { x: 0, y: 0 } }),
      room('kitchen', 20, 0, { bubble: { x: 0.5, y: 0 } }),
      room('bedroom', 20, 1, { bubble: { x: -0.5, y: 0 } }),
    ]
    const out = settle(createState(rooms, [], wide), defaultLayout)
    const [stair, kitchen, bedroom] = out.state.bodies
    expect(Math.hypot(stair!.x - kitchen!.x, stair!.y - kitchen!.y)).toBeGreaterThan(
      stair!.radius + kitchen!.radius,
    )
    expect(Math.hypot(stair!.x - bedroom!.x, stair!.y - bedroom!.y)).toBeGreaterThan(
      stair!.radius + bedroom!.radius,
    )
  })

  it('settles a program with three stairs to the same picture twice', () => {
    const rooms = [
      room('stair_a', 12, 0, { storeysSpanned: 3 }),
      room('stair_b', 9, 1, { storeysSpanned: 2 }),
      room('lift', 5, 0, { storeysSpanned: 3 }),
      room('hall', 18, 0),
      room('landing', 14, 2),
    ]
    const edges: SimulationEdge[] = [
      { a: 'stair_a', b: 'hall', storey: 0 },
      { a: 'stair_a', b: 'landing', storey: 2 },
      { a: 'stair_b', b: 'landing', storey: 2 },
    ]
    const first = settle(createState(rooms, edges, floor), defaultLayout).state
    const second = settle(createState(rooms, edges, floor), defaultLayout).state
    for (const [index, body] of first.bodies.entries()) {
      expect(second.bodies[index]!.x).toBeCloseTo(body.x, 9)
      expect(second.bodies[index]!.y).toBeCloseTo(body.y, 9)
    }
  })
})

describe('a stair through a saved project', () => {
  it('round trips a ground-to-second stair and draws it on three storeys', () => {
    const store = createStore(undefined, { newId: createIdGenerator(4) })
    store.actions.addStorey()
    store.actions.addStorey()
    const added = store.actions.addRoom({
      type: 'stair',
      name: 'Stair',
      targetArea: 15,
      storey: 0,
      storeysSpanned: 3,
    })
    expect(added.ok).toBe(true)
    const project = store.getState()
    const back = deserialize(serialize(project))
    expect(back.ok && back.value).toEqual(project)
    // Nothing about a twin is stored, so the span that came back is the whole of what draws them.
    const rooms = back.ok ? back.value.rooms : []
    const state = createState(rooms, [], floor)
    expect(twinsOf(state.bodies[0]!)).toEqual([0, 1, 2])
  })
})
