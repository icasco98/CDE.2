import { describe, expect, it } from 'vitest'
import {
  bandOf,
  createState,
  defaultLayout,
  radiusOf,
  settle,
  step,
  type SimulationEdge,
  type SimulationRoom,
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
      edges.push({ a: `room_${i}`, b: `room_${j}` })
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
    const out = settle(createState(rooms, [{ a: 'a', b: 'b' }], 1), defaultLayout)
    expect(out.state.bodies[0]).toMatchObject({ id: 'a', x: 3, y: 4, vx: 0, vy: 0 })
  })

  it('pulls a stretched link back towards its rest length', () => {
    const rooms = [
      room('a', 20, 0, { bubble: { x: -40, y: 0 } }),
      room('b', 20, 0, { bubble: { x: 40, y: 0 } }),
    ]
    const start = createState(rooms, [{ a: 'a', b: 'b' }], 1)
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

  it('draws a stair to the boundary its two bands share', () => {
    const rooms = [room('stair', 12, 0, { storeysSpanned: 2 })]
    const out = settle(createState(rooms, [], 2), defaultLayout)
    expect(out.state.bodies[0]!.y).toBeCloseTo(out.state.bandHeight, 0)
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
      iterations: 1,
      settled: true,
    })
  })

  it('ignores an edge whose ends are not both rooms', () => {
    const rooms = [room('a', 20)]
    expect(createState(rooms, [{ a: 'a', b: 'EXTERIOR' }], 1).links).toEqual([])
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
