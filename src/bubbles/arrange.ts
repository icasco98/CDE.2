/**
 * Where the bubble diagram draws each room: one column per storey, side by side, and inside a
 * column one band per privacy tier, public at the bottom, semi-public in the middle, private at the
 * top. It is computed from the program alone, so the same program always draws the same diagram;
 * a room's nudge moves it from here and means nothing else.
 */

import { EXTERIOR, type Bubble, type Endpoint } from '../model'
import { uncross } from './order'
import { radiusFor, scaleFor } from './sizes'

type Tier = 'public' | 'semi-public' | 'private'

/** A room as the arrangement reads one; `tier` is the room-type table's, `exempt` or absent included. */
export type ArrangeRoom = {
  readonly id: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly tier?: string
  readonly bubble?: Bubble
}

export type ArrangeEdge = { readonly a: Endpoint; readonly b: Endpoint; readonly storey: number }

/** One room drawn in one storey's column; a stair has one in every column it spans. */
export type Spot = {
  readonly id: string
  readonly storey: number
  readonly x: number
  readonly y: number
  readonly r: number
}

type Column = { readonly storey: number; readonly x: number; readonly width: number }

/** A tier's rows across every column; `line` is one row's depth, set by the band's largest circle. */
type Band = {
  readonly tier: Tier
  readonly y: number
  readonly height: number
  readonly line: number
  readonly radius: number
}

export type Arrangement = {
  readonly spots: readonly Spot[]
  readonly columns: readonly Column[]
  readonly bands: readonly Band[]
  /** Where the outside is drawn under each column that has a door to it, the ground always. */
  readonly outside: readonly Spot[]
  readonly width: number
  readonly height: number
  /** Radius per square root of a square metre, the same for every circle. */
  readonly scale: number
}

/** A room's cell in a band: wide enough for the largest circle and its name under it. */
const CELL = 120
/** The least depth of a row, and the room above a row's circles and below them for the names. */
const LINE = 110
const ABOVE = 12
const BELOW = 60
/** Half the height of the outside's box under the columns. */
const OUTSIDE = 18
/** The gap between two columns, and the margin round the whole diagram. */
const GAP = 60
/** At most this many rooms to a line; a busier band wraps onto another line. */
const PER_LINE = 4

/** Top to bottom: the private rooms furthest from the street, the public ones nearest it. */
const tiersDown: readonly Tier[] = ['private', 'semi-public', 'public']

const isTier = (tier: string | undefined): tier is Tier =>
  tier === 'public' || tier === 'semi-public' || tier === 'private'

function standsOn(room: ArrangeRoom, storey: number): boolean {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return storey >= room.storey && storey < room.storey + span
}

type Placed = { readonly room: ArrangeRoom; readonly tier: Tier }

/**
 * One storey's rooms in their bands. A room of no tier of its own (a WC, a store) takes the band of
 * the first room it is joined to there and stands right after it, so a companion sits by its owner.
 */
function bandsOf(
  rooms: readonly ArrangeRoom[],
  edges: readonly ArrangeEdge[],
  storey: number,
): ReadonlyMap<Tier, readonly ArrangeRoom[]> {
  const here = rooms.filter((room) => standsOn(room, storey))
  const byId = new Map(here.map((room) => [room.id, room]))
  const rows = new Map<Tier, ArrangeRoom[]>(tiersDown.map((tier) => [tier, []]))
  const placed = new Map<string, Placed>()
  for (const room of here)
    if (isTier(room.tier)) {
      rows.get(room.tier)!.push(room)
      placed.set(room.id, { room, tier: room.tier })
    }
  for (const room of here) {
    if (placed.has(room.id)) continue
    const anchor = edges
      .filter((edge) => edge.storey === storey && (edge.a === room.id || edge.b === room.id))
      .map((edge) => placed.get(edge.a === room.id ? edge.b : edge.a))
      .find((each) => each !== undefined && byId.has(each.room.id))
    const tier = anchor?.tier ?? 'semi-public'
    const row = rows.get(tier)!
    const after = anchor ? row.lastIndexOf(anchor.room) : -1
    // Behind the owner and any companion already standing behind it.
    let at = after < 0 ? row.length : after + 1
    while (at < row.length && !isTier(row[at]!.tier)) at += 1
    row.splice(at, 0, room)
    placed.set(room.id, { room, tier })
  }
  for (const row of rows.values())
    row.sort((one, other) => sideOf(one, storey) - sideOf(other, storey))
  return rows
}

