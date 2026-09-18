/**
 * The Openings step's reading of the sheet: the door under the hand, the doors that lost their wall,
 * what a door is drawn as, and what the sentence says about the one in hand. Nothing here renders
 * and nothing here changes the sheet; the actions do that.
 */

import {
  doorsOf,
  placedRooms,
  type Door,
  type Point,
  type Poly,
  type Room,
  type Sheet,
} from './model'
import { toWorld } from './geometry'
import { DOOR, hasHinge, hasSwing, isStreetDoor } from './sample'
import { doorAcross, doorBlocked, doorPlace, type Place } from './doors'

/** Which door a click means: the room it belongs to and its id. */
export type DoorRef = { room: string; id: string }

/** Every door that has lost its wall, so the sentence can count them and the sheet ring them. */
export function lostDoors(sheet: Sheet, storey: number): { room: Room; door: Door }[] {
  const out: { room: Room; door: Door }[] = []
  for (const r of placedRooms(sheet, storey))
    for (const d of doorsOf(r)) if (!doorPlace(r, d)) out.push({ room: r, door: d })
  return out
}

/**
 * The placed door nearest a point, if the point is within reach of its opening. A door that lost its
 * wall answers for the ring drawn where it was left.
 */
export function doorNear(
  sheet: Sheet,
  storey: number,
  x: number,
  y: number,
  reach: number,
): (DoorRef & { dist: number }) | null {
  let best: (DoorRef & { dist: number }) | null = null
  const nearer = (room: string, id: string, dist: number) => {
    if (dist <= reach && (!best || dist < best.dist)) best = { room, id, dist }
  }
  for (const r of placedRooms(sheet, storey))
    for (const d of doorsOf(r)) {
      const pl = doorPlace(r, d)
      if (!pl) {
        const wp = toWorld(r, d.at[0], d.at[1])
        nearer(r.id, d.id, Math.hypot(x - wp[0], y - wp[1]))
        continue
      }
      const a = toWorld(r, pl.p[0] - pl.u[0] * (d.w / 2), pl.p[1] - pl.u[1] * (d.w / 2))
      const b = toWorld(r, pl.p[0] + pl.u[0] * (d.w / 2), pl.p[1] + pl.u[1] * (d.w / 2))
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
      const t = Math.min(Math.max((x - a[0]) * u[0]! + (y - a[1]) * u[1]!, 0), L)
      const q = [a[0] + u[0]! * t, a[1] + u[1]! * t]
      nearer(r.id, d.id, Math.hypot(x - q[0]!, y - q[1]!))
    }
  return best
}

/** The doors on the second sheet that the first has not got: what a placement just added. */
export function newDoors(before: Sheet, after: Sheet): DoorRef[] {
  const had = new Set(before.rooms.flatMap((r) => doorsOf(r).map((d) => d.id)))
  return after.rooms.flatMap((r) =>
    doorsOf(r)
      .filter((d) => !had.has(d.id))
      .map((d) => ({ room: r.id, id: d.id })),
  )
}

/** The leaf of a swinging door: the panel from its hinge and the arc it sweeps. */
export type Leaf = { from: Point; to: Point; arc: { to: Point; radius: number; sweep: 0 | 1 } }

/** Everything a door is drawn from, in its room's frame. */
export type DoorDrawing = {
  gap: [Point, Point]
  leaves: Leaf[]
  panels: [Point, Point][]
  jambs: [Point, Point][]
  openMark: [Point, Point] | null
  streetMark: Poly | null
  /** The panels' sweeps as polygons, which is what a click on a door lands on. */
  hits: Poly[]
  blocked: boolean
}

const sweepOf = (h: Point, e: Point, f: Point): 0 | 1 =>
  (e[0] - h[0]) * (f[1] - h[1]) - (e[1] - h[1]) * (f[0] - h[0]) > 0 ? 1 : 0

/**
 * A door on its wall: the wall opened, the leaf and its swing, the panels of a sliding door, the
 * jambs of an opening and the mark of a street door. The room across the wall is looked up only for
 * a leaf that swings that way, which is the only one it can be in the way of.
 */
