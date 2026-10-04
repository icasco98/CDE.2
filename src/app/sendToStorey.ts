import {
  EXTERIOR,
  occupiedStoreys,
  ok,
  refused,
  type Endpoint,
  type Project,
  type Result,
  type Store,
} from '../model'
import { companionsOf } from '../rulebook'
import { STAIR_STAYS } from '../views/bubbles/types'
import { connectDefaults } from './defaultLinks'

/** What a storey change needs of the session: its actions, the project, and one undo step round them. */
type Moving = Pick<Store, 'actions' | 'getState' | 'transaction'>

/** The storeys an endpoint stands on. The outside stands on every one of them. */
function standsOn(project: Project, endpoint: Endpoint): readonly number[] {
  if (endpoint === EXTERIOR) return Array.from({ length: project.storeys }, (_, i) => i)
  const zone = project.zones.find((each) => each.id === endpoint)
  return zone ? occupiedStoreys(zone) : []
}

/** Whether a connection could still be held: its two ends have a storey in common to be joined on. */
function meet(project: Project, a: Endpoint, b: Endpoint): boolean {
  const onB = standsOn(project, b)
  return standsOn(project, a).some((storey) => onB.includes(storey))
}

/** A zone and the storey it is sent to. */
export type StoreyMove = { readonly id: string; readonly storey: number }

/**
 * Zones change the storey they stand on, and what belongs with them goes too. The companions each
 * owns travel with it, unless `carries` says one stays, the links they can no longer hold are let
 * go, and the default connections are made again on the floors they have arrived at, so a bedroom
 * moved upstairs takes its ensuite, leaves the ground-floor corridor behind and finds the corridor
 * upstairs.
 *
 * It is one transaction with whatever `first` does, so one undo puts every move back. A stair refuses: it stands on every
 * storey it reaches and its span is the program's to set. What comes back is a sentence for every
 * door the moves let go, so the person is told rather than left to notice.
 */
export function sendZonesToStorey(
  store: Moving,
  moves: readonly StoreyMove[],
  carries: (companion: string) => boolean = () => true,
  first: () => Result | void = () => undefined,
): Result<readonly string[]> {
  for (const move of moves) {
    const zone = store.getState().zones.find((each) => each.id === move.id)
    if (zone && Math.max(1, Math.trunc(zone.storeysSpanned)) > 1)
      return refused({ code: 'stair-storey', message: STAIR_STAYS })
  }
  const letGo: string[] = []
  const moved = store.transaction(() => {
    const prepared = first()
    if (prepared && !prepared.ok) return prepared
    const project = store.getState()
    const storeyOfMoving = new Map<string, number>()
    for (const move of moves) {
      storeyOfMoving.set(move.id, move.storey)
      for (const companion of companionsOf(project.zones, project.connections, move.id))
        if (!storeyOfMoving.has(companion) && carries(companion))
          storeyOfMoving.set(companion, move.storey)
    }
    const carried = new Set(storeyOfMoving.keys())
    // Written down before they are cut: what can stand on the new storey is joined again after.
    const held = project.connections.filter(
      (connection) => carried.has(connection.a) || carried.has(connection.b),
    )
    for (const connection of held) {
      const cut = store.actions.disconnect(connection.id)
      if (!cut.ok) return cut
    }
    for (const [each, storey] of storeyOfMoving) {
      const set = store.actions.setStorey(each, storey)
      if (!set.ok) return set
    }
    const after = store.getState()
    const nameOf = (endpoint: Endpoint): string =>
      endpoint === EXTERIOR
        ? 'the street'
        : (after.zones.find((each) => each.id === endpoint)?.name ?? 'a zone')
    for (const connection of held) {
      if (!meet(after, connection.a, connection.b)) {
        const near = carried.has(connection.a) ? connection.a : connection.b
        const far = carried.has(connection.a) ? connection.b : connection.a
        letGo.push(`${nameOf(near)}: its door to ${nameOf(far)} was let go.`)
        continue
      }
      const made = store.actions.connect({
        a: connection.a,
        b: connection.b,
        kind: connection.kind,
        ...(connection.hint === undefined ? {} : { hint: connection.hint }),
      })
      if (!made.ok) return made
    }
    return connectDefaults(store)
  })
  return moved.ok ? ok(letGo as readonly string[]) : moved
}

/** One zone sent to another storey with everything it owns: the program's and the bubbles' move. */
export const sendToStorey = (
  store: Moving,
  id: string,
  storey: number,
): Result<readonly string[]> => sendZonesToStorey(store, [{ id, storey }])
