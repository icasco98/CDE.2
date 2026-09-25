/**
 * Doors. A door is the drawing of an edge. Between two rooms it stands on the wall the two share,
 * `along` of the way along it; to the outside it stands on the outside wall of its room it was
 * placed on. Where the two rooms share no wall a door wide, or that wall no longer faces outside, it
 * is simply not drawn, and it comes back where it was when the rooms do. Nothing here reads an edge
 * off the walls: the room across a wall is looked up only to ask which pair a new door would draw.
 */

import {
  OUTSIDE,
  doorsOf,
  ghostsOf,
  isOpen,
  isStair,
  placedRooms,
  storeyOf,
  type Door,
  type DoorType,
  type Point,
  type Room,
  type Sheet,
} from './model'
import {
  insideConvex,
  insideRoomLocal,
  outlineOf,
  r6,
  same,
  snapTo,
  toLocal,
  toWorld,
  worldN,
  worldPieces,
  worldWalls,
  type Seg,
} from './geometry'
import { isStreetDoor } from './kinds'

/** Where a door sits: a wall of its room, the run along it, and its normal. */
export type Place = {
  dist: number
  seg: Seg
  L: number
  u: Point
  n: Point
  t: number
  p: Point
  fits: boolean
  snapped?: 'jamb' | 'middle' | null
}

/** The least run an opened wall is left with, and the room kept at each end of it. */
const OPEN_LEAST = 0.6
const OPEN_KEEP = 0.05

/** The nearest wall of a room to a point of its frame, within a metre, and the door's run on it. */
function wallNear(r: Room, at: Point, w: number): Place | null {
  let best: Omit<Place, 'p' | 'fits'> | null = null
  for (const seg of outlineOf(r)) {
    const u = [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]]
    const L = Math.hypot(u[0]!, u[1]!)
    if (L < 1e-6) continue
    const ux = u[0]! / L
    const uy = u[1]! / L
    let t = (at[0] - seg.a[0]) * ux + (at[1] - seg.a[1]) * uy
    t = Math.min(Math.max(t, 0), L)
    const px = seg.a[0] + ux * t
    const py = seg.a[1] + uy * t
    const dist = Math.hypot(at[0] - px, at[1] - py)
    if (!best || dist < best.dist) best = { dist, seg, L, u: [ux, uy], n: seg.n, t }
  }
  if (!best || best.dist > 1) return null
  const found = best
  const half = w / 2
  const t = Math.min(Math.max(found.t, half), Math.max(half, found.L - half))
  return {
    ...found,
    t,
    p: [found.seg.a[0] + found.u[0] * t, found.seg.a[1] + found.u[1] * t],
    fits: found.L >= w + 0.1,
  }
}

const roomAt = (x: number, y: number, except: Room, onStorey: Room[]) =>
  onStorey.find(
    (o) => o !== except && !isOpen(o) && worldPieces(o).some((wp) => insideConvex(wp, x, y)),
  ) ?? null

/** The room across a wall at a place on it, or null for outside and open ground. */
export function doorAcross(r: Room, pl: Place, sheet: Sheet, storey: number): Room | null {
  const wp = toWorld(r, pl.p[0], pl.p[1])
  const n = worldN(r, pl.n)
  return roomAt(wp[0] + n[0] * 0.3, wp[1] + n[1] * 0.3, r, placedRooms(sheet, storey))
}

/**
 * A run of wall two rooms share, on one wall of the first: from `lo` to `hi` along it, in its frame.
 * `fromLo` says which end `along` counts from, the one further west, then further north, in the
 * world, so turning either room over does not send a door to the other end.
 */
type Stretch = { seg: Seg; L: number; u: Point; lo: number; hi: number; fromLo: boolean }

