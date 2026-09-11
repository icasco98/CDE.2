import type { Result, Store } from '../../model'
import { roomTypeById, spansAllStoreys, typicalArea } from '../../rulebook'

/** What adding a room needs of the session, so a test can hand it a plain store. */
type Adding = Pick<Store, 'transaction' | 'actions'>

/** A new room opens on the ground and is moved after; a stair or a lift reaches every storey. */
function standing(kindId: string, storeys: number): { storey: number; storeysSpanned: number } {
  return { storey: 0, storeysSpanned: spansAllStoreys(kindId) ? Math.max(1, storeys) : 1 }
}

/**
 * Adds the chosen kind and, when the room-type table names one, the companion it brings with it.
 * Both go in one step, so the one undo that answers the one click removes the pair together.
 */
export function addRoomWithCompanion(
  store: Adding,
  kindId: string,
  plotAreaM2: number,
  storeys: number,
): Result {
  const type = roomTypeById(kindId)
  const name = type?.label ?? kindId
  const companionId = type?.companion
  const companion = companionId === undefined ? undefined : roomTypeById(companionId)
  const place = standing(kindId, storeys)

  return store.transaction(() => {
    const added = store.actions.addRoom({
      type: kindId,
      name,
      targetArea: typicalArea(kindId, plotAreaM2),
      ...place,
    })
    if (!added.ok) return added
    if (!companion) return
    const alongside = store.actions.addRoom({
      type: companion.id,
      name: `${companion.label}, ${name}`,
      targetArea: typicalArea(companion.id, plotAreaM2),
      // A companion stands with the room it serves, which is the storey that room was just given.
      storey: place.storey,
    })
    if (!alongside.ok) return alongside
  })
}
