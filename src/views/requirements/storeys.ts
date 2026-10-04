import { EXTERIOR, type Endpoint, type Result, type Zone, type Store } from '../../model'
import { spansAllStoreys, storeyLabel } from '../../rulebook'

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

/** The connections on the top storey, said with the names the person gave the zones. */
function connectionsOnTop(store: Changing): readonly string[] {
  const { zones, connections, storeys } = store.getState()
  const top = storeys - 1
  const nameOf = (end: Endpoint): string =>
    end === EXTERIOR ? 'the outside' : (zones.find((zone) => zone.id === end)?.name ?? 'a zone')
  return connections
    .filter((connection) => connection.storey === top && top > 0)
    .map(
      (connection) =>
        `The ${storeyLabel(top)} storey still holds the connection between ${nameOf(connection.a)} and ${nameOf(connection.b)}.`,
    )
}

/**
 * A storey fewer. A connection on the top storey refuses it first, by name, since shortening a
 * stair under it would otherwise be refused in the model's own ids. The stairs come down next, or
 * the storey they reach would read as in use.
 */
export function removeStorey(store: Changing): Result {
  const held = connectionsOnTop(store)
  if (held.length > 0)
    return {
      ok: false,
      problems: held.map((message) => ({ code: 'storey-holds-connection', message })),
    }
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
