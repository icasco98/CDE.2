import { describe, expect, it } from 'vitest'
import {
  buildableOf,
  createState,
  defaultLayout,
  layoutFor,
  SPREAD_SECONDS,
  type Body,
  type LayoutConfig,
  type SimulationRoom,
} from '../../bubbles'
import type { Commit } from '../../model'
import { createRun, type Frames } from './run'

/** A hand-driven `requestAnimationFrame`: it counts what was asked for and runs it when told to. */
function fakeFrames() {
  let next = 1
  const queued = new Map<number, () => void>()
  const frames: Frames = {
    request(run) {
      const handle = next++
      queued.set(handle, run)
      return handle
    },
    cancel(handle) {
      queued.delete(handle)
    },
  }
  return {
    frames,
    /** How many frames are waiting to run; nought is a tab that costs nothing. */
    waiting: () => queued.size,
    asked: () => next - 1,
    /** Runs the frames that are waiting, up to a bound, and says how many really ran. */
    run(limit: number): number {
      let ran = 0
      while (ran < limit && queued.size > 0) {
        const [handle, work] = [...queued.entries()][0]!
        queued.delete(handle)
        work()
        ran++
      }
      return ran
    },
  }
}

/** The starting plot inside its setbacks, which is the floor these bubbles stand on. */
const floor = buildableOf([
  [1.5, 1.5],
  [18.5, 1.5],
  [18.5, 23],
  [1.5, 23],
])

/** The middle of that floor, which is where one bubble on its own comes to rest. */
const [middleX, middleY] = floor.middle

function room(id: string, extra: Partial<SimulationRoom> = {}): SimulationRoom {
  return { id, storey: 0, storeysSpanned: 1, targetArea: 24, pinned: false, ...extra }
}

function start(rooms: readonly SimulationRoom[], layout: LayoutConfig = defaultLayout) {
  const clock = fakeFrames()
  const moves: { id: string; x: number; y: number; commit: Commit }[] = []
  const status: boolean[] = []
  const run = createRun({
    frames: clock.frames,
    state: createState(rooms, [], floor),
    layout: () => layout,
    report: (bodies: readonly Body[], commit: Commit) =>
      bodies.forEach((body, index) =>
        moves.push({
          id: body.id,
          x: body.x,
          y: body.y,
          commit: commit === 'commit' && index === bodies.length - 1 ? 'commit' : 'preview',
        }),
      ),
    watch: (moving) => status.push(moving),
  })
  return { run, clock, moves, status }
}

