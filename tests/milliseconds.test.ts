import { expect, it } from 'vitest'
import { milliseconds } from './milliseconds'

/** Holds the thread for a number of milliseconds, as another worker on a shared runner would. */
function hold(ms: number): void {
  const until = performance.now() + ms
  while (performance.now() < until);
}

it('charges a slow stretch of a dozen runs, as a busy runner gives, to the warm-up', () => {
  let calls = 0
  const taken = milliseconds(() => {
    calls += 1
    if (calls <= 12) hold(3)
  })
  expect(taken).toBeLessThan(1)
})

it('reads the fastest run when a run in three is held up', () => {
  let calls = 0
  const taken = milliseconds(() => {
    calls += 1
    if (calls % 3 === 0) hold(3)
  })
  expect(taken).toBeLessThan(1)
})
