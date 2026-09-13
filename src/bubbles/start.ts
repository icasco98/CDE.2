import type { Point } from '../geometry'
import { companionsOf } from '../rulebook'
import { CORRIDOR_R, corridorHalf } from './capsule'
import { frontageOf, middleOf } from './frontage'
import { putInside, type Ground } from './ground'

/** A room as the first arrangement reads one: its kind, its floor, and how much of it there is. */
export type StartRoom = {
  readonly id: string
  readonly kind?: string
  readonly tier?: string
  readonly storey: number
  readonly targetArea: number
}

export type StartEdge = { readonly a: string; readonly b: string }

/** Where a room opens, in the plot's own metres, and for a corridor the way it lies. */
export type StartPlace = { readonly x: number; readonly y: number; readonly angle?: number }

function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

/** The kinds that stand on the kerb at the start, in the order they take the frontage. */
const kerbOrder: readonly string[] = ['diwaniya', 'entry-foyer', 'garage', 'service-entrance']

/** The kinds S8 keeps off the frontage; they come last up a column, at the back. */
const serviceKinds: readonly string[] = ['kitchen', 'laundry', 'maid-room', 'storage']

/** The kinds a corridor starts from, on the ground and on a floor above it. */
const anchorKinds: readonly string[] = ['entry-foyer', 'stair']

/**
 * The frame one storey is laid out in: `s` runs along the corridor from where it starts, `t`
 * across it, so a room's place is a side of the corridor and a distance along it.
 */
type Frame = {
  readonly origin: Point
  readonly es: Point
  readonly et: Point
}

function at(frame: Frame, s: number, t: number): Point {
  return [
    frame.origin[0] + frame.es[0] * s + frame.et[0] * t,
    frame.origin[1] + frame.es[1] * s + frame.et[1] * t,
  ]
}

/** How far the floor runs from a point along a way before the buildable line, in metres. */
function runFrom(ground: Ground, from: Point, way: Point): number {
  let run = 0
  for (let reach = 0.5; reach < 60; reach += 0.5) {
    const probe: Point = [from[0] + way[0] * reach, from[1] + way[1] * reach]
    const held = putInside(ground.inside, probe, 0.01)
    if (Math.hypot(held[0] - probe[0], held[1] - probe[1]) > 1e-6) break
    run = reach
  }
  return run
}

/** The four ways the plot runs: along its service street and in from it, or the sheet's own. */
function waysOf(ground: Ground): readonly Point[] {
  const street = ground.sides.service ?? ground.sides.every[0]
  const along: Point = street
    ? [
        (street.to[0] - street.from[0]) / Math.max(street.length, 1e-9),
        (street.to[1] - street.from[1]) / Math.max(street.length, 1e-9),
      ]
    : [1, 0]
  return [along, [-along[0], -along[1]], [-along[1], along[0]], [along[1], -along[0]]]
}

/**
 * The order rooms take up a column from the street: the rooms that receive first, the household's
 * own after them, and the service rooms at the back, which is U2's gradient and S8's rule in one
 * number. The tier is the room-type table's; a service kind counts as the deepest whatever it says.
 */
function depthRank(room: StartRoom): number {
  if (serviceKinds.includes(room.kind ?? '')) return 3
  if (room.tier === 'public') return 0
  if (room.tier === 'semi-public') return 1
  if (room.tier === 'private') return 2
  return 1
}

/**
 * The first arrangement, derived from the program and never from chance, and laid the way the
 * plan will be drawn: the walled rooms on the kerb in their claims; the corridor from the entry
 * straight into the plot, or from the stair along the way the floor runs furthest; and every
 * other room in one of two columns beside the corridor, the rooms a link ties together on one
 * side, the room the entry opens onto beside the entry, the family's rooms across from the
 * diwaniya, the columns kept level, and each column stacked from the street inward in the order
 * the rooms receive — public, semi-public, private, service. A companion opens on its owner's
 * perimeter. The same program on the same plot opens the same way every time, so the designer's
 * hand is the only source of variation.
 */
