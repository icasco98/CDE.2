import { expect, it } from 'vitest'
import type { Household } from '../model'
import { defaultProgram } from './program'
import { reductionFor, type SlackRoom } from './slack'
import { pastAllowed, pastRange, type MeasuredRoom } from './sizeCheck'

/*
 * The budgets the brief set: the offer a spilling storey makes under 5 ms, because it is worked
 * out beside the morph, and the size check under 1 ms, because it runs after every gesture on the
 * plan sheet and a gesture has a frame to spare and no more.
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

const household: Household = {
  familySize: 4,
  bedrooms: 3,
  maid: true,
  driver: true,
  cars: 2,
  womensReception: true,
  masterOnGround: false,
}

const PLOT_M2 = 500

const laid = defaultProgram(PLOT_M2, household, 2)
const ground = laid.filter((room) => room.storey === 0 || room.storeysSpanned > 1)

const rooms: readonly SlackRoom[] = ground.map((room) => ({
  id: room.name,
  name: room.name,
  type: room.type,
  targetArea: room.targetArea,
}))

const measured: readonly MeasuredRoom[] = rooms.map((room) => ({
  id: room.id,
  name: room.name,
  type: room.type,
  areaM2: room.targetArea,
}))

it('offers the rooms to reduce on a spilling storey in under 5 ms', () => {
  const took = milliseconds(() =>
    reductionFor({
      rooms,
      overflowM2: 30,
      buildableM2: 250,
      plotAreaM2: PLOT_M2,
      storey: 0,
    }),
  )
  expect([rooms.length > 12, took < 5]).toEqual([true, true])
})

it('checks every placed room, the storey and the house in under 1 ms', () => {
  const took = milliseconds(() => {
    pastRange(measured, PLOT_M2)
    pastAllowed({
      storey: 0,
      storeyAreaM2: 380,
      buildableM2: 365.5,
      houseAreaM2: 990,
      plotAreaM2: PLOT_M2,
    })
  })
  expect([measured.length > 12, took < 1]).toEqual([true, true])
})
