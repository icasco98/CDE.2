import { connectDefaults } from '../../app/connectionDefaults'
import type { Result, Store } from '../../model'
import { companionName, zoneTypeById, standingOf, typicalArea } from '../../rulebook'

/** What adding a zone needs of the session, so a test can hand it a plain store. */
type Adding = Pick<Store, 'transaction' | 'actions' | 'getState'>

/**
 * Adds the chosen kind where the zone-type table stands it, the companion the table names beside
 * it, and the default connections the two imply. All of it goes in one step, so the one undo that
 * answers the one click takes the lot.
 */
export function addZoneWithCompanion(
  store: Adding,
  kindId: string,
  plotAreaM2: number,
  storeys: number,
): Result {
  const type = zoneTypeById(kindId)
  const name = type?.label ?? kindId
  const companionId = type?.companion
  const standing = standingOf(kindId, storeys)

  return store.transaction(() => {
    const added = store.actions.addZone({
      type: kindId,
      name,
      targetArea: typicalArea(kindId, plotAreaM2),
      ...standing,
    })
    if (!added.ok) return added
    if (companionId !== undefined) {
      const alongside = store.actions.addZone({
        type: companionId,
        name: companionName(companionId, name),
        targetArea: typicalArea(companionId, plotAreaM2),
        // A companion stands with the zone it serves, which is the storey that zone was just given.
        storey: standing.storey,
      })
      if (!alongside.ok) return alongside
    }
    // A zone arrives connected to what the rulebook expects it to touch, in the same step.
    return connectDefaults(store)
  })
}
