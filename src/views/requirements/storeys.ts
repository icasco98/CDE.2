import type { Result, Room, Store } from '../../model'
import { spansAllStoreys } from '../../rulebook'

/** What changing the storey count needs of the session, so a test can hand it a plain store. */
type Changing = Pick<Store, 'getState' | 'transaction' | 'actions'>

/** The rooms that stand on every storey the house has: a stair on the ground, a lift beside it. */
function spanning(store: Changing): readonly Room[] {
  return store.getState().rooms.filter((room) => spansAllStoreys(room.type) && room.storey === 0)
}

/**
 * A storey more, with every stair and lift stretched to reach it. The stretching is the store's
 * business rather than the model's, because only the room-type table says which kinds do it.
 */
export function addStorey(store: Changing): Result {
  const storeys = store.getState().storeys + 1
  const stretch = spanning(store)
  if (stretch.length === 0) return store.actions.addStorey()
  return store.transaction(() => {
    const added = store.actions.addStorey()
    if (!added.ok) return added
    for (const room of stretch) {
      const reaching = store.actions.setStorey(room.id, 0, storeys)
      if (!reaching.ok) return reaching
    }
  })
}

/** A storey fewer. The stairs come down first, or the storey they reach would read as in use. */
export function removeStorey(store: Changing): Result {
  const storeys = Math.max(1, store.getState().storeys - 1)
  const shorten = spanning(store)
  if (shorten.length === 0) return store.actions.removeStorey()
  return store.transaction(() => {
    for (const room of shorten) {
      const shortened = store.actions.setStorey(room.id, 0, storeys)
      if (!shortened.ok) return shortened
    }
    const removed = store.actions.removeStorey()
    if (!removed.ok) return removed
  })
}
