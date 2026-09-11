import { expect, it } from 'vitest'
import { createState, defaultLayout, layoutFor, step, type SimulationEdge } from './simulation'

/** Thirty rooms over two storeys and thirty links, the size a villa's program runs to. */
const rooms = Array.from({ length: 30 }, (_unused, index) => ({
  id: `room-${index}`,
  storey: index % 3 === 0 ? 1 : 0,
  storeysSpanned: 1,
  targetArea: 8 + (index % 7) * 6,
  pinned: index % 11 === 0,
  tier: ['public', 'semi-public', 'private', 'exempt'][index % 4],
  bubble: { x: (index % 6) * 6 - 15, y: 4 + Math.floor(index / 6) * 5 },
}))

const edges: SimulationEdge[] = Array.from({ length: 30 }, (_unused, index) => ({
  a: `room-${index}`,
  b: `room-${(index + 3) % 30}`,
})).filter((edge) => edge.a !== edge.b)

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged. */
function milliseconds(work: () => void): number {
  for (let i = 0; i < 5; i++) work()
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

/**
 * One frame of the live run: the springs, the repulsion, the pulls and the correction over every
 * pair, which is the whole of what stands between a hand on a bubble and the next picture.
 */
it('takes one frame of thirty bubbles and thirty links in under a millisecond', () => {
  const layout = layoutFor(1)
  let state = createState(rooms, edges, 2)
  const took = milliseconds(() => {
    for (let frame = 0; frame < 20; frame++) state = step(state, layout)
  })
  expect(state.energy).toBeLessThan(Infinity)
  expect(took / 20).toBeLessThan(1)
})

it('takes a frame of the same program under the plain layout in under a millisecond', () => {
  let state = createState(rooms, edges, 2)
  const took = milliseconds(() => {
    for (let frame = 0; frame < 20; frame++) state = step(state, defaultLayout)
  })
  expect(state.energy).toBeLessThan(Infinity)
  expect(took / 20).toBeLessThan(1)
})
