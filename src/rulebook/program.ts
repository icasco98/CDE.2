import type { Household } from '../model'
import { hallwayArea, hallwayFollows, hallwayName, needsHallway } from './circulation'
import { zoneTypeById, typicalArea } from './sizes'

export type ProgramZone = {
  readonly type: string
  readonly name: string
  readonly targetArea: number
  readonly storey: number
  readonly storeysSpanned: number
}

/** Where a zone of a kind stands the moment it is made: its storey and the storeys it reaches. */
export type Standing = { readonly storey: number; readonly storeysSpanned: number }

/**
 * The table's default storey read into a house of this many storeys. `any` opens on the ground
 * beside `ground`, and above two storeys every `upper` kind still opens on the first; the person
 * moves zones up from there. A kind the table puts on every storey stands on the ground and
 * reaches the top, which is what a stair and a lift do.
 */
export function standingOf(kindId: string, storeys: number): Standing {
  const levels = Math.max(1, Math.trunc(storeys))
  const where = zoneTypeById(kindId)?.defaultStorey ?? 'ground'
  if (where === 'all') return { storey: 0, storeysSpanned: levels }
  if (where === 'top') return { storey: levels - 1, storeysSpanned: 1 }
  if (where === 'upper') return { storey: levels > 1 ? 1 : 0, storeysSpanned: 1 }
  return { storey: 0, storeysSpanned: 1 }
}

/**
 * What a companion is called. An ensuite is one of several in a house, so it carries the name of
 * the zone it serves; every other companion is one to a house and its own label says enough.
 */
export function companionName(companionId: string, zoneName: string): string {
  const label = zoneTypeById(companionId)?.label ?? companionId
  return companionId === 'ensuite-bathroom' ? `Ensuite, ${zoneName}` : label
}

/**
 * The standard trio plus the zones this household implies, each at its typical target area. A kind
 * named in `raised` whose table storey is `any` stands on the first storey rather than the ground.
 */
export function defaultProgram(
  plotAreaM2: number,
  household: Household,
  storeys: number,
  raised: ReadonlySet<string> = new Set(),
): readonly ProgramZone[] {
  const levels = Math.max(1, Math.trunc(storeys))
  const zones: ProgramZone[] = []

  const put = (type: string, name: string, storey: number): void => {
    zones.push({
      type,
      name,
      targetArea: typicalArea(type, plotAreaM2),
      storey,
      storeysSpanned: standingOf(type, levels).storeysSpanned,
    })
  }

  const lifted = (type: string): boolean =>
    levels > 1 && raised.has(type) && zoneTypeById(type)?.defaultStorey === 'any'

  const add = (
    type: string,
    name: string,
    on = lifted(type) ? 1 : standingOf(type, levels).storey,
  ): void => {
    put(type, name, on)
    // A companion stands with the zone it serves, so it takes that zone's storey, not its own
    // default, and brings nothing further of its own.
    const companion = zoneTypeById(type)?.companion
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

  // A hallway is sized from the zones it serves, so the storey has to be whole before one can be
  // laid out; every place is read off that whole storey and they go in together afterwards.
  const hallways: { readonly at: number; readonly zone: ProgramZone }[] = []
  for (let storey = 0; storey < levels; storey++) {
    if (!needsHallway(zones, storey)) continue
    hallways.push({
      at: hallwayFollows(zones, storey),
      zone: {
        type: 'hallway',
        name: hallwayName(storey, levels),
        targetArea: hallwayArea(zones, storey),
        storey,
        storeysSpanned: 1,
      },
    })
  }
  const laid: ProgramZone[] = []
  for (let at = 0; at <= zones.length; at++) {
    for (const hallway of hallways) if (hallway.at === at) laid.push(hallway.zone)
    const zone = zones[at]
    if (zone) laid.push(zone)
  }
  return laid
}

/** A zone as the companion rule reads one: which zone it is and what kind it is. */
export type CompanionZone = { readonly id: string; readonly type: string }

/** A connection as the companion rule reads one: the pair it joins, whatever kind of opening it is. */
export type CompanionConnection = { readonly a: string; readonly b: string }

/**
 * Which zone each auxiliary zone belongs to. A companion is recognised by the company it keeps
 * rather than by its name: it is an auxiliary kind, and it is joined to exactly one zone of the
 * house. A bathroom off the corridor serves the house and stays where it is; a bedroom's own is
 * part of the bedroom and goes wherever the bedroom goes.
 */
export function companionOwners(
  zones: readonly CompanionZone[],
  connections: readonly CompanionConnection[],
): ReadonlyMap<string, string> {
  const known = new Set(zones.map((zone) => zone.id))
  const joined = new Map<string, Set<string>>()
  for (const connection of connections) {
    if (!known.has(connection.a) || !known.has(connection.b)) continue
    for (const [one, other] of [
      [connection.a, connection.b],
      [connection.b, connection.a],
    ] as const) {
      const to = joined.get(one) ?? new Set<string>()
      to.add(other)
      joined.set(one, to)
    }
  }
  const owners = new Map<string, string>()
  for (const zone of zones) {
    if (!zoneTypeById(zone.type)?.flags.auxiliary) continue
    const to = joined.get(zone.id)
    if (!to || to.size !== 1) continue
    const [owner] = [...to]
    if (owner !== undefined) owners.set(zone.id, owner)
  }
  return owners
}

/** The auxiliary zones one zone owns: its ensuite, its dressing room, its own WC. */
export function companionsOf(
  zones: readonly CompanionZone[],
  connections: readonly CompanionConnection[],
  id: string,
): readonly string[] {
  const owners = companionOwners(zones, connections)
  return [...owners].filter(([, owner]) => owner === id).map(([companion]) => companion)
}
