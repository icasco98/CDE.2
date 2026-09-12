import { expect, it } from 'vitest'
import { startingSite } from '../model'
import { correctContacts } from './correction'
import {
  createState,
  defaultLayout,
  layoutFor,
  settle,
  step,
  type SimulationEdge,
} from './simulation'
import { groundOf } from './ground'

/**
 * Thirty rooms over three storeys and thirty links, the size a villa's program runs to, with three
 * of them stairs standing through every storey.
 */
const spanning = new Set([4, 13, 22])

const rooms = Array.from({ length: 30 }, (_unused, index) => ({
  id: `room-${index}`,
  storey: spanning.has(index) ? 0 : index % 3,
  storeysSpanned: spanning.has(index) ? 3 : 1,
  targetArea: 8 + (index % 7) * 6,
  pinned: index % 11 === 0,
  tier: ['public', 'semi-public', 'private', 'exempt'][index % 4],
  bubble: { x: 3 + (index % 6) * 2.5, y: 3 + Math.floor(index / 6) * 3.5 },
}))

/** The starting plot with its setbacks: the floor thirty rooms are crowded onto. */
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

const edges: SimulationEdge[] = Array.from({ length: 30 }, (_unused, index) => ({
  a: `room-${index}`,
  b: `room-${(index + 3) % 30}`,
  storey: index % 3,
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
  const layout = layoutFor({ userRequirements: 1, siteConstraints: 1 })
  let state = createState(rooms, edges, floor)
  const took = milliseconds(() => {
    for (let frame = 0; frame < 20; frame++) state = step(state, layout)
  })
  expect(state.energy).toBeLessThan(Infinity)
  expect(took / 20).toBeLessThan(1)
})

it('takes a frame of the same program under the plain layout in under a millisecond', () => {
  let state = createState(rooms, edges, floor)
  const took = milliseconds(() => {
    for (let frame = 0; frame < 20; frame++) state = step(state, defaultLayout)
  })
  expect(state.energy).toBeLessThan(Infinity)
  expect(took / 20).toBeLessThan(1)
})

/**
 * The whole of what one press of Settle now runs for a villa's worth of rooms: the canonical
 * start, the forces and the projection to rest, and then the correction that walks the links that
 * did not close. The budget is two seconds; a villa settles in a tenth of one.
 */
it('settles thirty rooms and corrects their contacts in well under two seconds', () => {
  const layout = layoutFor({ userRequirements: 1, siteConstraints: 1 })
  const whole = (): number => {
    const out = settle(createState(rooms, edges, floor), layout)
    return correctContacts(out.state, layout).state.bodies.length
  }
  whole()
  const started = performance.now()
  expect(whole()).toBe(30)
  expect(performance.now() - started).toBeLessThan(2000)
})
