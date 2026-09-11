import type { Household } from '../model'
import { hallwayArea, hallwayFollows, hallwayName, needsHallway } from './circulation'
import { roomTypeById, typicalArea } from './sizes'

export type ProgramRoom = {
  readonly type: string
  readonly name: string
  readonly targetArea: number
  readonly storey: number
  readonly storeysSpanned: number
}

/** Where a room of a kind stands the moment it is made: its storey and the storeys it reaches. */
export type Standing = { readonly storey: number; readonly storeysSpanned: number }

/**
 * The table's default storey read into a house of this many storeys. `any` opens on the ground
 * beside `ground`, and above two storeys every `upper` kind still opens on the first; the person
 * moves rooms up from there. A kind the table puts on every storey stands on the ground and
 * reaches the top, which is what a stair and a lift do.
 */
export function standingOf(kindId: string, storeys: number): Standing {
  const levels = Math.max(1, Math.trunc(storeys))
  const where = roomTypeById(kindId)?.defaultStorey ?? 'ground'
  if (where === 'all') return { storey: 0, storeysSpanned: levels }
  if (where === 'top') return { storey: levels - 1, storeysSpanned: 1 }
  if (where === 'upper') return { storey: levels > 1 ? 1 : 0, storeysSpanned: 1 }
  return { storey: 0, storeysSpanned: 1 }
}

/**
 * What a companion is called. An ensuite is one of several in a house, so it carries the name of
 * the room it serves; every other companion is one to a house and its own label says enough.
 */
export function companionName(companionId: string, roomName: string): string {
  const label = roomTypeById(companionId)?.label ?? companionId
  return companionId === 'ensuite-bathroom' ? `Ensuite, ${roomName}` : label
}

/** The standard trio plus the rooms this household implies, each at its typical target area. */
export function defaultProgram(
  plotAreaM2: number,
  household: Household,
  storeys: number,
): readonly ProgramRoom[] {
  const levels = Math.max(1, Math.trunc(storeys))
  const rooms: ProgramRoom[] = []

  const put = (type: string, name: string, storey: number): void => {
    rooms.push({
      type,
      name,
      targetArea: typicalArea(type, plotAreaM2),
      storey,
      storeysSpanned: standingOf(type, levels).storeysSpanned,
    })
  }

  const add = (type: string, name: string, on = standingOf(type, levels).storey): void => {
    put(type, name, on)
    // A companion stands with the room it serves, so it takes that room's storey, not its own
    // default, and brings nothing further of its own.
    const companion = roomTypeById(type)?.companion
    if (companion) put(companion, companionName(companion, name), on)
  }

  add('entry-foyer', 'Entry')
  // The stair comes with the storeys rather than with the household, so one storey gets none.
  if (levels > 1) add('stair', 'Stair')
  add('diwaniya', 'Diwaniya')
  add('formal-living', 'Formal Living')
  if (household.womensReception) add('womens-reception', "Women's Reception")
  add('family-living', 'Family Living')
  add('dining-room', 'Dining Room')
  add('kitchen', 'Kitchen')
  add('guest-wc', 'Guest WC')

  const bedrooms = Math.max(0, Math.trunc(household.bedrooms))
  for (let i = 0; i < bedrooms; i++) {
    const name = i === 0 ? 'Master Bedroom' : `Bedroom ${i}`
    const kind = i === 0 ? 'master-bedroom' : 'bedroom'
    // Parents on the ground floor is a common Kuwaiti arrangement, so the household may ask for it.
    add(kind, name, i === 0 && household.masterOnGround ? 0 : standingOf(kind, levels).storey)
  }

  if (household.maid) add('maid-room', 'Maid Room')
  if (household.driver) add('driver-room', 'Driver Room')

  const cars = Math.max(0, Math.trunc(household.cars))
  for (let i = 0; i < cars; i++) add('garage', `Garage bay ${i + 1}`)

  // A hallway is sized from the rooms it serves, so the storey has to be whole before one can be
  // laid out; every place is read off that whole storey and they go in together afterwards.
  const hallways: { readonly at: number; readonly room: ProgramRoom }[] = []
  for (let storey = 0; storey < levels; storey++) {
    if (!needsHallway(rooms, storey)) continue
    hallways.push({
      at: hallwayFollows(rooms, storey),
      room: {
        type: 'hallway',
        name: hallwayName(storey, levels),
        targetArea: hallwayArea(rooms, storey),
        storey,
        storeysSpanned: 1,
      },
    })
  }
  const laid: ProgramRoom[] = []
  for (let at = 0; at <= rooms.length; at++) {
    for (const hallway of hallways) if (hallway.at === at) laid.push(hallway.room)
    const room = rooms[at]
    if (room) laid.push(room)
  }
  return laid
}
