import { canonicalStart, groundOf } from '../bubbles'
import { EXTERIOR, type Result, type Store } from '../model'
import { roomTypeById } from '../rulebook'

/** What opening the bubbles needs of the session: the project, and one action to record a place. */
type Opening = Pick<Store, 'actions' | 'getState'>

/**
 * Every room that has nowhere to stand yet opened at the place the first arrangement gives it.
 * The arrangement belongs to the program, not to the Bubbles tab: a room has a bubble from the
 * moment it is made, so the plan can be laid out from a program nobody has looked at yet. A room
 * the designer has already moved keeps where it is.
 */
export function openBubbles(store: Opening): Result | void {
  const project = store.getState()
  if (project.rooms.every((room) => room.bubble)) return
  const ground = groundOf(project.plot, project.site)
  const opened = canonicalStart(
    project.rooms.map((room) => {
      const kind = roomTypeById(room.type)
      return {
        id: room.id,
        storey: room.storey,
        targetArea: room.targetArea,
        kind: room.type,
        ...(kind?.tier === undefined ? {} : { tier: kind.tier }),
      }
    }),
    project.edges.filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR),
    ground,
  )
  for (const room of project.rooms) {
    const at = room.bubble ?? opened.get(room.id)
    if (!at || room.bubble) continue
    const set = store.actions.setBubble(room.id, at)
    if (!set.ok) return set
  }
}
