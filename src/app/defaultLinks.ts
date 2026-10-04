import type { Project, Result, Store } from '../model'
import { impliedConnections } from '../rulebook'

/**
 * The default connections as real connections. The rulebook's table says what a villa is expected to
 * have, so a rebuilt program and a zone added arrive linked and the designer removes what this
 * house does not want, rather than accepting one offer at a time.
 */
type Linking = Pick<Store, 'actions' | 'getState'>

const between = (a: string, b: string) => (pair: { a: string; b: string }) =>
  (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)

/**
 * Every default connection this program implies and does not hold, made as a connection, but for the
 * pairs the project has declined; only the ones touching `zone` when one is named. Run inside the
 * transaction that added the zones, so one undo takes the zones and their links together.
 */
export function connectDefaults(store: Linking, zone?: string): Result | void {
  const project: Project = store.getState()
  for (const link of impliedConnections(project.zones, project.connections)) {
    if (zone !== undefined && link.a !== zone && link.b !== zone) continue
    if (project.declined.some(between(link.a, link.b))) continue
    const made = store.actions.connect({
      a: link.a,
      b: link.b,
      kind: link.kind,
      storey: link.storey,
    })
    if (!made.ok) return made
  }
}

/**
 * A connection taken out by the person. When the rulebook suggests that pair, the project keeps
 * it as declined, so a reload or the next zone added does not bring the suggestion back.
 */
export function takeOut(store: Linking, connectionId: string): Result | void {
  const connection = store.getState().connections.find((each) => each.id === connectionId)
  const cut = store.actions.disconnect(connectionId)
  if (!cut.ok || !connection) return cut
  const after = store.getState()
  const suggested = impliedConnections(after.zones, after.connections).some(
    between(connection.a, connection.b),
  )
  if (!suggested) return
  const kept = store.actions.decline(connection.a, connection.b)
  return kept.ok ? undefined : kept
}

/** The suggestions the person declined made again: all of them, or those of one zone. */
export function restoreSuggested(store: Linking, zone?: string): Result | void {
  const forgot = store.actions.forgetDeclined(zone)
  if (!forgot.ok) return forgot
  return connectDefaults(store, zone)
}
