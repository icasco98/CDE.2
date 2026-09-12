import { createState, frontageOf, groundOf, type Body } from '../bubbles'
import type { Point } from '../geometry'
import { EXTERIOR, occupiedStoreys, type Edge, type Plot, type Room, type Site } from '../model'
import { buildableArea, companionOwners, kerbFor, roomTypeById } from '../rulebook'
import { partitionOf } from './partition'
import type { Partition, PartitionLink, PartitionRoom } from './types'

/*
 * The bubble diagram read across into what the partition asks for. Every number comes from the
 * rule the bubbles themselves run — where the bubble stands, where the corridor lies, what the
 * frontage rule gave each walled room — so the zone a room gets is grown from the bubble it had.
 */

/** The kinds a person comes in by: the entry on the ground, the stair on a floor above it. */
const ARRIVALS = ['entry-foyer', 'stair']

/** The house as the morph reads it, which is the whole project less the parts a plan ignores. */
export type House = {
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly plot: Plot
  readonly site: Site
}

function bubblesOf(house: House): ReadonlyMap<string, Body> {
  const ground = groundOf(house.plot, house.site)
  const rooms = house.rooms.map((room) => {
    const kind = roomTypeById(room.type)
    return {
      ...room,
      kind: room.type,
      ...(kind?.tier === undefined ? {} : { tier: kind.tier }),
    }
  })
  const edges = house.edges
    .filter((edge) => edge.a !== EXTERIOR && edge.b !== EXTERIOR)
    .map((edge) => ({ a: edge.a, b: edge.b, storey: edge.storey }))
  return new Map(createState(rooms, edges, ground).bodies.map((body) => [body.id, body]))
}

/** The stretch of the buildable line a walled room claimed, and the way in from it. */
function kerbOf(
  room: Room,
  house: House,
  claim: { readonly from: number; readonly to: number } | undefined,
): PartitionRoom['kerb'] {
  if (!claim) return undefined
  const side = kerbFor(room.type, groundOf(house.plot, house.site).sides)
  if (!side || side.length < 1e-9) return undefined
  const along: Point = [
    (side.to[0] - side.from[0]) / side.length,
    (side.to[1] - side.from[1]) / side.length,
  ]
  const at = (reach: number): Point => [
    side.from[0] + along[0] * reach,
    side.from[1] + along[1] * reach,
  ]
  return { from: at(claim.from), to: at(claim.to), inward: side.inward }
}

/**
 * One storey's partition. The rooms come in the order the program holds them, which is the order
 * everything downstream answers them in, so the same diagram gives the same plan twice.
 */
export function partitionStorey(house: House, storey: number): Partition {
  const ground = groundOf(house.plot, house.site)
  const bodies = bubblesOf(house)
  const frontage = frontageOf(
    house.rooms.map((room) => ({
      id: room.id,
      storey: room.storey,
      targetArea: room.targetArea,
      kind: room.type,
      ...(room.bubble === undefined ? {} : { at: room.bubble }),
    })),
    ground,
  )
  const owners = companionOwners(
    house.rooms.map((room) => ({ id: room.id, type: room.type })),
    house.edges,
  )
  const here = house.rooms.filter((room) => occupiedStoreys(room).includes(storey))
  const standing = new Set(here.map((room) => room.id))
  const rooms: PartitionRoom[] = here.flatMap((room) => {
    const body = bodies.get(room.id)
    if (!body) return []
    const owner = owners.get(room.id)
    return [
      {
        id: room.id,
        name: room.name,
        type: room.type,
        targetArea: room.targetArea,
        at: [body.x, body.y] as Point,
        radius: body.radius,
        half: body.half,
        angle: body.angle,
        ...(body.kerb === undefined
          ? {}
          : { kerb: kerbOf(room, house, frontage.claims.get(room.id)) }),
        ...(owner === undefined || !standing.has(owner) ? {} : { owner }),
      },
    ]
  })
  const links: PartitionLink[] = house.edges
    .filter((edge) => edge.storey === storey && standing.has(edge.a) && standing.has(edge.b))
    .map((edge) => ({ id: edge.id, a: edge.a, b: edge.b }))
  // The entry first, because the corridor is laid from it; then every room with its own street
  // door, because a diwaniya or a garage bay is reached from the street and not through the house.
  const outside = new Set(
    house.edges
      .filter((edge) => edge.a === EXTERIOR || edge.b === EXTERIOR)
      .map((edge) => (edge.a === EXTERIOR ? edge.b : edge.a)),
  )
  const first = ARRIVALS.map((kind) => here.find((room) => room.type === kind)).find(
    (room) => room !== undefined,
  )
  const arrivals = [
    ...(first ? [first.id] : []),
    ...here.filter((room) => outside.has(room.id) && room.id !== first?.id).map((room) => room.id),
  ]
  const service = ground.sides.service
  return partitionOf({
    rooms,
    links,
    arrivals,
    plot: house.plot.polygon,
    buildable: buildableArea(house.plot),
    ...(service === undefined
      ? {}
      : { street: { from: service.from, to: service.to, inward: service.inward } }),
  })
}
