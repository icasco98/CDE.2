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
  const room = project.rooms.find((each) => each.id === endpoint)
  return room ? occupiedStoreys(room) : []
}

/** Whether an edge could still be held: its two ends have a storey in common to be joined on. */
function meet(project: Project, a: Endpoint, b: Endpoint): boolean {
  const onB = standsOn(project, b)
  return standsOn(project, a).some((storey) => onB.includes(storey))
}

/**
 * A room changes the storey it stands on, and what belongs with it goes too. The companions it
 * owns travel with it, the links it can no longer hold are let go, and the default connections
 * are made again on the floor it has arrived at, so a bedroom moved upstairs takes its ensuite,
 * leaves the ground-floor corridor behind and finds the corridor upstairs.
 *
 * It is one transaction, so one undo puts the whole move back. A stair refuses: it stands on
 * every storey it reaches and its span is the program's to set. What comes back is a sentence for
 * every door the move let go, so the person is told rather than left to notice.
 */
export function sendToStorey(store: Moving, id: string, storey: number): Result<readonly string[]> {
  const room = store.getState().rooms.find((each) => each.id === id)
  if (room && Math.max(1, Math.trunc(room.storeysSpanned)) > 1)
    return refused({ code: 'stair-storey', message: STAIR_STAYS })
  const letGo: string[] = []
  const moved = store.transaction(() => {
    const project = store.getState()
    const moving = [id, ...companionsOf(project.rooms, project.edges, id)]
    const carried = new Set(moving)
    // Written down before they are cut: what can stand on the new storey is joined again after.
    const held = project.edges.filter((edge) => carried.has(edge.a) || carried.has(edge.b))
    for (const edge of held) {
      const cut = store.actions.disconnect(edge.id)
      if (!cut.ok) return cut
    }
    for (const each of moving) {
      const set = store.actions.setStorey(each, storey)
      if (!set.ok) return set
    }
    const after = store.getState()
    const nameOf = (endpoint: Endpoint): string =>
      endpoint === EXTERIOR
        ? 'the street'
        : (after.rooms.find((each) => each.id === endpoint)?.name ?? 'a room')
    for (const edge of held) {
      if (!meet(after, edge.a, edge.b)) {
        const near = carried.has(edge.a) ? edge.a : edge.b
        const far = carried.has(edge.a) ? edge.b : edge.a
        letGo.push(`${nameOf(near)}: its door to ${nameOf(far)} was let go.`)
        continue
      }
      const made = store.actions.connect({
        a: edge.a,
        b: edge.b,
        kind: edge.kind,
        ...(edge.hint === undefined ? {} : { hint: edge.hint }),
      })
      if (!made.ok) return made
    }
    return connectDefaults(store)
  })
  return moved.ok ? ok(letGo as readonly string[]) : moved
}