/**
 * A room that goes on up stands at the right of its row and one that comes from below at the left,
 * so the tie between a stair's circles in two columns side by side stays short.
 */
const sideOf = (room: ArrangeRoom, storey: number): number =>
  room.storey < storey ? -1 : standsOn(room, storey + 1) ? 1 : 0

const linesFor = (count: number): number => Math.max(1, Math.ceil(count / PER_LINE))

/** How far across from its column's middle the room at `index` of a row of `count` stands. */
function acrossOf(index: number, count: number): number {
  const line = Math.floor(index / PER_LINE)
  const onLine = Math.min(PER_LINE, count - line * PER_LINE)
  return ((index % PER_LINE) + 0.5 - onLine / 2) * CELL
}

/**
 * The height of the circles' centres on a band's line. The first line of a band is its lowest, so a
 * band fills upward from the street; the circles of a line share their centre, and the names hang
 * below.
 */
function downOf(band: Band, index: number): number {
  const line = Math.floor(index / PER_LINE)
  return band.y + band.height - (line + 1) * band.line + ABOVE + band.radius
}

export function arrange(
  rooms: readonly ArrangeRoom[],
  edges: readonly ArrangeEdge[],
  storeys: number,
): Arrangement {
  const levels = Math.max(1, Math.trunc(storeys))
  const inBands = Array.from({ length: levels }, (_, storey) => bandsOf(rooms, edges, storey))
  const scale = scaleFor(rooms.map((room) => room.targetArea))
  // A band is as deep on every column as on its busiest, so a tier reads across the whole diagram.
  const bands: Band[] = []
  let y = GAP
  for (const tier of tiersDown) {
    const lines = Math.max(...inBands.map((rows) => linesFor(rows.get(tier)!.length)))
    const radius = Math.max(
      0,
      ...inBands.flatMap((rows) =>
        rows.get(tier)!.map((room) => radiusFor(room.targetArea, scale)),
      ),
    )
    const line = Math.max(LINE, ABOVE + 2 * radius + BELOW)
    bands.push({ tier, y, height: lines * line, line, radius })
    y += lines * line
  }
  const outsideY = y + LINE / 2
  const height = y + LINE + GAP / 2
  const byTier = new Map(bands.map((band) => [band.tier, band]))
  // Bands depend on how many rooms a row holds and how big they are, never on their order, so the
  // order is chosen against the places the rooms will really have.
  const perStorey = inBands.map((rows, storey) =>
    uncross(
      rows,
      edges.filter((edge) => edge.storey === storey).map((edge) => [edge.a, edge.b] as const),
      (tier, index, count) => ({ x: acrossOf(index, count), y: downOf(byTier.get(tier)!, index) }),
      new Map([[EXTERIOR, { x: 0, y: outsideY }]]),
      (room) => sideOf(room, storey),
    ),
  )
  const spots: Spot[] = []
  const columns: Column[] = []
  const outside: Spot[] = []
  let x = GAP
  for (const [storey, rows] of perStorey.entries()) {
    const widest = Math.max(
      2,
      ...tiersDown.map((tier) => Math.min(PER_LINE, rows.get(tier)!.length)),
    )
    const width = widest * CELL
    columns.push({ storey, x, width })
    for (const band of bands) {
      const row = rows.get(band.tier)!
      for (const [index, room] of row.entries()) {
        spots.push({
          id: room.id,
          storey,
          x: x + width / 2 + acrossOf(index, row.length) + (room.bubble?.x ?? 0),
          y: downOf(band, index) + (room.bubble?.y ?? 0),
          r: radiusFor(room.targetArea, scale),
        })
      }
    }
    const outdoors = edges.some(
      (edge) => edge.storey === storey && (edge.a === EXTERIOR || edge.b === EXTERIOR),
    )
    if (storey === 0 || outdoors)
      outside.push({ id: EXTERIOR, storey, x: x + width / 2, y: outsideY, r: OUTSIDE })
    x += width + GAP
  }
  return { spots, columns, bands, outside, width: x, height, scale }
}
