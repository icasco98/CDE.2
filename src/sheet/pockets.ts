/**
 * Pockets: empty space with rooms on every side. The buildable area less every room, as convex
 * pieces, sorted into the spaces that hang together; each one can be given to a room that walls it
 * in, or made a court or a corridor.
 */

import {
  piecesOf,
  placedRooms,
  type Category,
  type Point,
  type Poly,
  type Room,
  type Settings,
  type Sheet,
} from './model'
import {
  areaOf,
  canonicalise,
  chainWalls,
  facing,
  fmt,
  insideConvex,
  diffPieces,
  outlineFrom,
  overlapCells,
  partArea,
  partsOf,
  polyArea,
  polyCentroid,
  r2,
  r6,
  tidy,
  toLocal,
  weld,
  worldPieces,
  worldWalls,
} from './geometry'
import { allowedBox, outsideBuildable } from './settle'

/** An enclosed empty space: its convex pieces, its area, its middle, and the walls round it. */
export type Pocket = {
  pieces: Poly[]
  area: number
  centre: Point
  touch: Map<string, number>
  ring: Poly | null
}

export function pocketsOf(sheet: Sheet, storey: number): Pocket[] {
  // the setback line, and the boundary where building to it is allowed, count as walls
  const A = allowedBox(sheet, storey)
  let free: Poly[] = [
    [
      [A.x, A.y],
      [A.x + A.w, A.y],
      [A.x + A.w, A.y + A.h],
      [A.x, A.y + A.h],
    ],
  ]
  const placed = placedRooms(sheet, storey)
  for (const r of placed) for (const wp of worldPieces(r)) free = diffPieces(free, wp)
  free = weld(free, 0.02)
    .map(facing)
    .filter((p) => p.length >= 3 && polyArea(p) > 0.02)
  const out: Pocket[] = []
  for (const part of partsOf(free)) {
    const segs = outlineFrom(part).segs
    const area = partArea(part)
    if (area < 0.05) continue
    // which rooms wall it in, by how much wall each gives it
    const touch = new Map<string, number>()
    for (const sg of segs) {
      const mid: Point = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2]
      const len = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1])
      for (const r of placed) {
        const hit = worldWalls(r).some((w) => {
          const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
          const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
          const t = (mid[0] - w.a[0]) * u[0]! + (mid[1] - w.a[1]) * u[1]!
          const off = Math.abs((mid[0] - w.a[0]) * u[1]! - (mid[1] - w.a[1]) * u[0]!)
          return off < 0.02 && t > -0.02 && t < L + 0.02
        })
        if (hit) {
          touch.set(r.id, (touch.get(r.id) ?? 0) + len)
          break
        }
      }
    }
    if (!touch.size) continue // no room walls it: nothing to give it to
    let A2 = 0
    let X = 0
    let Y = 0
    for (const p of part) {
      const a = polyArea(p)
      const c = polyCentroid(p)
      A2 += a
      X += c[0] * a
      Y += c[1] * a
    }
    const loops = chainWalls(segs)
    const ring = loops
      ? loops
          .map((l) => l.map((e) => e.a))
          .reduce((best, p) => (polyArea(p) > polyArea(best) ? p : best))
      : null
    out.push({ pieces: part, area, centre: [X / A2, Y / A2], touch, ring })
  }
  return out
}

/** Whether a square of the court's side fits somewhere in the space, tried on a quarter-metre lattice. */
export function holdsSquare(pk: Pocket, side: number): boolean {
  const flat = pk.pieces.flat()
  const xs = flat.map((p) => p[0])
  const ys = flat.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const inside = (x: number, y: number) => pk.pieces.some((p) => insideConvex(p, x, y))
  for (let x = x0; x + side <= x1 + 1e-9; x += 0.25)
    for (let y = y0; y + side <= y1 + 1e-9; y += 0.25) {
      const pts: Point[] = [
        [x, y],
        [x + side, y],
        [x + side, y + side],
        [x, y + side],
        [x + side / 2, y + side / 2],
        [x + side / 2, y],
        [x + side / 2, y + side],
        [x, y + side / 2],
        [x + side, y + side / 2],
      ]
      if (
        pts.every(([px, py]) =>
          inside(
            px + (px === x ? 0.005 : px === x + side ? -0.005 : 0),
            py + (py === y ? 0.005 : py === y + side ? -0.005 : 0),
          ),
        )
      )
        return true
    }
  return false
}

/** Why this space cannot be a court, in the mock's words; empty when it can. */
export const courtWhy = (pk: Pocket, settings: Settings): string =>
  pk.area + 1e-6 < settings.courtArea
    ? `${fmt(pk.area)} m² is under the ${settings.courtArea} m² a court needs.`
    : !holdsSquare(pk, settings.courtSide)
      ? `No ${settings.courtSide} m square fits in it.`
      : ''

/**
 * A world shape handed to a room as more of its own floor, in the room's frame. With a squared-off
 * room asked for, the rectangle round it is kept where that overlaps nothing and stays on the floor.
 */
export function givePieces(r: Room, worldPolys: Poly[], sheet: Sheet, storey: number): Room | null {
  const local = worldPolys.map((p) => tidy(p.map(([x, y]) => toLocal(r, x, y))))
  r.pieces = piecesOf(r).concat(local)
  const kept = canonicalise(r)
  if (!kept) return null
  if (sheet.settings.pocketKeeps === 'square' && r.placed && r.pieces) {
    const probe: Room = { ...r, pieces: null, fixed: false }
    const clean =
      !placedRooms(sheet, storey).some((o) => o !== r && overlapCells(probe, o).length) &&
      (!!sheet.settings.allowSpill || !outsideBuildable(probe, allowedBox(sheet, storey)))
    if (clean) r.pieces = null
  }
  return r
}

/** A room the sheet itself makes out of a space: a court, or a hallway where none reaches. */
export function roomFromPocket(
  pk: Pocket,
  kind: string,
  name: string,
  cat: Category,
  fixed: boolean,
  id: string,
  placedAt: number,
): Room {
  const flat = pk.pieces.flat()
  const xs = flat.map((p) => p[0])
  const ys = flat.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = r6(Math.max(...xs) - x)
  const h = r6(Math.max(...ys) - y)
  const r: Room = {
    id,
    name,
    kind,
    cat,
    target: r2(pk.area),
    w,
    h,
    x: r6(x),
    y: r6(y),
    angle: 0,
    placed: true,
    extra: true,
    fixed,
    placedAt,
    pieces: pk.pieces.map((p) => tidy(p.map(([px, py]) => [px - x, py - y] as Point))),
  }
  if (Math.abs(areaOf(r) - w * h) < 1e-3) r.pieces = null
  return r
}

/** The room that gives a space the most wall, which is the one the bar offers it to. */
export function bestNeighbour(pk: Pocket, sheet: Sheet): Room | null {
  let best: { r: Room; len: number } | null = null
  for (const [id, len] of pk.touch) {
    const r = sheet.rooms.find((o) => o.id === id && o.placed && !o.fixed)
    if (r && (!best || len > best.len)) best = { r, len }
  }
  return best ? best.r : null
}
