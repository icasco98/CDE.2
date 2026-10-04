/** Warm-up and sampling each run for at least this long, in ms, and at least this many times. */
const WARM_MS = 50
const SAMPLE_MS = 100
const RUNS = 20

/**
 * The fastest of many timed runs after a warm-up held long enough for the compiler to settle. On a
 * shared runner another worker can stall a run, or a stretch of runs, for longer than the work
 * takes; the fastest of many is what the work itself costs, so no budget is raised to absorb that.
 */
export function milliseconds(work: () => void): number {
  const warming = performance.now()
  for (let run = 0; run < RUNS || performance.now() - warming < WARM_MS; run++) work()
  let best = Infinity
  const sampling = performance.now()
  for (let run = 0; run < RUNS || performance.now() - sampling < SAMPLE_MS; run++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}