function stretchesOf(r: Room, o: Room): Stretch[] {
  const walls = worldWalls(o)
  const out: Stretch[] = []
  for (const seg of outlineOf(r)) {
    const A = toWorld(r, seg.a[0], seg.a[1])
    const B = toWorld(r, seg.b[0], seg.b[1])
    const L = Math.hypot(B[0] - A[0], B[1] - A[1])
    if (L < 1e-6) continue
    const wu = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
    const wn = worldN(r, seg.n)
    const runs: [number, number][] = []
    for (const w of walls) {
      if (w.n[0] * wn[0] + w.n[1] * wn[1] > -0.98) continue
      const off = (w.a[0] - A[0]) * wn[0] + (w.a[1] - A[1]) * wn[1]
      if (Math.abs(off) > 0.06) continue
      const t0 = (w.a[0] - A[0]) * wu[0]! + (w.a[1] - A[1]) * wu[1]!
      const t1 = (w.b[0] - A[0]) * wu[0]! + (w.b[1] - A[1]) * wu[1]!
      const lo = Math.max(0, Math.min(t0, t1))
      const hi = Math.min(L, Math.max(t0, t1))
      if (hi - lo > 0.05) runs.push([lo, hi])
    }
    runs.sort((p, q) => p[0] - q[0])
    const merged: [number, number][] = []
    for (const [lo, hi] of runs) {
      const last = merged[merged.length - 1]
      if (last && lo <= last[1] + 0.05) last[1] = Math.max(last[1], hi)
      else merged.push([lo, hi])
    }
    const u: Point = [(seg.b[0] - seg.a[0]) / L, (seg.b[1] - seg.a[1]) / L]
    for (const [lo, hi] of merged) {
      const pLo = [A[0] + wu[0]! * lo, A[1] + wu[1]! * lo]
      const pHi = [A[0] + wu[0]! * hi, A[1] + wu[1]! * hi]
      const cm = (v: number) => Math.round(v * 100)
      const fromLo =
        cm(pLo[0]!) < cm(pHi[0]!) || (cm(pLo[0]!) === cm(pHi[0]!) && cm(pLo[1]!) <= cm(pHi[1]!))
      out.push({ seg, L, u, lo, hi, fromLo })
    }
  }
  return out
}

/** The run of wall two rooms share that a door between them stands on: the longest one. */
function longestStretch(r: Room, o: Room): Stretch | null {
  let best: Stretch | null = null
  for (const s of stretchesOf(r, o)) if (!best || s.hi - s.lo > best.hi - best.lo) best = s
  return best
}

const middleOf = (s: Stretch, along: number): number => {
  const t = Math.min(Math.max(along, 0), 1) * (s.hi - s.lo)
  return s.fromLo ? s.lo + t : s.hi - t
}

const alongOf = (s: Stretch, t: number): number => {
  const run = s.hi - s.lo || 1
  return Math.min(Math.max((s.fromLo ? t - s.lo : s.hi - t) / run, 0), 1)
}

/** How wide a door is drawn on a stretch: its own width, or the whole run for an opened wall. */
const widthOn = (d: { type: DoorType; w: number }, s: Stretch) =>
  d.type === 'open' ? s.hi - s.lo - 2 * OPEN_KEEP : d.w

function placeOn(s: Stretch, t: number, w: number): Place {
  const half = w / 2
  const at = Math.min(Math.max(t, s.lo + half), Math.max(s.lo + half, s.hi - half))
  return {
    dist: 0,
    seg: s.seg,
    L: s.L,
    u: s.u,
    n: s.seg.n,
    t: at,
    p: [s.seg.a[0] + s.u[0] * at, s.seg.a[1] + s.u[1] * at],
    fits: true,
    snapped: null,
  }
}

/** Whether every part of a door's gap still opens onto the outside: no room stands across it. */
function facesOutside(r: Room, pl: Place, w: number, sheet: Sheet, storey: number): boolean {
  const onStorey = placedRooms(sheet, storey)
  const n = worldN(r, pl.n)
  const reach = Math.max(0, w / 2 - 0.05)
  return [-reach, 0, reach].every((off) => {
    const wp = toWorld(r, pl.p[0] + pl.u[0] * off, pl.p[1] + pl.u[1] * off)
    return !roomAt(wp[0] + n[0] * 0.3, wp[1] + n[1] * 0.3, r, onStorey)
  })
}

/**
 * Where a door of a room is drawn on a storey and how wide, or nothing when it is not: between two
 * rooms, on the wall they share when they share one the door fits; to the outside, on its own
 * storey, on the wall it was placed on while that wall still faces outside.
 */
function spotOf(sheet: Sheet, storey: number, r: Room, d: Door): { pl: Place; w: number } | null {
  if (d.to === OUTSIDE) {
    if (!d.at || storeyOf(r) !== storey) return null
    const pl = wallNear(r, d.at, d.w)
    return pl && pl.fits && facesOutside(r, pl, d.w, sheet, storey) ? { pl, w: d.w } : null
  }
  const o = placedRooms(sheet, storey).find((each) => each.id === d.to)
  if (!o || isOpen(o)) return null
  const s = longestStretch(r, o)
  if (!s) return null
  const w = widthOn(d, s)
  if (w < (d.type === 'open' ? OPEN_LEAST : d.w) - 1e-6 || s.hi - s.lo < w - 1e-6) return null
  return { pl: placeOn(s, middleOf(s, d.along ?? 0.5), w), w }
}

