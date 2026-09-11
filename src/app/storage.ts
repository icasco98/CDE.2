import type { Storage } from '../model'

function inMemory(): Storage {
  const held = new Map<string, string>()
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value)
    },
    removeItem: (key) => {
      held.delete(key)
    },
  }
}

/** Browser storage where there is one, and a forgetful stand-in under a test runner. */
export function browserStorage(): Storage {
  try {
    const local = globalThis.localStorage
    if (local) return local
  } catch {
    return inMemory()
  }
  return inMemory()
}
