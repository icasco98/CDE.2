/**
 * Where the bubble diagram draws each room: one column per storey, side by side, and inside a
 * column one band per privacy tier, public at the bottom, semi-public in the middle, private at the
 * top. It is computed from the program alone, so the same program always draws the same diagram;
 * a room's nudge moves it from here and means nothing else.
 */

import { EXTERIOR, type Bubble, type Endpoint } from '../model'

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

type Band = { readonly tier: Tier; readonly y: number; readonly height: number }

export type Arrangement = {
  readonly spots: readonly Spot[]
  readonly columns: readonly Column[]
  readonly bands: readonly Band[]
  /** Where the outside is drawn under each column that has a door to it, the ground always. */
  readonly outside: readonly Spot[]
  readonly width: number
  readonly height: number
}

/** A room's cell in a band: wide enough for the largest circle and its name under it. */
const CELL = 120
const LINE = 110
/** The gap between two columns, and the margin round the whole diagram. */
const GAP = 60
/** At most this many rooms to a line; a busier band wraps onto another line. */
const PER_LINE = 4

/** Top to bottom: the private rooms furthest from the street, the public ones nearest it. */
const tiersDown: readonly Tier[] = ['private', 'semi-public', 'public']

const isTier = (tier: string | undefined): tier is Tier =>
  tier === 'public' || tier === 'semi-public' || tier === 'private'

/** The circle hints at the area and no more: it grows with the square root and is held to a band. */
export function radiusFor(targetArea: number): number {
  return Math.min(40, Math.max(18, 12 + Math.sqrt(Math.max(0, targetArea)) * 2.6))
}

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
  return rows
}

const linesFor = (count: number): number => Math.max(1, Math.ceil(count / PER_LINE))

export function arrange(
  rooms: readonly ArrangeRoom[],
  edges: readonly ArrangeEdge[],
  storeys: number,
): Arrangement {
  const levels = Math.max(1, Math.trunc(storeys))
  const perStorey = Array.from({ length: levels }, (_, storey) => bandsOf(rooms, edges, storey))
  // A band is as deep on every column as on its busiest, so a tier reads across the whole diagram.
  const bands: Band[] = []
  let y = GAP
  for (const tier of tiersDown) {
    const lines = Math.max(...perStorey.map((rows) => linesFor(rows.get(tier)!.length)))
    bands.push({ tier, y, height: lines * LINE })
    y += lines * LINE
  }
  const outsideY = y + LINE / 2
  const height = y + LINE + GAP / 2
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
        const line = Math.floor(index / PER_LINE)
        const onLine = Math.min(PER_LINE, row.length - line * PER_LINE)
        const across = x + (width - onLine * CELL) / 2 + ((index % PER_LINE) + 0.5) * CELL
        // The first line of a band is its lowest, so a band fills upward from the street.
        const down = band.y + band.height - (line + 0.5) * LINE
        spots.push({
          id: room.id,
          storey,
          x: across + (room.bubble?.x ?? 0),
          y: down + (room.bubble?.y ?? 0),
          r: radiusFor(room.targetArea),
        })
      }
    }
    const outdoors = edges.some(
      (edge) => edge.storey === storey && (edge.a === EXTERIOR || edge.b === EXTERIOR),
    )
    if (storey === 0 || outdoors)
      outside.push({ id: EXTERIOR, storey, x: x + width / 2, y: outsideY, r: 18 })
    x += width + GAP
  }
  return { spots, columns, bands, outside, width: x, height }
}
