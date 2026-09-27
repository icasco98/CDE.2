import type { Project, Result, Store } from '../model'
import { impliedConnections } from '../rulebook'

/**
 * The default connections as real edges. The rulebook's table says what a villa is expected to
 * have, so a rebuilt program and a room added arrive linked and the designer removes what this
 * house does not want, rather than accepting one offer at a time.
 */
type Linking = Pick<Store, 'actions' | 'getState'>

const between = (a: string, b: string) => (pair: { a: string; b: string }) =>
  (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a)

/**
 * Every default connection this program implies and does not hold, made as an edge, but for the
 * pairs the project has declined; only the ones touching `room` when one is named. Run inside the
 * transaction that added the rooms, so one undo takes the rooms and their links together.
 */
export function connectDefaults(store: Linking, room?: string): Result | void {
  const project: Project = store.getState()
  for (const link of impliedConnections(project.rooms, project.edges)) {
    if (room !== undefined && link.a !== room && link.b !== room) continue
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
 * it as declined, so a reload or the next room added does not bring the suggestion back.
 */
export function takeOut(store: Linking, edgeId: string): Result | void {
  const edge = store.getState().edges.find((each) => each.id === edgeId)
  const cut = store.actions.disconnect(edgeId)
  if (!cut.ok || !edge) return cut
  const after = store.getState()
  const suggested = impliedConnections(after.rooms, after.edges).some(between(edge.a, edge.b))
  if (!suggested) return
  const kept = store.actions.decline(edge.a, edge.b)
  return kept.ok ? undefined : kept
}

/** The suggestions the person declined made again: all of them, or those of one room. */
export function restoreSuggested(store: Linking, room?: string): Result | void {
  const forgot = store.actions.forgetDeclined(room)
  if (!forgot.ok) return forgot
  return connectDefaults(store, room)
}
