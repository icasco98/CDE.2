import { expect, it } from 'vitest'
import { report } from './report'
import { pocketsOf } from './pockets'
import { sampleSheet } from './sample'

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
