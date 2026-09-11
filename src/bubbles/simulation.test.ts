import { describe, expect, it } from 'vitest'
import { createIdGenerator, createStore, deserialize, serialize } from '../model'
import {
  bandOf,
  createState,
  defaultLayout,
  layoutFor,
  radiusOf,
  settle,
  SPREAD_SECONDS,
  spreadLayout,
  step,
  STILL_FRAMES,
  twinsOf,
  twinY,
  type SimulationEdge,
  type SimulationRoom,
  type SimulationState,
} from './simulation'

function room(id: string, targetArea: number, storey = 0, extra: Partial<SimulationRoom> = {}) {
  return { id, storey, storeysSpanned: 1, targetArea, pinned: false, ...extra }
}

function program(count: number, storeys: number, links: number) {
  const rooms = Array.from({ length: count }, (_, i) =>
    room(`room_${i}`, 8 + ((i * 7) % 45), i % storeys),
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

describe('bands', () => {
  it('puts the ground storey at the bottom of the sheet', () => {
    const ground = bandOf(0, 3, 10)
    const top = bandOf(2, 3, 10)
    expect(ground).toEqual({ top: 20, bottom: 30, centre: 25 })
    expect(top).toEqual({ top: 0, bottom: 10, centre: 5 })
  })
})

describe('settling', () => {
  it('draws the same picture twice from the same input', () => {
    const { rooms, edges } = program(12, 2, 14)
    const first = settle(createState(rooms, edges, 2), defaultLayout)
    const second = settle(createState(rooms, edges, 2), defaultLayout)
    expect(first.state).toEqual(second.state)
    expect(first.iterations).toBe(second.iterations)
  })

  it('starts rooms without a bubble in the same place every time', () => {
    const rooms = [room('kitchen', 20), room('majlis', 45)]
    expect(createState(rooms, [], 1).bodies).toEqual(createState(rooms, [], 1).bodies)
  })

  it('leaves a pinned room exactly where it was', () => {
    const rooms = [
      room('a', 30, 0, { pinned: true, bubble: { x: 3, y: 4 } }),
      room('b', 30, 0, { bubble: { x: 3.5, y: 4.5 } }),
    ]
    const out = settle(createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], 1), defaultLayout)
    expect(out.state.bodies[0]).toMatchObject({ id: 'a', x: 3, y: 4, vx: 0, vy: 0 })
  })

  it('pulls a stretched link back towards its rest length', () => {
    const rooms = [
      room('a', 20, 0, { bubble: { x: -40, y: 0 } }),
      room('b', 20, 0, { bubble: { x: 40, y: 0 } }),
    ]
    const start = createState(rooms, [{ a: 'a', b: 'b', storey: 0 }], 1)
    const before = Math.abs(start.bodies[1]!.x - start.bodies[0]!.x)
    const out = settle(start, defaultLayout)
    const after = Math.abs(out.state.bodies[1]!.x - out.state.bodies[0]!.x)
    const rest = radiusOf(20) * 2 + defaultLayout.restGap
    expect(after).toBeLessThan(before)
    expect(after).toBeCloseTo(rest, 1)
  })

  it('parts two circles drawn on top of each other', () => {
    const rooms = [
      room('a', 30, 0, { bubble: { x: 0, y: 0 } }),
      room('b', 30, 0, { bubble: { x: 0, y: 0 } }),
    ]
    const out = settle(createState(rooms, [], 1), defaultLayout)
    const [a, b] = out.state.bodies
    const between = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    expect(between).toBeGreaterThanOrEqual(a!.radius + b!.radius)
  })

  it('keeps every room inside its own storey band', () => {
    const { rooms, edges } = program(12, 2, 14)
    const out = settle(createState(rooms, edges, 2), defaultLayout)
    for (const body of out.state.bodies) {
      const band = bandOf(body.storey, out.state.storeys, out.state.bandHeight)
      expect(body.y).toBeGreaterThanOrEqual(band.top)
      expect(body.y).toBeLessThanOrEqual(band.bottom)
    }
  })

  it('brings a stair to rest with a twin in the middle of every band it spans', () => {
    const rooms = [room('stair', 12, 0, { storeysSpanned: 2 })]
    const out = settle(createState(rooms, [], 2), defaultLayout)
    const stair = out.state.bodies[0]!
    const height = out.state.bandHeight
    for (const storey of twinsOf(stair))
      expect(twinY(stair, storey, height)).toBeCloseTo(
        bandOf(storey, out.state.storeys, height).centre,
        1,
      )
  })

  it('stops when the picture stops moving', () => {
    const { rooms, edges } = program(12, 2, 14)
    const out = settle(createState(rooms, edges, 2), defaultLayout)
    expect(out.settled).toBe(true)
    expect(out.iterations).toBeLessThan(defaultLayout.maxIterations)
    const further = settle(out.state, defaultLayout).state
    for (const [i, body] of further.bodies.entries())
      expect(
        Math.hypot(body.x - out.state.bodies[i]!.x, body.y - out.state.bodies[i]!.y),
      ).toBeLessThan(0.1)
  })

  it('leaves an empty program alone', () => {
    const out = settle(createState([], [], 1), defaultLayout)
    expect(out).toEqual({
      state: { bodies: [], links: [], storeys: 1, bandHeight: 12, energy: 0 },
      iterations: STILL_FRAMES,
      settled: true,
    })
  })

  it('ignores an edge whose ends are not both rooms', () => {
    const rooms = [room('a', 20)]
    expect(createState(rooms, [{ a: 'a', b: 'EXTERIOR', storey: 0 }], 1).links).toEqual([])
  })

  it('settles thirty rooms and forty links well inside the budget', () => {
    const { rooms, edges } = program(30, 2, 40)
    expect(edges).toHaveLength(40)
    settle(createState(rooms, edges, 2), defaultLayout)
    const started = performance.now()
    const out = settle(createState(rooms, edges, 2), defaultLayout)
    const elapsed = performance.now() - started
    expect(out.settled).toBe(true)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('a single step', () => {
  it('returns a new state and leaves the old one untouched', () => {
    const rooms = [
      room('a', 20, 0, { bubble: { x: 0, y: 0 } }),
      room('b', 20, 0, { bubble: { x: 1, y: 0 } }),
    ]
    const before = createState(rooms, [], 1)
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
    const first = settle(createState(rooms, edges, 2), defaultLayout).state
    const second = settle(createState(rooms, edges, 2), defaultLayout).state
    for (const [index, body] of first.bodies.entries()) {
      const other = second.bodies[index]!
      expect(other.x).toBeCloseTo(body.x, 9)
      expect(other.y).toBeCloseTo(body.y, 9)
    }
  })
})

describe('the correction after the forces', () => {
  const restDistance = radiusOf(40) * 2 + defaultLayout.restGap

  /** Two circles of one size, overlapping by half a metre. */
  function pair(extra: Partial<SimulationRoom> = {}) {
    const inside = restDistance / 2 - 0.25
    return [
      room('a', 40, 0, { bubble: { x: -inside, y: 6 }, ...extra }),
      room('b', 40, 0, { bubble: { x: inside, y: 6 } }),
    ]
  }

  const between = (state: SimulationState): number => {
    const [a, b] = state.bodies
    return Math.hypot(a!.x - b!.x, a!.y - b!.y)
  }

  it('puts two free bubbles at exactly the distance they keep, in the frame they overlap in', () => {
    const start = createState(pair(), [], 1)
    expect(between(start)).toBeLessThan(restDistance)
    expect(between(step(start, defaultLayout))).toBeCloseTo(restDistance, 9)
  })

  it('leaves a pinned bubble where it is and moves the free one clear of it', () => {
    const after = step(createState(pair({ pinned: true }), [], 1), defaultLayout)
    expect(after.bodies[0]).toMatchObject({ id: 'a', y: 6 })
    expect(after.bodies[0]!.x).toBe(-(restDistance / 2 - 0.25))
    expect(between(after)).toBeCloseTo(restDistance, 9)
  })

  it('leaves two pinned bubbles on each other, because pinned is the person’s hand', () => {
    const rooms = [
      room('a', 40, 0, { pinned: true, bubble: { x: -1, y: 6 } }),
      room('b', 40, 0, { pinned: true, bubble: { x: 1, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], 1), defaultLayout)
    expect(out.state.bodies[0]).toMatchObject({ x: -1, y: 6 })
    expect(out.state.bodies[1]).toMatchObject({ x: 1, y: 6 })
  })

  it('brings a bubble dropped on another to rest exactly clear of it', () => {
    const rooms = [
      room('a', 40, 0, { bubble: { x: -0.5, y: 6 } }),
      room('b', 40, 0, { bubble: { x: 0.5, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], 1), defaultLayout)
    expect(out.settled).toBe(true)
    expect(out.iterations).toBeLessThan(defaultLayout.maxIterations)
    expect(between(out.state)).toBeCloseTo(restDistance, 9)
  })

  it('leaves no two bubbles of a whole program resting on each other', () => {
    const { rooms, edges } = program(16, 2, 18)
    const out = settle(createState(rooms, edges, 2), defaultLayout)
    expect(out.settled).toBe(true)
    for (const [i, a] of out.state.bodies.entries())
      for (const b of out.state.bodies.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.radius + b.radius)
  })
})

describe('the user requirements weight', () => {
  /** Two small rooms side by side, far enough from the middle for the push between them to tell. */
  function twoRooms(first: string, second: string) {
    return [
      room('a', 8, 0, { tier: first, bubble: { x: -8, y: 6 } }),
      room('b', 8, 0, { tier: second, bubble: { x: 8, y: 6 } }),
    ]
  }
  const apartAt = (rooms: readonly SimulationRoom[], weight: number): number => {
    const out = settle(createState(rooms, [], 1), layoutFor(weight))
    expect(out.settled).toBe(true)
    const [a, b] = out.state.bodies
    return Math.hypot(a!.x - b!.x, a!.y - b!.y)
  }

  it('parts a public room from a private one further as the weight rises', () => {
    const rooms = twoRooms('public', 'private')
    expect(apartAt(rooms, 1)).toBeGreaterThan(apartAt(rooms, 0) + 0.2)
  })

  it('leaves two rooms of one tier at the same distance at either weight', () => {
    const rooms = twoRooms('private', 'private')
    expect(apartAt(rooms, 1)).toBeCloseTo(apartAt(rooms, 0), 9)
  })

  it('leaves an exempt room, such as a bathroom, out of the gradient', () => {
    const rooms = twoRooms('public', 'exempt')
    expect(apartAt(rooms, 1)).toBeCloseTo(apartAt(rooms, 0), 9)
  })

  it('pulls a wanted link harder as the weight rises', () => {
    expect(layoutFor(1).springStiffness).toBeGreaterThan(layoutFor(0).springStiffness)
    expect(layoutFor(0.5).springStiffness).toBe(defaultLayout.springStiffness)
  })
})

describe('spread', () => {
  it('triples the push between bubbles and the air they keep', () => {
    const wide = spreadLayout(defaultLayout)
    expect(wide.repulsion).toBe(defaultLayout.repulsion * 3)
    expect(wide.spread).toBe(defaultLayout.spread * 3)
    expect(wide.restGap).toBe(defaultLayout.restGap * 3)
    expect(wide.springStiffness).toBe(defaultLayout.springStiffness)
  })

  it('opens a settled cloud out and lets it settle again', () => {
    const { rooms, edges } = program(16, 2, 18)
    const settled = settle(createState(rooms, edges, 2), defaultLayout).state
    const reach = (state: typeof settled): number =>
      state.bodies.reduce((widest, body) => Math.max(widest, Math.abs(body.x)), 0)
    let opened = settled
    for (let frame = 0; frame < SPREAD_SECONDS / defaultLayout.timeStep; frame++)
      opened = step(opened, spreadLayout(defaultLayout))
    expect(reach(opened)).toBeGreaterThan(reach(settled) * 1.5)
    expect(settle(opened, defaultLayout).settled).toBe(true)
  })
})

describe('a room on every storey it serves', () => {
  const HEIGHT = 12

  it('draws every storey it spans, and only those', () => {
    expect(twinsOf({ storey: 0, storeysSpanned: 3 })).toEqual([0, 1, 2])
    expect(twinsOf({ storey: 1, storeysSpanned: 2 })).toEqual([1, 2])
    expect(twinsOf({ storey: 2, storeysSpanned: 1 })).toEqual([2])
  })

  it('puts every twin at the same x and the same height inside its own band', () => {
    const stair = { storey: 0, storeysSpanned: 3, y: 30 }
    const bands = [0, 1, 2].map((storey) => bandOf(storey, 3, HEIGHT))
    const inside = (storey: number): number =>
      twinY(stair, storey, HEIGHT) - (bands[storey]?.top ?? 0)
    expect(twinY(stair, 0, HEIGHT)).toBe(30)
    expect(inside(1)).toBeCloseTo(inside(0), 9)
    expect(inside(2)).toBeCloseTo(inside(0), 9)
  })

  it('lends its nearest twin to a storey it does not reach', () => {
    const stair = { storey: 1, storeysSpanned: 2, y: 18 }
    expect(twinY(stair, 0, HEIGHT)).toBe(18)
    expect(twinY(stair, 9, HEIGHT)).toBe(twinY(stair, 2, HEIGHT))
  })

  it('pulls a stair towards a room it is linked to upstairs, and not towards the floor below', () => {
    const rooms = [
      room('stair', 12, 0, { storeysSpanned: 2, bubble: { x: 0, y: 18 } }),
      room('bedroom', 24, 1, { bubble: { x: 20, y: 6 } }),
    ]
    const out = settle(
      createState(rooms, [{ a: 'stair', b: 'bedroom', storey: 1 }], 2),
      defaultLayout,
    )
    const [stair, bedroom] = out.state.bodies
    const height = out.state.bandHeight
    // The link is on the first storey, so it is the upper twin the spring holds beside the bedroom.
    const upstairs = Math.hypot(stair!.x - bedroom!.x, twinY(stair!, 1, height) - bedroom!.y)
    expect(Math.abs(stair!.x - bedroom!.x)).toBeLessThan(20)
    expect(upstairs).toBeCloseTo(stair!.radius + bedroom!.radius + defaultLayout.restGap, 1)
    // And the room itself has not left the ground: only the picture of it upstairs went to meet it.
    const ground = bandOf(0, 2, height)
    expect(stair!.y).toBeGreaterThan(ground.top)
    expect(stair!.y).toBeLessThan(ground.bottom)
  })

  it('has no band pull left on a stair whose twins are each in the middle of their band', () => {
    const height = 12
    const rooms = [room('stair', 12, 0, { storeysSpanned: 2, bubble: { x: 0, y: 0 } })]
    const state = createState(rooms, [], 2)
    const centred = {
      ...state,
      bandHeight: height,
      bodies: [{ ...state.bodies[0]!, x: 0, y: bandOf(0, 2, height).centre }],
    }
    const after = step(centred, defaultLayout)
    expect(after.bodies[0]!.y).toBeCloseTo(bandOf(0, 2, height).centre, 9)
    expect(after.bodies[0]!.vy).toBeCloseTo(0, 9)
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
    const first = settle(createState(rooms, edges, 3), defaultLayout).state
    const second = settle(createState(rooms, edges, 3), defaultLayout).state
    for (const [index, body] of first.bodies.entries()) {
      expect(second.bodies[index]!.x).toBeCloseTo(body.x, 9)
      expect(second.bodies[index]!.y).toBeCloseTo(body.y, 9)
    }
  })

  it('keeps a stair’s twins clear of the rooms in their own bands', () => {
    const rooms = [
      room('stair', 12, 0, { storeysSpanned: 2, bubble: { x: 0, y: 18 } }),
      room('kitchen', 20, 0, { bubble: { x: 0.5, y: 18 } }),
      room('bedroom', 20, 1, { bubble: { x: -0.5, y: 6 } }),
    ]
    const out = settle(createState(rooms, [], 2), defaultLayout)
    const height = out.state.bandHeight
    const [stair, kitchen, bedroom] = out.state.bodies
    expect(
      Math.hypot(stair!.x - kitchen!.x, twinY(stair!, 0, height) - kitchen!.y),
    ).toBeGreaterThan(stair!.radius + kitchen!.radius)
    expect(
      Math.hypot(stair!.x - bedroom!.x, twinY(stair!, 1, height) - bedroom!.y),
    ).toBeGreaterThan(stair!.radius + bedroom!.radius)
  })
})

describe('a stair through a saved project', () => {
  it('round trips a ground-to-second stair and draws it in three bands', () => {
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
    const state = createState(rooms, [], back.ok ? back.value.storeys : 1)
    expect(twinsOf(state.bodies[0]!)).toEqual([0, 1, 2])
  })
})
