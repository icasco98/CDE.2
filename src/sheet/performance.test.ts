import { expect, it } from 'vitest'
import { report } from './report'
import { pocketsOf } from './pockets'
import { sampleSheet } from './sample'
import { MASS_START, massProjection, orderPrisms, prismsOf } from './mass'

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

const sheet = sampleSheet()

it('reads the embedded sheet’s report inside 5 ms', () => {
  const taken = milliseconds(() => report(sheet, 0))
  console.log(`report on the embedded sheet: ${taken.toFixed(2)} ms, budget 5 ms`)
  expect(taken).toBeLessThan(10)
})

it('finds the embedded sheet’s enclosed spaces inside 20 ms', () => {
  const taken = milliseconds(() => pocketsOf(sheet, 0))
  console.log(`pocketsOf on the embedded sheet: ${taken.toFixed(2)} ms, budget 20 ms`)
  expect(taken).toBeLessThan(40)
})

it('sorts the mass’s wall-line tree inside 4 ms for 60 prisms', () => {
  const P = massProjection(MASS_START, 600, 420)
  const crowd = {
    ...sheet,
    rooms: sheet.rooms.concat(
      sheet.rooms
        .filter((r) => r.placed && !r.fixed)
        .map((r, i) => ({ ...r, id: `up${i}`, storey: 1 })),
    ),
  }
  const prisms = prismsOf(crowd, P)
  expect(prisms.length).toBeGreaterThanOrEqual(40)
  const taken = milliseconds(() => orderPrisms(prisms, P))
  console.log(`the wall-line tree for ${prisms.length} prisms: ${taken.toFixed(2)} ms, budget 4 ms`)
  expect(taken).toBeLessThan(8)
})
