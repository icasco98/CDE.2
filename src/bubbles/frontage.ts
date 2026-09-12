import type { Point } from '../geometry'
import { kerbFor, type PlotSide } from '../rulebook'
import type { Ground } from './ground'

/*
 * Decision 20 as the owner settled it: frontage is claimed in the order of who needs a street
 * door. The diwaniya first, its full diameter, at the corner where S4 says so and at the end it
 * stands nearest otherwise; then the entry, in the middle of what is left, or beside the diwaniya
 * where the frontage is short; then the women's reception where the household has one; and the
 * garage bays last, with what remains, backed on to the side boundary away from the diwaniya.
 *
 * A claim is a stretch of the line, not a point: a walled room stands on the kerb inside its own
 * stretch and slides nowhere else. A bay with no frontage left does not lose its place, it stands
 * in tandem behind the bay in front of it, which is the Kuwaiti answer on a narrow plot; a one-bay
 * garage is the client's answer on the program and not the tool's to make for them.
 */

/** A room as the frontage rule reads one: its kind, its floor, its size, and where it stands now. */
export type FrontageRoom = {
  readonly id: string
  readonly kind?: string
  readonly storey: number
  readonly targetArea: number
  readonly at?: { readonly x: number; readonly y: number }
}

/** A room's claim: where along the frontage it begins and ends, in metres from the side's start. */
export type Stretch = { readonly from: number; readonly to: number }

export type Frontage = {
  /** What each room claimed of the service street's line; a room with no claim wants no door on it. */
  readonly claims: ReadonlyMap<string, Stretch>
  /** A bay the frontage would not hold, and the bay it stands behind. */
  readonly behind: ReadonlyMap<string, string>
}

const nothing: Frontage = { claims: new Map(), behind: new Map() }

function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

function widthOf(room: FrontageRoom): number {
  return 2 * radiusOf(room.targetArea)
}

/** How far along a side a point falls, in metres from its start; nought before it, its run after. */
function alongSide(side: PlotSide, x: number, y: number): number {
  const dx = side.to[0] - side.from[0]
  const dy = side.to[1] - side.from[1]
  const run = Math.hypot(dx, dy)
  if (run < 1e-9) return 0
  const at = ((x - side.from[0]) * dx + (y - side.from[1]) * dy) / run
  return Math.min(run, Math.max(0, at))
}

/**
 * Which end of the frontage the diwaniya takes. S4 first, where the client has said the diwaniya
 * addresses the corner and the plot has one; then the end it already stands nearest, so a diwaniya
 * the designer has moved keeps the side they moved it to; and the start of the side otherwise.
 */
function diwaniyaAtStart(room: FrontageRoom, ground: Ground, side: PlotSide, run: number): boolean {
  const corner = ground.sides.corner
  if (ground.site.diwaniyaAtCorner && corner)
    return alongSide(side, corner[0], corner[1]) <= run / 2
  if (!room.at) return true
  return alongSide(side, room.at.x, room.at.y) <= run / 2
}

/**
 * Every claim on the service street's frontage, storey by storey. The order is the owner's; the
 * arithmetic is only where each claim's stretch begins and ends along the one line.
 */
export function frontageOf(rooms: readonly FrontageRoom[], ground: Ground): Frontage {
  const side = ground.sides.service
  if (!side) return nothing
  const run = Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1])
  if (run < 1e-9) return nothing
  const claims = new Map<string, Stretch>()
  const behind = new Map<string, string>()
  const onThisSide = (kind: string): boolean => kerbFor(kind, ground.sides) === side

  for (const storey of [...new Set(rooms.map((room) => room.storey))]) {
    const here = rooms.filter((room) => room.storey === storey)
    const firstOf = (kind: string): FrontageRoom | undefined =>
      here.find((room) => room.kind === kind)
    const diwaniya = firstOf('diwaniya')
    const entry = onThisSide('entry-foyer') ? firstOf('entry-foyer') : undefined
    const reception = firstOf('womens-reception')
    const bays = here.filter(
      (room) =>
        (room.kind === 'garage' || room.kind === 'service-entrance') && onThisSide(room.kind ?? ''),
    )

    let lo = 0
    let hi = run
    const atStart = diwaniya ? diwaniyaAtStart(diwaniya, ground, side, run) : true
    if (diwaniya) {
      const width = Math.min(widthOf(diwaniya), run)
      claims.set(diwaniya.id, atStart ? { from: 0, to: width } : { from: run - width, to: run })
      if (atStart) lo = width
      else hi = run - width
    }

    // The bays back on to the boundary away from the diwaniya, and only as many of them as the
    // frontage holds once the entry and the women's reception have what they need.
    const needed = (entry ? widthOf(entry) : 0) + (reception ? widthOf(reception) : 0)
    const bay = bays[0] ? widthOf(bays[0]) : 0
    const room = Math.max(0, hi - lo)
    const fit = bay > 1e-9 ? Math.min(bays.length, Math.floor(Math.max(0, room - needed) / bay)) : 0
    let edge = atStart ? hi : lo
    let front: FrontageRoom | undefined
    for (const [index, each] of bays.entries()) {
      if (index >= fit) {
        if (front) behind.set(each.id, front.id)
        continue
      }
      const width = widthOf(each)
      claims.set(
        each.id,
        atStart ? { from: edge - width, to: edge } : { from: edge, to: edge + width },
      )
      edge = atStart ? edge - width : edge + width
      front = each
    }
    if (atStart) hi = edge
    else lo = edge

    // The women's reception takes its own width on the bays' side of what is left, and the entry
    // has the rest of it to stand in: the middle of the frontage on a plot with room to spare, and
    // beside the diwaniya on one without, which is what a stretch narrower than the room comes to.
    if (reception) {
      const width = widthOf(reception)
      claims.set(
        reception.id,
        atStart
          ? { from: Math.max(lo, hi - width), to: hi }
          : { from: lo, to: Math.min(hi, lo + width) },
      )
      if (atStart) hi = Math.max(lo, hi - width)
      else lo = Math.min(hi, lo + width)
    }
    if (entry) claims.set(entry.id, { from: lo, to: hi })
  }
  return { claims, behind }
}

/**
 * The kerb line a room stands on: its own boundary moved in by its radius, and cut to the stretch
 * the frontage rule gave it, so the room slides along its claim and never out of it. A stretch
 * narrower than the room itself leaves one place to stand, which is the middle of it.
 */
export function kerbWithin(
  side: PlotSide,
  radius: number,
  claim: Stretch | undefined,
): readonly [Point, Point] {
  const dx = side.to[0] - side.from[0]
  const dy = side.to[1] - side.from[1]
  const run = Math.hypot(dx, dy)
  const along: Point = run < 1e-9 ? [0, 0] : [dx / run, dy / run]
  const put = (at: number): Point => [
    side.from[0] + side.inward[0] * radius + along[0] * at,
    side.from[1] + side.inward[1] * radius + along[1] * at,
  ]
  if (!claim) return [put(0), put(run)]
  const low = claim.from + radius
  const high = claim.to - radius
  if (low <= high) return [put(low), put(high)]
  const middle = (claim.from + claim.to) / 2
  return [put(middle), put(middle)]
}

/** The middle of a claim, which is where the first arrangement stands the room that made it. */
export function middleOf(claim: Stretch): number {
  return (claim.from + claim.to) / 2
}