export const doorSpot = (sheet: Sheet, storey: number, r: Room, d: Door): Place | null =>
  spotOf(sheet, storey, r, d)?.pl ?? null

/**
 * How far along the wall two rooms share a point of the first room's frame stands, for a door saved
 * as a point before doors stood on their edge's wall; the middle when the two share no wall now.
 */
export function alongAt(r: Room, o: Room, at: Point): number {
  let best: { s: Stretch; t: number; dist: number } | null = null
  for (const s of stretchesOf(r, o)) {
    const t0 = (at[0] - s.seg.a[0]) * s.u[0] + (at[1] - s.seg.a[1]) * s.u[1]
    const t = Math.min(Math.max(t0, s.lo), s.hi)
    const p = [s.seg.a[0] + s.u[0] * t, s.seg.a[1] + s.u[1] * t]
    const dist = Math.hypot(at[0] - p[0]!, at[1] - p[1]!)
    if (!best || dist < best.dist) best = { s, t, dist }
  }
  return best ? r6(alongOf(best.s, best.t)) : 0.5
}

/** A door drawn on a storey: its room, itself, where it stands, and how wide it is drawn there. */
export type Drawn = { room: Room; door: Door; pl: Place; w: number }

/** Every door drawn on a storey. */
export function drawnDoors(sheet: Sheet, storey: number): Drawn[] {
  const out: Drawn[] = []
  for (const room of placedRooms(sheet, storey))
    for (const door of doorsOf(room)) {
      const spot = spotOf(sheet, storey, room, door)
      if (spot) out.push({ room, door, ...spot })
    }
  return out
}

export type Hit = { room: Room; pl: Place; why: string | null }

/**
 * The wall under the hand, and where on it a door of this width would sit: a jamb distance from
 * either end and the middle snap, then the grid. Says why a spot will not do.
 */
export function doorAt(
  x: number,
  y: number,
  w: number,
  sheet: Sheet,
  storey: number,
  only?: Room | null,
): Hit | null {
  const { settings } = sheet
  let best: { room: Room; pl: Place } | null = null
  for (const r of placedRooms(sheet, storey)) {
    if (isOpen(r) || r.fixed || (only && r !== only)) continue
    const pl = wallNear(r, toLocal(r, x, y), w)
    if (!pl) continue
    if (!best || pl.dist < best.pl.dist) best = { room: r, pl }
  }
  if (!best || best.pl.dist > 0.7) return null
  const room = best.room
  const pl = { ...best.pl }
  const half = w / 2
  const jamb = settings.jamb
  const dmax = Math.max(settings.snapDist, 0.2)
  let t = pl.t
  let snapped: number | null = null
  let kind: 'jamb' | 'middle' | null = null
  for (const [c, k] of [
    [half + jamb, 'jamb'],
    [pl.L - half - jamb, 'jamb'],
    [pl.L / 2, 'middle'],
  ] as [number, 'jamb' | 'middle'][]) {
    if (c < half - 1e-6 || c > pl.L - half + 1e-6) continue
    if (
      Math.abs(c - pl.t) <= dmax &&
      (snapped === null || Math.abs(c - pl.t) < Math.abs(snapped - pl.t))
    ) {
      snapped = c
      kind = k
    }
  }
  if (snapped !== null) t = snapped
  else if (settings.grid > 0)
    t = Math.min(Math.max(snapTo(pl.t, settings.grid), half), Math.max(half, pl.L - half))
  pl.t = t
  pl.p = [pl.seg.a[0] + pl.u[0] * t, pl.seg.a[1] + pl.u[1] * t]
  pl.snapped = kind
  const wp = toWorld(room, pl.p[0], pl.p[1])
  const onBoundary =
    [0, sheet.plot.w].some((v) => Math.abs(wp[0] - v) < 0.03) ||
    [0, sheet.plot.h].some((v) => Math.abs(wp[1] - v) < 0.03)
  const wn = worldN(room, pl.n)
  const beyond = [wp[0] + wn[0] * 0.3, wp[1] + wn[1] * 0.3]
  const toVoid = ghostsOf(sheet, storey).some((g) =>
    worldPieces(g).some((wpc) => insideConvex(wpc, beyond[0]!, beyond[1]!)),
  )
  return {
    room,
    pl,
    why: !pl.fits
      ? 'That wall is too short for this door.'
      : onBoundary
        ? 'A wall on the boundary takes no door.'
        : toVoid
          ? 'That wall faces the open to below; no door there.'
          : null,
  }
}

