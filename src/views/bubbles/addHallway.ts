import type { Result, Room, Store } from '../../model'
import { hallwayArea, hallwayFollows, hallwayName } from '../../rulebook'

/** What adding a hallway needs of the session, so a test can hand it a plain store. */
type Adding = Pick<Store, 'actions'>

/**
 * A hallway on this storey, sized by the circulation rule from the rooms standing there at this
 * moment and put in the program where a rebuild would have put it, so a program that was built and
 * a program that was mended read the same way.
 */
export function addHallway(
  store: Adding,
  rooms: readonly Room[],
  storey: number,
  storeys: number,
): Result<string> {
  const after = rooms[hallwayFollows(rooms, storey) - 1]?.id
  return store.actions.addRoom({
    type: 'hallway',
    name: hallwayName(storey, storeys),
    targetArea: hallwayArea(rooms, storey),
    storey,
    ...(after === undefined ? {} : { after }),
  })
}