describe('the frame loop', () => {
  it('asks for no frame at all for a picture that is already at rest', () => {
    const { run, clock, moves } = start([room('a', { bubble: { x: middleX, y: middleY } })])
    run.look()
    // The steps that prove it still were taken on the spot, so nothing was ever scheduled.
    expect(clock.asked()).toBe(0)
    expect(clock.waiting()).toBe(0)
    expect(moves).toEqual([])
  })

  it('opens a picture left at rest without moving a bubble', () => {
    const rooms = [
      room('a', { bubble: { x: middleX - 6, y: middleY } }),
      room('b', { bubble: { x: middleX + 6, y: middleY } }),
    ]
    const first = start(rooms)
    first.run.look()
    first.clock.run(400)
    const settled = first.moves.filter((move) => move.id === 'b').at(-1)
    if (!settled) throw new Error('nothing settled')

    const again = start([
      room('a', { bubble: { x: 2 * middleX - settled.x, y: settled.y } }),
      room('b', { bubble: { x: settled.x, y: settled.y } }),
    ])
    again.run.look()
    expect(again.clock.asked()).toBe(0)
    expect(again.moves).toEqual([])
  })

  it('runs while the picture moves, then asks for nothing and records no step of its own', () => {
    const rooms = [
      room('a', { bubble: { x: middleX - 6, y: middleY } }),
      room('b', { bubble: { x: middleX + 6, y: middleY } }),
    ]
    const { run, clock, moves, status } = start(rooms)
    run.look()
    const frames = clock.run(400)
    expect(frames).toBeGreaterThan(3)
    expect(clock.waiting()).toBe(0)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((move) => move.commit === 'preview')).toBe(true)
    expect(status).toEqual([true, false])
  })

  it('carries a bubble to the hand and answers with the others in the same frame', () => {
    const rooms = [
      room('a', { bubble: { x: -6, y: 6 }, pinned: true }),
      room('b', { bubble: { x: 6, y: 6 } }),
    ]
    const { run, clock, moves } = start(rooms)
    run.hold('a', { x: 4, y: 6 })
    clock.run(1)
    const held = moves.filter((move) => move.id === 'a')
    const other = moves.filter((move) => move.id === 'b')
    expect(held[0]).toMatchObject({ x: 4, y: 6, commit: 'preview' })
    expect(other).toHaveLength(1)
    expect(other[0]!.x).toBeGreaterThan(6)
  })

  it('records where a drag landed only once the cloud it disturbed has stopped', () => {
    const rooms = [room('a', { bubble: { x: -6, y: 6 } }), room('b', { bubble: { x: 6, y: 6 } })]
    const { run, clock } = start(rooms)
    const landed: { x: number; y: number }[] = []
    run.hold('a', { x: 4, y: 6 })
    clock.run(2)
    run.release((rest) => landed.push(rest))
    expect(landed).toHaveLength(0)
    clock.run(400)
    expect(landed).toHaveLength(1)
    expect(clock.waiting()).toBe(0)
  })

  it('holds the dragged bubble against the forces and lets it go again on release', () => {
    const rooms = [room('a', { bubble: { x: -6, y: 6 } }), room('b', { bubble: { x: 6, y: 6 } })]
    const { run, clock, moves } = start(rooms)
    run.hold('a', { x: 4, y: 6 })
    clock.run(6)
    // Held on the far side of its neighbour, it stays there and the neighbour is the one that gives way.
    expect(moves.filter((move) => move.id === 'a').at(-1)).toMatchObject({ x: 4, y: 6 })
    expect(moves.filter((move) => move.id === 'b').at(-1)!.x).toBeGreaterThan(6)
    run.release(null)
    clock.run(400)
    expect(moves.filter((move) => move.id === 'a').at(-1)!.x).not.toBe(4)
  })

  it('calls a picture that cannot come to rest rested once it stops getting stiller', () => {
    // Three rooms of 40 m² on a floor of 30: there is no arrangement that satisfies every wall,
    // so the last of the movement never goes, and the run must still stop asking for frames.
    const tight = buildableOf([
      [0, 0],
      [6, 0],
      [6, 5],
      [0, 5],
    ])
    const clock = fakeFrames()
    const status: boolean[] = []
    const run = createRun({
      frames: clock.frames,
      state: createState(
        ['a', 'b', 'c'].map((id) => room(id, { targetArea: 40 })),
        [],
        tight,
      ),
      layout: () => defaultLayout,
      report: () => undefined,
      watch: (moving) => status.push(moving),
    })
    run.look()
    const ran = clock.run(600)
    expect(ran).toBeLessThan(600)
    expect(clock.waiting()).toBe(0)
    expect(status.at(-1)).toBe(false)
  })

  it('settles to rest at once when it is told to, and asks for no frame after', () => {
    const rooms = [
      room('a', { bubble: { x: middleX - 6, y: middleY } }),
      room('b', { bubble: { x: middleX + 6, y: middleY } }),
    ]
    const { run, clock, moves } = start(rooms)
    run.settleNow()
    expect(clock.waiting()).toBe(0)
    expect(moves[moves.length - 1]!.commit).toBe('commit')
  })
})

describe('spread', () => {
  it('holds for one second of simulation time and then is over', () => {
    const layout = layoutFor(0.5)
    const frames = SPREAD_SECONDS / layout.timeStep
    const rooms = [room('a', { bubble: { x: -6, y: 6 } }), room('b', { bubble: { x: 6, y: 6 } })]
    const { run, clock } = start(rooms, layout)
    run.spread()
    expect(run.spreading()).toBe(true)
    clock.run(frames - 1)
    expect(run.spreading()).toBe(true)
    clock.run(1)
    expect(run.spreading()).toBe(false)
  })

  it('keeps the run going until the cloud it opened has settled again', () => {
    const rooms = [room('a', { bubble: { x: -6, y: 6 } }), room('b', { bubble: { x: 6, y: 6 } })]
    const { run, clock, moves } = start(rooms)
    run.spread()
    const ran = clock.run(600)
    expect(ran).toBeGreaterThan(SPREAD_SECONDS / defaultLayout.timeStep)
    expect(clock.waiting()).toBe(0)
    expect(moves.length).toBeGreaterThan(0)
  })
})