/** Where a door would stand, as the fields it keeps: how far along its stretch, or its point. */
export type Standing = { along: number; at?: undefined } | { at: Point; along?: undefined }

/**
 * A door of type `type` put where the hand points, between room `r` and `to`: on the stretch the two
 * share under the pointer, or on the outside wall there. Says why when it cannot stand there.
 */
export function doorStanding(
  sheet: Sheet,
  storey: number,
  hit: Hit,
  door: { type: DoorType; w: number; to: string },
): { standing: Standing; w: number; pl: Place } | { why: string } {
  const r = hit.room
  if (door.to === OUTSIDE) {
    if (door.type === 'open') return { why: 'Only a wall shared with a neighbour can be opened.' }
    if (hit.why) return { why: hit.why }
    return { standing: { at: [r6(hit.pl.p[0]), r6(hit.pl.p[1])] }, w: door.w, pl: hit.pl }
  }
  const o = placedRooms(sheet, storey).find((each) => each.id === door.to)
  if (!o) return { why: 'The room across is not on this storey.' }
  const s = stretchesOf(r, o).find(
    (each) =>
      same(each.seg.a, hit.pl.seg.a) &&
      same(each.seg.b, hit.pl.seg.b) &&
      hit.pl.t >= each.lo - 0.05 &&
      hit.pl.t <= each.hi + 0.05,
  )
  if (!s) return { why: `${r.name} and ${o.name} share no wall there.` }
  const w = widthOn(door, s)
  if (w < (door.type === 'open' ? OPEN_LEAST : door.w) - 1e-6 || s.hi - s.lo < w - 1e-6)
    return { why: 'The wall they share is too short for this door.' }
  const pl = placeOn(s, door.type === 'open' ? (s.lo + s.hi) / 2 : hit.pl.t, w)
  pl.snapped = hit.pl.snapped ?? null
  return { standing: { along: r6(alongOf(s, pl.t)) }, w, pl }
}

/**
 * A door slid by the hand: kept on its own stretch or its own wall, at the point nearest the
 * pointer. Refused off them, since a door never changes the edge it draws.
 */
export function doorSlid(
  sheet: Sheet,
  storey: number,
  r: Room,
  d: Door,
  x: number,
  y: number,
): { hit: Hit; standing: Standing } | null {
  const pl = doorSpot(sheet, storey, r, d)
  if (!pl) return null
  const local = toLocal(r, x, y)
  const t = (local[0] - pl.seg.a[0]) * pl.u[0] + (local[1] - pl.seg.a[1]) * pl.u[1]
  const off = (local[0] - pl.seg.a[0]) * pl.n[0] + (local[1] - pl.seg.a[1]) * pl.n[1]
  const half = d.w / 2
  if (d.to === OUTSIDE) {
    const at = Math.min(Math.max(snapTo(t, sheet.settings.grid || 0), half), pl.L - half)
    const next: Place = {
      ...pl,
      t: at,
      p: [pl.seg.a[0] + pl.u[0] * at, pl.seg.a[1] + pl.u[1] * at],
    }
    const why = Math.abs(off) > 1 ? 'A door stays on its wall.' : null
    return {
      hit: { room: r, pl: next, why },
      standing: { at: [r6(next.p[0]), r6(next.p[1])] },
    }
  }
  const o = sheet.rooms.find((each) => each.id === d.to)
  const s = o ? longestStretch(r, o) : null
  if (!s) return null
  const next = placeOn(s, t, widthOn(d, s))
  const why = Math.abs(off) > 1 ? `A door stays on the wall ${r.name} and ${o!.name} share.` : null
  return { hit: { room: r, pl: next, why }, standing: { along: r6(alongOf(s, next.t)) } }
}

/** The widest a door may be drawn where it stands, or nothing when it is not drawn. */
export function roomForDoor(sheet: Sheet, storey: number, r: Room, d: Door): number | null {
  const pl = doorSpot(sheet, storey, r, d)
  if (!pl) return null
  if (d.to === OUTSIDE) return pl.L - 0.1
  const o = sheet.rooms.find((each) => each.id === d.to)
  const s = o ? longestStretch(r, o) : null
  return s ? s.hi - s.lo : null
}

