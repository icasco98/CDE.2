/**
 * Doors. A door is the drawing of an edge on a wall of its room: it sits at a point in the room's
 * frame, and the wall it belongs to is whichever wall of the room is nearest that point. A wall on
 * the plot boundary takes none; a shared wall takes one door for both rooms.
 */

import {
  doorsOf,
  ghostsOf,
  isOpen,
  isStair,
  placedRooms,
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
  r2,
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
import { DOOR, isStreetDoor } from './sample'

/** Where a door sits: the nearest wall of its room, the run along it, and its normal. */
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

export function doorPlace(r: Room, d: { at: Point; w: number }): Place | null {
  let best: Omit<Place, 'p' | 'fits'> | null = null
  for (const seg of outlineOf(r)) {
    const u = [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]]
    const L = Math.hypot(u[0]!, u[1]!)
    if (L < 1e-6) continue
    const ux = u[0]! / L
    const uy = u[1]! / L
    let t = (d.at[0] - seg.a[0]) * ux + (d.at[1] - seg.a[1]) * uy
    t = Math.min(Math.max(t, 0), L)
    const px = seg.a[0] + ux * t
    const py = seg.a[1] + uy * t
    const dist = Math.hypot(d.at[0] - px, d.at[1] - py)
    if (!best || dist < best.dist) best = { dist, seg, L, u: [ux, uy], n: seg.n, t }
  }
  if (!best || best.dist > 1) return null
  const found = best
  const half = d.w / 2
  const t = Math.min(Math.max(found.t, half), Math.max(half, found.L - half))
  return {
    ...found,
    t,
    p: [found.seg.a[0] + found.u[0] * t, found.seg.a[1] + found.u[1] * t],
    fits: found.L >= d.w + 0.1,
  }
}

const roomAt = (x: number, y: number, except: Room, onStorey: Room[]) =>
  onStorey.find(
    (o) => o !== except && !isOpen(o) && worldPieces(o).some((wp) => insideConvex(wp, x, y)),
  ) ?? null

/** The room on the other side of a door, or null for outside and open ground. */
export function doorAcross(r: Room, pl: Place, sheet: Sheet, storey: number): Room | null {
  const wp = toWorld(r, pl.p[0], pl.p[1])
  const n = worldN(r, pl.n)
  return roomAt(wp[0] + n[0] * 0.3, wp[1] + n[1] * 0.3, r, placedRooms(sheet, storey))
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
    const pl = doorPlace(r, { at: toLocal(r, x, y), w })
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

/**
 * A wall picked for opening: every stretch of it that meets a neighbouring room's wall is taken out,
 * one opening per neighbour, each held inside both walls' runs so nothing spills past a corner. The
 * doors already on that stretch go with the wall. An opening onto one neighbour records the pair
 * as the edge it draws when `joined` says the two already share one.
 */
export function openWall(
  hit: Hit,
  sheet: Sheet,
  storey: number,
  id: () => string,
  joined: (a: string, b: string) => boolean = () => false,
): { why: string | null; added: Door[] } {
  const r = hit.room
  const seg = hit.pl.seg
  const u = hit.pl.u
  const L = hit.pl.L
  const A = toWorld(r, seg.a[0], seg.a[1])
  const B = toWorld(r, seg.b[0], seg.b[1])
  const wu = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
  const wn = worldN(r, seg.n)
  const runs: [number, number, string][] = []
  for (const o of placedRooms(sheet, storey)) {
    if (o === r || isOpen(o) || o.fixed) continue
    for (const w of worldWalls(o)) {
      if (w.n[0] * wn[0] + w.n[1] * wn[1] > -0.98) continue // facing this wall
      const off = (w.a[0] - A[0]) * wn[0] + (w.a[1] - A[1]) * wn[1]
      if (Math.abs(off) > 0.06) continue // on the same line
      const t0 = (w.a[0] - A[0]) * wu[0]! + (w.a[1] - A[1]) * wu[1]!
      const t1 = (w.b[0] - A[0]) * wu[0]! + (w.b[1] - A[1]) * wu[1]!
      const lo = Math.max(0, Math.min(t0, t1))
      const hi = Math.min(L, Math.max(t0, t1))
      if (hi - lo >= 0.6) runs.push([lo, hi, o.id])
    }
  }
  if (!runs.length)
    return {
      why: 'That wall meets no room. Only a wall shared with a neighbour can be opened.',
      added: [],
    }
  runs.sort((p, q) => p[0] - q[0])
  const merged: { lo: number; hi: number; with: Set<string> }[] = []
  for (const [lo, hi, other] of runs) {
    const last = merged[merged.length - 1]
    if (last && lo <= last.hi + 0.05) {
      last.hi = Math.max(last.hi, hi)
      last.with.add(other)
    } else merged.push({ lo, hi, with: new Set([other]) })
  }
  const gone = doorsOf(r).filter((d) => {
    const pl = doorPlace(r, d)
    return (
      !!pl &&
      same(pl.seg.a, seg.a) &&
      same(pl.seg.b, seg.b) &&
      merged.some(({ lo, hi }) => pl.t > lo && pl.t < hi)
    )
  })
  r.doors = doorsOf(r).filter((d) => !gone.includes(d))
  const added: Door[] = []
  for (const { lo, hi, with: others } of merged) {
    // five centimetres kept at each end, so the opening sits inside both walls
    const w = r2(hi - lo - 0.1)
    const t = (lo + hi) / 2
    const [other] = [...others]
    const d: Door = {
      id: id(),
      type: 'open',
      w,
      flip: false,
      hinge: false,
      at: [r6(seg.a[0] + u[0] * t), r6(seg.a[1] + u[1] * t)],
      ...(others.size === 1 && other && joined(r.id, other) ? { pair: [r.id, other] } : {}),
    }
    r.doors = [...doorsOf(r), d]
    added.push(d)
  }
  return { why: null, added }
}

/** The selected door's width, checked against its wall. */
export function setDoorWidth(
  r: Room,
  d: Door,
  w: number,
): { door: Door | null; why: string | null } {
  const width = r2(Math.min(3, Math.max(0.6, w)))
  const pl = doorPlace(r, { ...d, w: width })
  if (!pl || !pl.fits) return { door: null, why: 'That wall is too short for a door that wide.' }
  return { door: { ...d, w: width, at: [r6(pl.p[0]), r6(pl.p[1])] }, why: null }
}

/** The selected door slid along its wall by a step, kept a jamb from the corners. */
export function slideDoor(r: Room, d: Door, step: number): Door | null {
  const pl = doorPlace(r, d)
  if (!pl) return null
  const half = d.w / 2
  const t = Math.min(Math.max(pl.t + step, half), Math.max(half, pl.L - half))
  return { ...d, at: [r6(pl.seg.a[0] + pl.u[0] * t), r6(pl.seg.a[1] + pl.u[1] * t)] }
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

export type Walk = {
  depth: Map<string, number>
  count: Map<string, number>
  street: Set<string>
  outside: Set<string>
  reached: Room[]
  unreached: Room[]
  blocked: Room[]
}

/** The walk test: from outside, through every door, which rooms can be reached and in how many doors. */
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
  for (const r of placed)
    for (const d of doorsOf(r)) {
      const pl = doorPlace(r, d)
      if (!pl) continue
      any = true
      count.set(r.id, (count.get(r.id) ?? 0) + 1)
      const o = doorAcross(r, pl, sheet, storey)
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

export const doorWidthOf = (type: DoorType) => DOOR[type].w
