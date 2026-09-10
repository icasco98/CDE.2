import { typicalArea } from './sizes'

export type Household = {
  readonly familySize: number
  readonly bedrooms: number
  readonly maid: boolean
  readonly driver: boolean
  readonly cars: number
  readonly womensReception: boolean
}

export type ProgramRoom = {
  readonly type: string
  readonly name: string
  readonly targetArea: number
}

export const startingHousehold: Household = {
  familySize: 4,
  bedrooms: 3,
  maid: false,
  driver: false,
  cars: 2,
  womensReception: false,
}

/** The standard trio plus the rooms this household implies, each at its typical target area. */
export function defaultProgram(plotAreaM2: number, household: Household): readonly ProgramRoom[] {
  const rooms: ProgramRoom[] = []
  const add = (type: string, name: string): void => {
    rooms.push({ type, name, targetArea: typicalArea(type, plotAreaM2) })
  }

  add('entry-foyer', 'Entry')
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
    add(i === 0 ? 'master-bedroom' : 'bedroom', name)
    add('ensuite-bathroom', `Ensuite, ${name}`)
  }

  if (household.maid) {
    add('maid-room', 'Maid Room')
    add('maid-bathroom', 'Maid Bathroom')
  }
  if (household.driver) {
    add('driver-room', 'Driver Room')
    add('driver-bathroom', 'Driver Bathroom')
  }

  const cars = Math.max(0, Math.trunc(household.cars))
  for (let i = 0; i < cars; i++) add('garage', `Garage bay ${i + 1}`)

  return rooms
}
