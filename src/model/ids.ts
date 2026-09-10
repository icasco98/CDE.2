export type IdGenerator = (prefix: string) => string

/** xorshift32, so a seeded generator gives the same ids in a test and an unseeded one is random. */
function step(state: number): number {
  let next = state
  next ^= next << 13
  next ^= next >>> 17
  next ^= next << 5
  return next >>> 0
}

export function createIdGenerator(seed?: number): IdGenerator {
  let state = (seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0 || 0x9e3779b9
  return (prefix) => {
    state = step(state)
    return `${prefix}_${state.toString(36).padStart(7, '0')}`
  }
}
