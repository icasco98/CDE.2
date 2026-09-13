import { expect, it } from 'vitest'
import { occupiedStoreys } from '../model'
import { settled, startingPlot, villa } from './houses'
import { partitionStorey } from './storey'

/*
 * The budget the brief set: one storey of a twenty by twenty-five plot, fourteen rooms, divided
 * and then straightened into running walls under 250 ms, which is the pause between pressing
 * Morph and the animation starting.
 */

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

/** The default two-storey villa with a maid and two cars: fourteen rooms on its ground floor. */
const house = settled(villa(2, { maid: true, cars: 2 }, startingPlot))

it('partitions and straightens fourteen rooms on a 20 by 25 plot in under 250 ms', () => {
  const rooms = house.rooms.filter((room) => occupiedStoreys(room).includes(0))
  expect(rooms.length).toBe(14)
  const took = milliseconds(() => partitionStorey(house, 0))
  expect([rooms.length, took < 250]).toEqual([14, true])
})

it('makes the proposal again after a room is reduced, inside the same 250 ms', () => {
  // The click sets one target and the storey is morphed again from the same bubbles, so the
  // second morph is the one a person waits on between clicking a room and seeing the new plan.
  const smaller = {
    ...house,
    rooms: house.rooms.map((room) =>
      room.type === 'diwaniya' ? { ...room, targetArea: 45 } : room,
    ),
  }
  const took = milliseconds(() => partitionStorey(smaller, 0))
  expect(took < 250).toBe(true)
})
