import { useSyncExternalStore } from 'react'

/** What is selected: a zone id, a connection id, or nothing. One selection serves every stage, so a zone picked in the bubbles is the zone picked in the zoning. */
let selected: string | null = null
const listeners = new Set<() => void>()

export const selection = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  get: (): string | null => selected,
  select(id: string | null): void {
    if (id === selected) return
    selected = id
    listeners.forEach((listener) => listener())
  },
}

export function useSelection(): string | null {
  return useSyncExternalStore(selection.subscribe, selection.get, selection.get)
}
