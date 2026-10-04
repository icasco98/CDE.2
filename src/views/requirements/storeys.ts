import type { Result, Zone, Store } from '../../model'
import { spansAllStoreys } from '../../rulebook'

/** What changing the storey count needs of the session, so a test can hand it a plain store. */
type Changing = Pick<Store, 'getState' | 'transaction' | 'actions'>

/**
 * The stairs and lifts that reach the top storey of the house as it stands. One that stops short is
 * a span the person set by hand, so a storey added above it or taken off below it leaves it alone.
 */
function reachingTheTop(store: Changing): readonly Zone[] {
  const { zones, storeys } = store.getState()
  return zones.filter(
    (zone) =>
      spansAllStoreys(zone.type) && zone.storey + Math.max(1, zone.storeysSpanned) === storeys,
  )
}

/**
 * A storey more, with every stair and lift stretched to reach it. The stretching is the store's
 * business rather than the model's, because only the zone-type table says which kinds do it.
 */
export function addStorey(store: Changing): Result {
  const storeys = store.getState().storeys + 1
  const stretch = reachingTheTop(store)
  if (stretch.length === 0) return store.actions.addStorey()
  return store.transaction(() => {
    const added = store.actions.addStorey()
    if (!added.ok) return added
    for (const zone of stretch) {
      const reaching = store.actions.setStorey(zone.id, zone.storey, storeys - zone.storey)
      if (!reaching.ok) return reaching
    }
  })
}

/** A storey fewer. The stairs come down first, or the storey they reach would read as in use. */
export function removeStorey(store: Changing): Result {
  const storeys = Math.max(1, store.getState().storeys - 1)
  const shorten = reachingTheTop(store).filter((zone) => zone.storey < storeys)
  if (shorten.length === 0) return store.actions.removeStorey()
  return store.transaction(() => {
    for (const zone of shorten) {
      const shortened = store.actions.setStorey(zone.id, zone.storey, storeys - zone.storey)
      if (!shortened.ok) return shortened
    }
    const removed = store.actions.removeStorey()
    if (!removed.ok) return removed
  })
}