const hasSwing = (d: Door) => d.type !== 'opening' && d.type !== 'sliding' && d.type !== 'open'

/**
 * Whether the leaf can open: its swing must lie inside the room it swings into. A door that swings
 * out to the open, and one that does not swing at all, has nothing in its way.
 */
export function doorBlocked(r: Room, d: Door, pl: Place, across: Room | null): boolean {
  const [px, py] = pl.p
  const [ux, uy] = pl.u
  const [nx, ny] = pl.n
  const half = d.w / 2
  const a: Point = [px - ux * half, py - uy * half]
  const b: Point = [px + ux * half, py + uy * half]
  const inward = d.flip ? 1 : -1
  const into = d.flip ? across : r // the room the leaf swings into
  let blocked = false
  const leaf = (h: Point, len: number, dir: number) => {
    const e: Point = [h[0] + nx * inward * len, h[1] + ny * inward * len]
    const far: Point = [e[0] + ux * dir * len * 0.7, e[1] + uy * dir * len * 0.7]
    for (const pt of [[e[0] * 0.98 + h[0] * 0.02, e[1] * 0.98 + h[1] * 0.02] as Point, far]) {
      if (!into) continue
      const lp =
        into === r
          ? pt
          : (() => {
              const w = toWorld(r, pt[0], pt[1])
              return toLocal(into, w[0], w[1])
            })()
      if (!insideRoomLocal(into, lp)) blocked = true
    }
  }
  if (d.type === 'door' || d.type === 'street') leaf(d.hinge ? b : a, d.w, d.hinge ? -1 : 1)
  if (d.type === 'double' || d.type === 'street2') {
    leaf(a, half, 1)
    leaf(b, half, -1)
  }
  // swings out to the open, or does not swing: nothing in the way
  if ((d.flip && !across) || !hasSwing(d)) blocked = false
  return blocked
}

/** The room a door leads into from its own, or null for the outside. */
export const doorInto = (sheet: Sheet, d: Door): Room | null =>
  d.to === OUTSIDE ? null : (sheet.rooms.find((each) => each.id === d.to && each.placed) ?? null)

export type Walk = {
  depth: Map<string, number>
  count: Map<string, number>
  street: Set<string>
  outside: Set<string>
  reached: Room[]
  unreached: Room[]
  blocked: Room[]
}

/**
 * The walk test: from outside, through every door drawn on the storey, which rooms can be reached
 * and in how many doors. A door joins the two ends of its edge; the wall it stands on joins nothing.
 */
export function walkTest(sheet: Sheet, storey: number): Walk | null {
  const placed = placedRooms(sheet, storey).filter((r) => !isOpen(r) && !r.fixed)
  const links = new Map<string, Set<string>>()
  const count = new Map<string, number>()
  const street = new Set<string>()
  const outside = new Set<string>()
  const blocked: Room[] = []
  let any = false
  const link = (p: string, q: string) => {
    if (!links.has(p)) links.set(p, new Set())
    links.get(p)!.add(q)
  }
  for (const { room: r, door: d, pl } of drawnDoors(sheet, storey)) {
    any = true
    count.set(r.id, (count.get(r.id) ?? 0) + 1)
    const o = doorInto(sheet, d)
    if (o) {
      count.set(o.id, (count.get(o.id) ?? 0) + 1)
      link(r.id, o.id)
      link(o.id, r.id)
    } else {
      link('out', r.id)
      link(r.id, 'out')
      outside.add(r.id)
      if (isStreetDoor(d)) street.add(r.id)
    }
    if (doorBlocked(r, d, pl, o)) blocked.push(r)
  }
  if (storey > 0)
    for (const st of placed.filter(isStair)) {
      link('out', st.id)
      link(st.id, 'out')
      any = true
    }
  if (!any) return null
  const depth = new Map<string, number>([['out', 0]])
  const queue = ['out']
  while (queue.length) {
    const p = queue.shift()!
    for (const q of links.get(p) ?? [])
      if (!depth.has(q)) {
        depth.set(q, depth.get(p)! + 1)
        queue.push(q)
      }
  }
  return {
    depth,
    count,
    street,
    outside,
    reached: placed.filter((r) => depth.has(r.id)),
    unreached: placed.filter((r) => !depth.has(r.id)),
    blocked,
  }
}
