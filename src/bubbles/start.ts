import type { Point } from '../geometry'
import { companionsOf } from '../rulebook'
import { CORRIDOR_R, corridorHalf } from './capsule'
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

/** Where a room opens, in the plot's own metres. */
export type StartPlace = { readonly x: number; readonly y: number }

function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

/** The kinds S8 keeps off the frontage; they open at the back corner away from the diwaniya. */
const serviceKinds: readonly string[] = ['kitchen', 'laundry', 'maid-room', 'storage']

/** The kinds that stand on the kerb at the start, in the order they take the frontage. */
const kerbOrder: readonly string[] = ['diwaniya', 'entry-foyer', 'garage', 'service-entrance']

/** The frame the first arrangement is laid out in: along the frontage, and into the floor from it. */
type Frame = {
  readonly origin: Point
  readonly along: Point
  readonly into: Point
  readonly frontage: number
  readonly depth: number
}

function frameOf(ground: Ground): Frame | null {
  const front = ground.sides.service ?? ground.sides.every[0]
  if (!front) return null
  const run = Math.hypot(front.to[0] - front.from[0], front.to[1] - front.from[1])
  if (run < 1e-9) return null
  const along: Point = [(front.to[0] - front.from[0]) / run, (front.to[1] - front.from[1]) / run]
  let depth = 0
  for (const corner of ground.inside.polygon) {
    const into =
      (corner[0] - front.from[0]) * front.inward[0] + (corner[1] - front.from[1]) * front.inward[1]
    depth = Math.max(depth, into)
  }
  return { origin: front.from, along, into: front.inward, frontage: run, depth }
}

function at(frame: Frame, along: number, into: number): Point {
  return [
    frame.origin[0] + frame.along[0] * along + frame.into[0] * into,
    frame.origin[1] + frame.along[1] * along + frame.into[1] * into,
  ]
}

/**
 * The first arrangement, derived from the program and never from chance: the walled rooms on the
 * kerb in order, the corridor just inside the entry pointing into the plot, the service rooms in
 * the back corner away from the diwaniya, the private rooms across the rest of the back, and
 * everything else in the middle band in the order the program lists it. The same program on the
 * same plot opens the same way every time, so the designer's hand is the only source of variation.
 */
export function canonicalStart(
  rooms: readonly StartRoom[],
  edges: readonly StartEdge[],
  ground: Ground,
): ReadonlyMap<string, StartPlace> {
  const places = new Map<string, StartPlace>()
  const frame = frameOf(ground)
  if (!frame) return places
  const owned = new Map<string, string>()
  const withTypes = rooms.map((room) => ({ id: room.id, type: room.kind ?? '' }))
  for (const room of rooms)
    for (const companion of companionsOf(withTypes, edges, room.id)) owned.set(companion, room.id)

  const put = (room: StartRoom, along: number, into: number): void => {
    const radius = room.kind === 'hallway' ? CORRIDOR_R : radiusOf(room.targetArea)
    const [x, y] = putInside(ground.inside, at(frame, along, into), radius)
    places.set(room.id, { x, y })
  }

  /**
   * A row of rooms laid edge to edge along the frontage from one end of the run it is given, and
   * carried onto another row further into the floor when the frontage runs out. The wrap is what
   * keeps a long band from laying every room on one line, where a room pressed between two others
   * has no way out but along that line.
   */
  const row = (line: readonly StartRoom[], from: number, on: number, deeper: number): number => {
    let along = from
    let band = on
    let tallest = 0
    for (const room of line) {
      const radius = radiusOf(room.targetArea)
      if (along + 2 * radius > frame.frontage && along > from) {
        along = from
        band += deeper * (tallest || 2 * radius)
        tallest = 0
      }
      tallest = Math.max(tallest, 2 * radius)
      along += radius
      // Each room stands on the band's line rather than astride it, so a row of rooms of several
      // sizes is not a straight line of centres, which nothing could ever be squeezed out of.
      put(room, along, band + deeper * radius)
      along += radius
    }
    return along
  }

  const storeys = [...new Set(rooms.map((room) => room.storey))].sort((one, other) => one - other)
  for (const storey of storeys) {
    const here = rooms.filter((room) => room.storey === storey && !owned.has(room.id))
    const kerb = here.filter((room) => kerbOrder.includes(room.kind ?? ''))
    const corridors = here.filter((room) => room.kind === 'hallway')
    const service = here.filter((room) => serviceKinds.includes(room.kind ?? ''))
    const taken = new Set([...kerb, ...corridors, ...service].map((room) => room.id))
    const privateRooms = here.filter((room) => room.tier === 'private' && !taken.has(room.id))
    for (const room of privateRooms) taken.add(room.id)
    const middle = here.filter((room) => !taken.has(room.id))

    // The kerb, from the diwaniya's side: the diwaniya, then the entry at the middle of the
    // frontage, then the garage bays side by side against the far side boundary.
    const byKerb = [...kerb].sort(
      (one, other) => kerbOrder.indexOf(one.kind ?? '') - kerbOrder.indexOf(other.kind ?? ''),
    )
    let front = 0
    for (const room of byKerb) {
      const radius = radiusOf(room.targetArea)
      if (room.kind === 'entry-foyer') {
        put(room, Math.max(front + radius, frame.frontage / 2), radius)
        front = Math.max(front + 2 * radius, frame.frontage / 2 + radius)
        continue
      }
      if (room.kind === 'garage' || room.kind === 'service-entrance') continue
      front = row([room], front, 0, 1)
    }
    const bays = byKerb.filter((room) => room.kind === 'garage' || room.kind === 'service-entrance')
    let far = frame.frontage
    for (const room of [...bays].reverse()) {
      const radius = radiusOf(room.targetArea)
      far -= radius
      put(room, far, radius)
      far -= radius
    }

    // The back, from the far corner: the service rooms away from the diwaniya first, then the
    // private rooms across what is left of it.
    let back = frame.frontage
    for (const room of [...service].reverse()) {
      const radius = radiusOf(room.targetArea)
      back -= radius
      put(room, back, frame.depth - radius)
      back -= radius
    }
    row(privateRooms, 0, frame.depth, -1)

    const band = frame.depth / 2
    const across = middle.reduce((total, room) => total + 2 * radiusOf(room.targetArea), 0)
    row(middle, Math.max(0, (frame.frontage - across) / 2), band, 1)

    // The corridor starts on the room it belongs to and points into the floor: the entry on the
    // ground, the stair on a floor the front door does not reach.
    for (const corridor of corridors) {
      const anchor =
        here.find((room) => room.kind === 'entry-foyer') ??
        here.find((room) => room.kind === 'stair')
      const half = corridorHalf(corridor.targetArea)
      const from = anchor ? places.get(anchor.id) : undefined
      const reach = (anchor ? radiusOf(anchor.targetArea) : 0) + CORRIDOR_R + half
      const start = from ?? {
        x: at(frame, frame.frontage / 2, 0)[0],
        y: at(frame, frame.frontage / 2, 0)[1],
      }
      const [x, y] = putInside(
        ground.inside,
        [start.x + frame.into[0] * reach, start.y + frame.into[1] * reach],
        CORRIDOR_R,
      )
      places.set(corridor.id, { x, y })
    }
  }

  // A companion rides its owner's perimeter from the first frame, on the side that faces the
  // middle of the floor, so it never opens outside the line its owner stands against.
  for (const room of rooms) {
    const ownerId = owned.get(room.id)
    const owner = ownerId ? places.get(ownerId) : undefined
    const ownerRoom = rooms.find((each) => each.id === ownerId)
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