export function doorDrawing(
  r: Room,
  d: Door,
  pl: Place,
  sheet: Sheet,
  storey: number,
): DoorDrawing {
  const across = d.flip && hasSwing(d) ? doorAcross(r, pl, sheet, storey) : null
  const [px, py] = pl.p
  const [ux, uy] = pl.u
  const [nx, ny] = pl.n
  const half = d.w / 2
  const a: Point = [px - ux * half, py - uy * half]
  const b: Point = [px + ux * half, py + uy * half]
  const inward = d.flip ? 1 : -1
  const leaves: Leaf[] = []
  const hits: Poly[] = []
  const panels: [Point, Point][] = []
  const jambs: [Point, Point][] = []
  const leaf = (h: Point, len: number, dir: number) => {
    const e: Point = [h[0] + nx * inward * len, h[1] + ny * inward * len]
    const f: Point = [h[0] + ux * dir * len, h[1] + uy * dir * len]
    leaves.push({ from: h, to: e, arc: { to: f, radius: len, sweep: sweepOf(h, e, f) } })
    hits.push([h, e, [e[0] + f[0] - h[0], e[1] + f[1] - h[1]], f])
  }
  if (d.type === 'door' || d.type === 'street') leaf(d.hinge ? b : a, d.w, d.hinge ? -1 : 1)
  if (d.type === 'double' || d.type === 'street2') {
    leaf(a, half, 1)
    leaf(b, half, -1)
  }
  if (d.type === 'sliding') {
    // two panels, one slid behind the other, no swing
    const o1 = [nx * 0.07, ny * 0.07]
    const o2 = [-nx * 0.07, -ny * 0.07]
    panels.push([
      [a[0] + o1[0]!, a[1] + o1[1]!],
      [px + ux * 0.1 + o1[0]!, py + uy * 0.1 + o1[1]!],
    ])
    panels.push([
      [px - ux * 0.1 + o2[0]!, py - uy * 0.1 + o2[1]!],
      [b[0] + o2[0]!, b[1] + o2[1]!],
    ])
  }
  if (d.type === 'sliding' || d.type === 'opening')
    for (const pt of [a, b])
      jambs.push([
        [pt[0] + nx * 0.14, pt[1] + ny * 0.14],
        [pt[0] - nx * 0.14, pt[1] - ny * 0.14],
      ])
  const streetMark: Poly | null = isStreetDoor(d)
    ? (() => {
        const o = [px + nx * 0.45, py + ny * 0.45]
        return [
          [o[0]! - ux * 0.22, o[1]! - uy * 0.22],
          [o[0]! + ux * 0.22, o[1]! + uy * 0.22],
          [px + nx * 0.15, py + ny * 0.15],
        ] as Poly
      })()
    : null
  return {
    gap: [a, b],
    leaves,
    panels,
    jambs,
    openMark: d.type === 'open' ? [a, b] : null,
    streetMark,
    hits: [[a, b], ...hits],
    blocked: doorBlocked(r, d, pl, across),
  }
}

/** What the sentence says about the door in hand: its wall, its neighbour, and which way it opens. */
export type DoorRead = {
  label: string
  room: string
  width: number
  across: string | null
  swingsInto: string | null
  swings: boolean
  hinges: boolean
  /** False for a door whose wall moved away: it is drawn as a ring and put back or removed. */
  onWall: boolean
}

export function doorRead(sheet: Sheet, storey: number, sel: DoorRef): DoorRead | null {
  const r = placedRooms(sheet, storey).find((o) => o.id === sel.room)
  const d = r ? doorsOf(r).find((o) => o.id === sel.id) : undefined
  if (!r || !d) return null
  const pl = doorPlace(r, d)
  const across = pl ? doorAcross(r, pl, sheet, storey) : null
  return {
    label: DOOR[d.type].label,
    room: r.name,
    width: d.w,
    across: across ? across.name : null,
    swingsInto: hasSwing(d) ? (d.flip ? (across ? across.name : 'the outside') : r.name) : null,
    swings: hasSwing(d),
    hinges: hasHinge(d),
    onWall: !!pl,
  }
}