export function canonicalStart(
  rooms: readonly StartRoom[],
  edges: readonly StartEdge[],
  ground: Ground,
): ReadonlyMap<string, StartPlace> {
  const places = new Map<string, StartPlace>()
  const street = ground.sides.service ?? ground.sides.every[0]
  if (!street) return places
  const frontage = frontageOf(rooms, ground)
  const owned = new Map<string, string>()
  const withTypes = rooms.map((room) => ({ id: room.id, type: room.kind ?? '' }))
  for (const room of rooms)
    for (const companion of companionsOf(withTypes, edges, room.id)) owned.set(companion, room.id)
  const byId = new Map(rooms.map((room) => [room.id, room]))
  const linked = (a: string, b: string): boolean =>
    edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))

  const put = (room: StartRoom, point: Point, angle?: number): void => {
    const radius = room.kind === 'hallway' ? CORRIDOR_R : radiusOf(room.targetArea)
    const [x, y] = putInside(ground.inside, point, radius)
    places.set(room.id, angle === undefined ? { x, y } : { x, y, angle })
  }

  const inward = street.inward
  const alongStreet: Point = [
    (street.to[0] - street.from[0]) / Math.max(street.length, 1e-9),
    (street.to[1] - street.from[1]) / Math.max(street.length, 1e-9),
  ]
  /** Where a stretch of the frontage stands, a radius in from the kerb. */
  const onKerb = (along: number, radius: number): Point => [
    street.from[0] + alongStreet[0] * along + inward[0] * radius,
    street.from[1] + alongStreet[1] * along + inward[1] * radius,
  ]

  const storeys = [...new Set(rooms.map((room) => room.storey))].sort((one, other) => one - other)
  for (const storey of storeys) {
    const here = rooms.filter((room) => room.storey === storey && !owned.has(room.id))
    const standing = new Set(here.map((room) => room.id))

    // The kerb, claim by claim: the frontage rule says who takes which stretch of the street and in
    // what order, and the first arrangement stands each of them in the middle of its own stretch;
    // a bay the frontage would not hold stands in tandem, one bay-depth in behind the bay in front.
    const kerbed = here.filter((room) => kerbOrder.includes(room.kind ?? ''))
    for (const room of kerbed) {
      const claim = frontage.claims.get(room.id)
      if (claim) put(room, onKerb(middleOf(claim), radiusOf(room.targetArea)))
    }
    for (const room of kerbed) {
      const ahead = frontage.behind.get(room.id)
      const inFront = ahead === undefined ? undefined : frontage.claims.get(ahead)
      if (inFront) put(room, onKerb(middleOf(inFront), radiusOf(room.targetArea) * 3))
    }
    const onTheKerb = kerbed.filter((room) => places.has(room.id))

    // The corridor starts on the entry and runs straight in from the street; on a floor with no
    // entry it starts on the stair, already standing where the floor below put it, and runs the
    // way the floor has the most room. Without either it starts from the middle of the frontage.
    const corridors = here.filter((room) => room.kind === 'hallway')
    const anchor =
      here.find((room) => room.kind === 'entry-foyer' && places.has(room.id)) ??
      rooms.find(
        (room) =>
          anchorKinds.includes(room.kind ?? '') &&
          room.storey <= storey &&
          room.storey + 1 > storey &&
          places.has(room.id),
      ) ??
      rooms.find((room) => room.kind === 'stair' && places.has(room.id))
    const anchorAt = anchor ? (places.get(anchor.id) as StartPlace) : undefined
    const from: Point = anchorAt ? [anchorAt.x, anchorAt.y] : onKerb(street.length / 2, 0)
    const anchorRadius = anchor ? radiusOf(anchor.targetArea) : 0
    const es: Point =
      anchor?.kind === 'entry-foyer' || !anchor
        ? inward
        : waysOf(ground).reduce(
            (best, way) => (runFrom(ground, from, way) > runFrom(ground, from, best) ? way : best),
            inward,
          )
    const et: Point = [-es[1], es[0]]
    const frame: Frame = { origin: from, es, et }
    const lie = Math.atan2(es[1], es[0])
    for (const corridor of corridors) {
      const reach = anchorRadius + CORRIDOR_R + corridorHalf(corridor.targetArea)
      put(corridor, at(frame, reach, 0), lie)
    }

    // The rooms of the storey that stand in the columns, grouped by the links between them.
    const free = here.filter(
      (room) => !kerbOrder.includes(room.kind ?? '') && room.kind !== 'hallway',
    )
    const parent = new Map(free.map((room) => [room.id, room.id]))
    const rootOf = (id: string): string => {
      let root = id
      while ((parent.get(root) ?? root) !== root) root = parent.get(root) as string
      return root
    }
    for (const edge of edges)
      if (parent.has(edge.a) && parent.has(edge.b)) parent.set(rootOf(edge.a), rootOf(edge.b))
    const groups = new Map<string, StartRoom[]>()
    for (const room of free) {
      const root = rootOf(room.id)
      groups.set(root, [...(groups.get(root) ?? []), room])
    }
    const areaOf = (members: readonly StartRoom[]): number =>
      members.reduce((total, room) => total + room.targetArea, 0)
    const tOf = (id: string): number => {
      const place = places.get(id)
      if (!place) return 0
      return (place.x - from[0]) * et[0] + (place.y - from[1]) * et[1]
    }
    const sOf = (id: string): number => {
      const place = places.get(id)
      if (!place) return 0
      return (place.x - from[0]) * es[0] + (place.y - from[1]) * es[1]
    }

    // Each column: which side of the corridor, how wide the floor is on that side, what stands on
    // it already, and where it is up to. A column is as tall as its area over its width, so the
    // two are kept level in height rather than in area.
    type Column = { readonly side: -1 | 1; readonly wide: number; load: number; s: number }
    const sStart = anchor?.kind === 'entry-foyer' ? -anchorRadius : anchorRadius
    const wideOf = (side: number): number =>
      Math.max(1, runFrom(ground, from, [et[0] * side, et[1] * side]) - CORRIDOR_R)
    const columns: [Column, Column] = [
      { side: -1, wide: wideOf(-1), load: 0, s: sStart },
      { side: 1, wide: wideOf(1), load: 0, s: sStart },
    ]
    const columnOf = (side: number): Column => (side < 0 ? columns[0] : columns[1])
    for (const room of onTheKerb) {
      if (room === anchor) continue
      const column = columnOf(tOf(room.id))
      column.load += room.targetArea
      column.s = Math.max(column.s, sOf(room.id) + radiusOf(room.targetArea))
    }
    const heightOf = (column: Column): number => column.load / column.wide
    const lighter = (): Column =>
      heightOf(columns[0]) <= heightOf(columns[1]) ? columns[0] : columns[1]
    const across = (column: Column): Column => (column === columns[0] ? columns[1] : columns[0])
    const bays = onTheKerb.filter((room) => room.kind === 'garage')
    const diwaniya = onTheKerb.find((room) => room.kind === 'diwaniya')
    const entry = here.find((room) => room.kind === 'entry-foyer')
    const isEntryLinked = (members: readonly StartRoom[]): boolean =>
      entry !== undefined && members.some((room) => linked(room.id, entry.id))
    const isFamily = (members: readonly StartRoom[]): boolean =>
      members.some((room) => room.kind === 'family-living')

    // The side each group takes: the room the entry opens onto beside the entry, away from the
    // bays where there are any; the family's rooms across from the diwaniya; and every other
    // group on the lighter side, the largest first, so the two columns come out level.
    const ordered = [...groups.values()].sort((one, other) => {
      const rank = (members: readonly StartRoom[]): number =>
        isEntryLinked(members) ? 0 : isFamily(members) ? 1 : 2
      return rank(one) - rank(other) || areaOf(other) - areaOf(one)
    })
    const sideOf = new Map<string, Column>()
    for (const members of ordered) {
      let column: Column
      if (isEntryLinked(members) && bays.length > 0)
        column = across(columnOf(tOf(bays[0]?.id ?? '')))
      else if (isFamily(members) && diwaniya) column = across(columnOf(tOf(diwaniya.id)))
      else column = lighter()
      column.load += areaOf(members)
      for (const room of members) sideOf.set(room.id, column)
    }

    // Up each column from the street: the group the entry opens onto first, then the groups in
    // the order their rooms receive, and inside a group the room the corridor serves ahead of
    // the rooms reached through it.
    const corridorIds = corridors.map((room) => room.id)
    const servesIt = (room: StartRoom): boolean =>
      corridorIds.some((id) => linked(room.id, id)) ||
      (entry !== undefined && linked(room.id, entry.id))
    const groupRank = (members: readonly StartRoom[]): number =>
      isEntryLinked(members) ? -1 : Math.min(...members.map(depthRank))
    for (const column of columns) {
      const mine = ordered.filter((members) => sideOf.get(members[0]?.id ?? '') === column)
      mine.sort((one, other) => groupRank(one) - groupRank(other))
      for (const members of mine) {
        const inOrder = [...members].sort(
          (one, other) =>
            Number(!servesIt(one)) - Number(!servesIt(other)) || depthRank(one) - depthRank(other),
        )
        for (const room of inOrder) {
          const radius = radiusOf(room.targetArea)
          put(room, at(frame, column.s + radius, column.side * (CORRIDOR_R + radius)))
          column.s += 2 * radius
        }
      }
    }

    // A room the columns did not take, one of a kind the program has no place for, opens at the
    // middle of the floor and the settle finds it one.
    for (const room of here)
      if (!places.has(room.id) && standing.has(room.id)) put(room, ground.inside.middle)
  }

  // A companion rides its owner's perimeter from the first frame, on the side that faces the
  // middle of the floor, so it never opens outside the line its owner stands against.
  for (const room of rooms) {
    const ownerId = owned.get(room.id)
    const owner = ownerId ? places.get(ownerId) : undefined
    const ownerRoom = ownerId ? byId.get(ownerId) : undefined
    if (!owner || !ownerRoom) continue
    const toX = ground.inside.middle[0] - owner.x
    const toY = ground.inside.middle[1] - owner.y
    const run = Math.hypot(toX, toY) || 1
    const reach = radiusOf(ownerRoom.targetArea) + radiusOf(room.targetArea)
    const [x, y] = putInside(
      ground.inside,
      [owner.x + (toX / run) * reach, owner.y + (toY / run) * reach],
      radiusOf(room.targetArea),
    )
    places.set(room.id, { x, y })
  }
  return places
}
