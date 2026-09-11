import type { Household } from '../model'
import { roomTypeById, typicalArea } from './sizes'

export type ProgramRoom = {
  readonly type: string
  readonly name: string
  readonly targetArea: number
  readonly storey: number
  readonly storeysSpanned: number
}

/** A kind the table puts on every storey stands on the ground and reaches the top, as a stair does. */
function spanOf(kindId: string, storeys: number): number {
  return roomTypeById(kindId)?.defaultStorey === 'all' ? storeys : 1
}

/**
 * The storey a kind opens on. `any` opens on the ground beside `ground`, and above two storeys every
 * `upper` kind still opens on the first; the person moves rooms up from there.
 */
function storeyOf(kindId: string, storeys: number): number {
  const where = roomTypeById(kindId)?.defaultStorey ?? 'ground'
  if (where === 'top') return storeys - 1
  if (where === 'upper') return storeys > 1 ? 1 : 0
  return 0
}

/** The standard trio plus the rooms this household implies, each at its typical target area. */
export function defaultProgram(
  plotAreaM2: number,
  household: Household,
  storeys: number,
): readonly ProgramRoom[] {
  const levels = Math.max(1, Math.trunc(storeys))
  const rooms: ProgramRoom[] = []
  const add = (type: string, name: string, storey = storeyOf(type, levels)): void => {
    rooms.push({
      type,
      name,
      targetArea: typicalArea(type, plotAreaM2),
      storey,
      storeysSpanned: spanOf(type, levels),
    })
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
    const storey = i === 0 && household.masterOnGround ? 0 : storeyOf(kind, levels)
    add(kind, name, storey)
    // A companion stands with the room it serves, so the ensuite takes its own bedroom's storey.
    add('ensuite-bathroom', `Ensuite, ${name}`, storey)
  }

  if (household.maid) {
    add('maid-room', 'Maid Room')
    add('maid-bathroom', 'Maid Bathroom', storeyOf('maid-room', levels))
  }
  if (household.driver) {
    add('driver-room', 'Driver Room')
    add('driver-bathroom', 'Driver Bathroom', storeyOf('driver-room', levels))
  }

  const cars = Math.max(0, Math.trunc(household.cars))
  for (let i = 0; i < cars; i++) add('garage', `Garage bay ${i + 1}`)

  return rooms
}
