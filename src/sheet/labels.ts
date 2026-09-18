/**
 * Labels. The name is laid where the footprint has the most room round it, clear of every other
 * room, upright or along the room, shrinking and then falling to initials only when it must. What
 * the room cannot carry, the hover tag and the program list carry.
 */

import { isOpen, placedRooms, type Point, type Room, type Sheet } from './model'
import {
  centreOfFootprint,
  insideRoomLocal,
  bboxOf,
  overlapRect,
  insideConvex,
  outlineOf,
  r6,
  toLocal,
  toWorld,
  worldPieces,
  worldWalls,
  type Seg,
} from './geometry'

/** How far the footprint runs through a point along a direction, both ways, in the room's frame. */
export function spanThrough(
  r: Room,
  pt: Point,
  u: Point,
  extra?: Seg[],
): { fwd: number; back: number } {
  let fwd = Infinity
  let back = Infinity
  for (const sg of extra ? outlineOf(r).concat(extra) : outlineOf(r)) {
    const d = [sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]]
    const den = u[0] * d[1]! - u[1] * d[0]!
    if (Math.abs(den) < 1e-9) continue
    const t = ((sg.a[0] - pt[0]) * d[1]! - (sg.a[1] - pt[1]) * d[0]!) / den
    const sV = ((sg.a[0] - pt[0]) * u[1] - (sg.a[1] - pt[1]) * u[0]) / den
    if (sV < -1e-6 || sV > 1 + 1e-6) continue
    if (t >= 0 && t < fwd) fwd = t
    if (t < 0 && -t < back) back = -t
  }
  return { fwd: fwd === Infinity ? 0 : fwd, back: back === Infinity ? 0 : back }
}

export const initialsOf = (name: string) =>
  name
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** The walls of the rooms lying over this one, in its frame: the label must stop at them. */
export function obstaclesOf(
  r: Room,
  sheet: Sheet,
  storey: number,
): { others: Room[]; segs: Seg[] } {
  const others = placedRooms(sheet, storey).filter(
    (o) => o !== r && !isOpen(o) && !o.fixed && overlapRect(bboxOf(o), bboxOf(r)),
  )
  const segs: Seg[] = []
  for (const o of others)
    for (const w of worldWalls(o)) {
      const a = toLocal(r, w.a[0], w.a[1])
      const b = toLocal(r, w.b[0], w.b[1])
      segs.push({ a, b, n: [0, 0] })
    }
  return { others, segs }
}

export type LabelPlan = {
  pt: Point
  along: boolean
  name: string
  size: number
  lines: [string, number][]
}

/** How wide a character is, as a share of the writing's size. */
const CH = 0.56

/**
 * Where the writing fits: the label box, at full size first, is tried at every point of the room
 * that is not under another room, upright or along the room; the point with the most clear space
 * round it wins. Only when nothing fits does the writing shrink, then fall to initials.
 */
export function labelPlan(
  r: Room,
  texts: { area?: string },
  sheet: Sheet,
  storey: number,
): LabelPlan {
  const obs = obstaclesOf(r, sheet, storey)
  const others = obs.others
  const covered = (pt: Point) => {
    if (!others.length) return false
    const w = toWorld(r, pt[0], pt[1])
    return others.some((o) => worldPieces(o).some((wp) => insideConvex(wp, w[0], w[1])))
  }
  const free = (pt: Point) => insideRoomLocal(r, pt) && !covered(pt)
  const boxFits = (pt: Point, w: number, h: number, along: boolean) => {
    const hw = (along ? h : w) / 2
    const hh = (along ? w : h) / 2
    return (
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
        [0, 0],
        [-hw, 0],
        [hw, 0],
        [0, -hh],
        [0, hh],
        [-hw / 2, -hh],
        [hw / 2, -hh],
        [-hw / 2, hh],
        [hw / 2, hh],
      ] as Point[]
    ).every(([dx, dy]) => free([pt[0] + dx, pt[1] + dy]))
  }
  const clearance = (pt: Point) => {
    const sx = spanThrough(r, pt, [1, 0], obs.segs)
    const sy = spanThrough(r, pt, [0, 1], obs.segs)
    return Math.min(sx.fwd, sx.back, sy.fwd, sy.back)
  }
  const cands: Point[] = []
  const [mx, my] = centreOfFootprint(r)
  if (free([mx, my])) cands.push([mx, my])
  const step = Math.max(0.2, Math.min(r.w, r.h) / 14)
  for (let x = step / 2; x < r.w; x += step)
    for (let y = step / 2; y < r.h; y += step) {
      const pt: Point = [r6(x), r6(y)]
      if (free(pt)) cands.push(pt)
    }
  const tryPlan = (name: string, size: number, lines: [string, number][]): LabelPlan | null => {
    const w = name.length * CH * size + 0.2
    const h = size * 1.25 + lines.reduce((sum, [, sz]) => sum + sz * 1.3, 0)
    const wl = Math.max(w, ...lines.map(([t, sz]) => t.length * CH * sz + 0.2))
    let best: { pt: Point; along: boolean; sc: number } | null = null
    for (const pt of r.labelAt ? [r.labelAt] : cands)
      for (const along of [false, true]) {
        if (!boxFits(pt, wl, h, along)) continue
        const sc = clearance(pt) - (along ? 0.15 : 0)
        if (!best || sc > best.sc) best = { pt, along, sc }
      }
    return best ? { ...best, name, size, lines } : null
  }
  const full = r.name
  const ini = initialsOf(r.name)
  const rounds: [string, number, [string, number][]][] = []
  for (const size of [0.5, 0.42, 0.34]) {
    if (texts.area) rounds.push([full, size, [[texts.area, Math.min(0.42, size * 0.84)]]])
    rounds.push([full, size, []])
  }
  for (const size of [0.45, 0.34, 0.26]) rounds.push([ini, size, []])
  if (r.labelAt) {
    const res =
      tryPlan(full, 0.5, texts.area ? [[texts.area, 0.42]] : []) ??
      tryPlan(full, 0.4, []) ??
      tryPlan(full, 0.3, [])
    return res ?? { pt: r.labelAt, along: false, name: full, size: 0.3, lines: [] }
  }
  for (const [name, size, lines] of rounds) {
    const res = tryPlan(name, size, lines)
    if (res) return res
  }
  return { pt: cands[0] ?? [mx, my], along: false, name: ini, size: 0.22, lines: [] }
}
