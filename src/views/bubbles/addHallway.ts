import type { Result, Zone, Store } from '../../model'
import { hallwayArea, hallwayFollows, hallwayName } from '../../rulebook'

/** What adding a hallway needs of the session, so a test can hand it a plain store. */
type Adding = Pick<Store, 'actions'>

/**
 * A hallway on this storey, sized by the circulation rule from the zones standing there at this
 * moment and put in the program where a rebuild would have put it, so a program that was built and
 * a program that was mended read the same way.
 */
export function addHallway(
  store: Adding,
  zones: readonly Zone[],
  storey: number,
  storeys: number,
): Result<string> {
  const after = zones[hallwayFollows(zones, storey) - 1]?.id
  return store.actions.addZone({
    type: 'hallway',
    name: hallwayName(storey, storeys),
    targetArea: hallwayArea(zones, storey),
    storey,
    ...(after === undefined ? {} : { after }),
  })
}
