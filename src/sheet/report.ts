/**
 * The report: everything the sentence under the sheet prints and the agent reads, as plain data.
 * Nothing here renders, and nothing here is a sentence except a refusal in the mock's own words.
 */

import { SIDES, type PlotSpec, type Side } from './plot'
import {
  allPlaced,
  ghostsOf,
  isCourt,
  isOpen,
  placedRooms,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  acrossStoreys,
  type Room,
  type Sheet,
} from './model'
import { areaOf, polyArea, r2, worldWalls, type Seg } from './geometry'
import { allowedBox, outsideBuildable, overlapsOf } from './settle'
import { pocketsOf } from './pockets'
import { walkTest, type Walk } from './doors'

const onLine = (v: number, at: number) => Math.abs(v - at) < 0.02

/** A room's walls that lie on the plot boundary, each with the side it is on. */
export function boundaryWalls(r: Room, plot: PlotSpec): (Seg & { side: Side })[] {
  const out: (Seg & { side: Side })[] = []
  for (const w of worldWalls(r)) {
    const side: Side | null =
      onLine(w.a[0], 0) && onLine(w.b[0], 0)
        ? 'west'
        : onLine(w.a[0], plot.w) && onLine(w.b[0], plot.w)
          ? 'east'
          : onLine(w.a[1], 0) && onLine(w.b[1], 0)
            ? 'north'
            : onLine(w.a[1], plot.h) && onLine(w.b[1], plot.h)
              ? 'street'
              : null
    if (side) out.push({ ...w, side })
  }
  return out
}

/** How much of a side is built to the boundary: the walls' runs, overlaps counted once. */
export function sideUsed(sheet: Sheet, side: Side): number {
  const runs: [number, number][] = []
  const k = side === 'west' || side === 'east' ? 1 : 0 // the coordinate that runs along that side
  for (const r of allPlaced(sheet))
    if (storeyOf(r) === 0 && !r.fixed && !isOpen(r))
      for (const w of boundaryWalls(r, sheet.plot))
        if (w.side === side) runs.push([Math.min(w.a[k], w.b[k]), Math.max(w.a[k], w.b[k])])
  runs.sort((p, q) => p[0] - q[0])
  let used = 0
  let end = -Infinity
  for (const [a, b] of runs) {
    const from = Math.max(a, end)
    if (b > from) used += b - from
    end = Math.max(end, b)
  }
  return used
}

export const sideOver = (sheet: Sheet, side: Side) =>
  sideUsed(sheet, side) > sheet.plot.budget[side] + 1e-6

export type BoundaryRead = {
  side: Side
  name: string
  used: number
  budget: number
  over: boolean
  overBy: number
  read: boolean
}

export type Report = {
  storey: number
  storeyName: string
  placedArea: number
  askedArea: number
  buildableArea: number
  floors: number[]
  total: number
  allowed: number
  overRatio: boolean
  ratioRead: boolean
  openToBelow: string[]
  overlaps: { a: string; b: string; area: number }[]
  spills: string[]
  /** Rooms on the sheet the brief does not name, kept aside rather than thrown away. */
  aside: string[]
  boundary: BoundaryRead[]
  shortfalls: { name: string; area: number; target: number }[]
  courts: { name: string; area: number }[]
  pockets: { count: number; area: number }
  walk: {
    reached: number
    all: number
    unreached: string[]
    from: 'outside' | 'the stair'
    hallways: { name: string; doors: number }[]
    entryWithoutOutsideDoor: string | null
    diwaniyaWithoutStreetDoor: string | null
    cannotOpen: string[]
  } | null
}

/**
 * The storey's report. Enclosed spaces are counted only where the settings show them, as the
 * sentence does, so reading the sheet never pays for the pocket pass unasked.
 */
export function report(sheet: Sheet, storey: number): Report {
  const { settings } = sheet
  const onStorey = placedRooms(sheet, storey)
  const p = onStorey.filter((r) => !r.fixed && !isOpen(r))
  const courts = onStorey.filter((r) => r.fixed)
  const placedArea = p.reduce((s, r) => s + areaOf(r), 0)
  const askedArea = sheet.rooms
    .filter((r) => !r.extra && !isOpen(r))
    .reduce((s, r) => s + r.target, 0)
  const box = allowedBox(sheet, storey)
  const ov = overlapsOf(sheet, storey)
  const n = storeyCountOf(sheet)
  const floors = Array.from({ length: n }, (_unused, k) =>
    allPlaced(sheet)
      .filter(
        (r) =>
          !r.fixed &&
          !isOpen(r) &&
          (storeyOf(r) === k ||
            (k > 0 &&
              acrossStoreys(r, settings) &&
              allPlaced(sheet).some((o) => storeyOf(o) === k))),
      )
      .reduce((s, r) => s + areaOf(r), 0),
  )
  const total = floors.reduce((a, b) => a + b, 0)
  const walk = walkTest(sheet, storey)
  const pockets = settings.showPockets ? pocketsOf(sheet, storey) : []
  return {
    storey,
    storeyName: storeyNameOf(storey),
    placedArea: r2(placedArea),
    askedArea: r2(askedArea),
    buildableArea: sheet.plot.buildable,
    floors: floors.map(r2),
    total: r2(total),
    allowed: sheet.plot.allowed,
    overRatio: total > sheet.plot.allowed + 1e-6,
    ratioRead: !!settings.ratioWarn,
    openToBelow: ghostsOf(sheet, storey).map((r) => (isCourt(r) ? 'the court' : r.name)),
    overlaps: ov.map((o) => ({
      a: o.a.name,
      b: o.b.name,
      area: r2(o.polys.reduce((s, poly) => s + polyArea(poly), 0)),
    })),
    spills: p.filter((r) => outsideBuildable(r, box)).map((r) => r.name),
    aside: sheet.rooms.filter((r) => r.aside).map((r) => r.name),
    boundary: SIDES.map((side): BoundaryRead => {
      const used = sideUsed(sheet, side)
      const budget = sheet.plot.budget[side]
      return {
        side,
        name: sheet.plot.name[side],
        used: r2(used),
        budget,
        over: used > budget + 1e-6,
        overBy: r2(Math.max(0, used - budget)),
        read: used > 0 || (settings.boundary === 'all' && side === 'street'),
      }
    }),
    shortfalls: p
      .filter((r) => areaOf(r) < r.target - 0.05)
      .map((r) => ({ name: r.name, area: r2(areaOf(r)), target: r.target })),
    courts: courts.map((c) => ({ name: c.name, area: r2(areaOf(c)) })),
    pockets: { count: pockets.length, area: r2(pockets.reduce((s, k) => s + k.area, 0)) },
    walk: walk ? walkRead(walk, p, storey) : null,
  }
}

function walkRead(walk: Walk, p: Room[], storey: number): NonNullable<Report['walk']> {
  const entry = p.find((r) => r.kind === 'entry-foyer')
  const diw = p.find((r) => r.kind === 'diwaniya')
  return {
    reached: walk.reached.length,
    all: walk.reached.length + walk.unreached.length,
    unreached: walk.unreached.map((r) => r.name),
    from: storey > 0 ? 'the stair' : 'outside',
    hallways: p
      .filter((r) => r.kind === 'hallway')
      .map((h) => ({ name: h.name, doors: walk.count.get(h.id) ?? 0 })),
    entryWithoutOutsideDoor: entry && !walk.outside.has(entry.id) ? entry.name : null,
    diwaniyaWithoutStreetDoor: diw && !walk.street.has(diw.id) ? diw.name : null,
    cannotOpen: [...new Set(walk.blocked.map((r) => r.name))],
  }
}
