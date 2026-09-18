/**
 * The piece geometry of the sheet. A room's footprint is a set of convex pieces in its own frame; a
 * plain room has none and is simply its rectangle. Carving replaces the rectangle with the pieces
 * that survive, so a cut by a turned room keeps its true slanted edge instead of a staircase of
 * little boxes. Areas, centroids and bounding boxes come from `src/geometry`; the convex clipping,
 * the outline with its seams dropped and the welding are this sheet's own.
 */

import { area, boundingBox, centroid, edgesOf, signedArea } from '../geometry/polygon'
export type { Point, Poly } from './model'
import { BUILD, PLOT, type Box } from './plot'
import { centreOf, piecesOf, square, type Frame, type Point, type Poly, type Room } from './model'

export const r2 = (v: number) => Math.round(v * 100) / 100
/** Piece corners, fine enough that touching pieces match exactly. */
export const r6 = (v: number) => Math.round(v * 1e6) / 1e6
export const fmt = (v: number) => (Math.round(v * 10) / 10).toString()
export const snapTo = (v: number, g: number) => (g > 0 ? Math.round(v / g) * g : v)
export const rad = (d: number) => (d * Math.PI) / 180
export const norm = (d: number) => ((d % 360) + 360) % 360

/** A wall of a footprint: from `a` to `b` the way the room is walked, with the way out of it. */
export type Seg = { a: Point; b: Point; n: Point }

export const polySigned = (p: Poly) => signedArea(p)
export const polyArea = (p: Poly) => area(p)
export const polyCentroid = (p: Poly): Point => {
  const c = centroid(p)
  return [c[0], c[1]]
}

// ---------- frames: every room is a rectangle in its own frame, turned about its centre ----------

export function toWorld(r: Frame, lx: number, ly: number): Point {
  const [cx, cy] = centreOf(r)
  const a = rad(r.angle || 0)
  const dx = r.x + lx - cx
  const dy = r.y + ly - cy
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
}

export function toLocal(r: Frame, wx: number, wy: number): Point {
  const [cx, cy] = centreOf(r)
  const a = -rad(r.angle || 0)
  const dx = wx - cx
  const dy = wy - cy
  return [
    cx + dx * Math.cos(a) - dy * Math.sin(a) - r.x,
    cy + dx * Math.sin(a) + dy * Math.cos(a) - r.y,
  ]
}

export const cornersOf = (r: Frame): Point[] =>
  (
    [
      [0, 0],
      [r.w, 0],
      [r.w, r.h],
      [0, r.h],
    ] as Point[]
  ).map(([x, y]) => toWorld(r, x, y))

export const worldPieces = (r: Room): Poly[] =>
  piecesOf(r).map((p) => p.map(([x, y]) => toWorld(r, x, y)))

export const areaOf = (r: Room) => piecesOf(r).reduce((s, p) => s + polyArea(p), 0)

export function centreOfFootprint(r: Room): Point {
  let A = 0
  let X = 0
  let Y = 0
  for (const p of piecesOf(r)) {
    const a = polyArea(p)
    const c = polyCentroid(p)
    A += a
    X += c[0] * a
    Y += c[1] * a
  }
  return A ? [X / A, Y / A] : [r.w / 2, r.h / 2]
}

/**
 * The upright box round the room's real walls, not round its frame: a drawn or carved shape is held
 * on the plot, and tested against the lines, by the corners it actually has.
 */
export function bboxOf(r: Room): Box {
  if (square(r)) return { x: r.x, y: r.y, w: r.w, h: r.h }
  const c = r.pieces && r.pieces.length ? worldCorners(r) : cornersOf(r)
  const b = boundingBox(c)
  return { x: b.left, y: b.top, w: b.width, h: b.depth }
}

export function overlapRect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  return x2 - x > 1e-6 && y2 - y > 1e-6 ? { x, y, w: x2 - x, h: y2 - y } : null
}

/** A world polygon seen from a room's own frame, as the smallest rectangle round it. */
export function localBox(r: Room, poly: Poly): Box {
  const b = boundingBox(poly.map(([x, y]) => toLocal(r, x, y)))
  return { x: b.left, y: b.top, w: b.width, h: b.depth }
}

export const unionBox = (rs: Room[]): Box => {
  const bs = rs.map(bboxOf)
  const x = Math.min(...bs.map((b) => b.x))
  const y = Math.min(...bs.map((b) => b.y))
  return {
    x,
    y,
    w: Math.max(...bs.map((b) => b.x + b.w)) - x,
    h: Math.max(...bs.map((b) => b.y + b.h)) - y,
  }
}

// ---------- pieces ----------

/** Corners repeated or a hair apart are one corner, and the ring never closes on itself. */
export function tidy(p: Poly): Poly {
  const out: Poly = []
  for (const [x, y] of p) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last[0] - x) > 1e-7 || Math.abs(last[1] - y) > 1e-7)
      out.push([r6(x), r6(y)])
  }
  while (
    out.length > 1 &&
    Math.abs(out[0]![0] - out[out.length - 1]![0]) < 1e-7 &&
    Math.abs(out[0]![1] - out[out.length - 1]![1]) < 1e-7
  )
    out.pop()
  return out
}

/** Every piece wound the same way, so one test tells inside from outside. */
export const facing = (p: Poly): Poly => (polySigned(p) < 0 ? p.slice().reverse() : p)

const longestEdge = (p: Poly) =>
  Math.max(...edgesOf(p).map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])))

/** How wide a piece is across its longest side. A sliver measures a few millimetres. */
export const thinness = (p: Poly) => polyArea(p) / (longestEdge(p) || 1)

/**
 * Corners within a couple of centimetres of each other are the same corner, and are made one. That
 * closes the hairline gaps a cut can leave, and a sliver caught between two pieces collapses so the
 * pieces meet properly instead of being held apart by it.
 */
export function weld(pieces: Poly[], tol: number): Poly[] {
  const map = new Map<string, Point>()
  const at = (x: number, y: number): Point => {
    const gx = Math.round(x / tol)
    const gy = Math.round(y / tol)
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const v = map.get(`${gx + i}|${gy + j}`)
        if (v && Math.hypot(v[0] - x, v[1] - y) <= tol) return v
      }
    const pt: Point = [r6(x), r6(y)]
    map.set(`${gx}|${gy}`, pt)
    return pt
  }
  return pieces.map((p) => tidy(p.map(([x, y]) => [...at(x, y)] as Point)))
}

/** One side of a line kept, the rest dropped; a convex piece stays convex. */
export function clipHalf(poly: Poly, a: Point, b: Point, keep: number): Poly {
  const side = ([x, y]: Point) => keep * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]))
  const meet = (prev: Point, cur: Point, sp: number, sc: number): Point => {
    const t = sp / (sp - sc)
    return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
  }
  const out: Poly = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!
    const prev = poly[(i + poly.length - 1) % poly.length]!
    const sc = side(cur)
    const sp = side(prev)
    if (sc >= -1e-9) {
      if (sp < -1e-9) out.push(meet(prev, cur, sp, sc))
      out.push(cur)
    } else if (sp >= -1e-9) out.push(meet(prev, cur, sp, sc))
  }
  return out.length >= 3 ? out : []
}

/** One convex piece less another: the pieces that survive, each still convex, edges exact. */
export function diffConvex(P: Poly, C: Poly): Poly[] {
  P = facing(P)
  C = facing(C)
  if (polyArea(C) < 1e-9) return [P]
  const out: Poly[] = []
  let cur = P
  for (let i = 0; i < C.length && cur.length; i++) {
    const a = C[i]!
    const b = C[(i + 1) % C.length]!
    const beyond = tidy(clipHalf(cur, a, b, -1))
    if (beyond.length >= 3 && polyArea(beyond) > 1e-6) out.push(beyond)
    cur = clipHalf(cur, a, b, 1)
  }
  return out
}

export function intersectConvex(P: Poly, C: Poly): Poly | null {
  P = facing(P)
  C = facing(C)
  let cur = P
  for (let i = 0; i < C.length && cur.length; i++)
    cur = clipHalf(cur, C[i]!, C[(i + 1) % C.length]!, 1)
  cur = tidy(cur)
  return cur.length >= 3 && polyArea(cur) > 1e-6 ? cur : null
}

export const diffPieces = (pieces: Poly[], C: Poly): Poly[] =>
  pieces.flatMap((p) => diffConvex(p, C))

export const insideConvex = (p: Poly, x: number, y: number) => {
  const f = facing(p)
  for (const [a, b] of edgesOf(f))
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-9) return false
  return true
}

export const insideRoomLocal = (r: Room, pt: Point) =>
  piecesOf(r).some((p) => insideConvex(p, pt[0], pt[1]))

/** Every piece two footprints share, as world polygons. */
export function overlapCells(a: Room, b: Room): Poly[] {
  const out: Poly[] = []
  const pas = worldPieces(a)
  const pbs = worldPieces(b)
  for (const pa of pas)
    for (const pb of pbs) {
      const o = intersectConvex(pa, pb)
      if (o && polyArea(o) > 5e-3 && thinness(o) > 0.01) out.push(o)
    }
  return out
}

// ---------- the walls a room shows ----------

/**
 * Every piece edge no neighbouring piece sits against, in the room's own frame, with the way out of
 * the room noted so a wall can be dragged, and which pieces lie against which.
 */
export function outlineFrom(pieces: Poly[]): { segs: Seg[]; against: [number, number][] } {
  type Line = {
    ux: number
    uy: number
    base: Point
    spans: [number, number, number, number, number][]
  }
  const lines = new Map<string, Line>()
  pieces.map(facing).forEach((p, pi) => {
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!
      const b = p[(i + 1) % p.length]!
      let dx = b[0] - a[0]
      let dy = b[1] - a[1]
      const L = Math.hypot(dx, dy)
      if (L < 1e-9) continue
      dx /= L
      dy /= L
      const flip = dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)
      const ux = flip ? -dx : dx
      const uy = flip ? -dy : dy
      const key = `${Math.round(ux * 1e4)}|${Math.round(uy * 1e4)}|${Math.round((ux * a[1] - uy * a[0]) * 1e4)}`
      let ln = lines.get(key)
      if (!ln) {
        ln = { ux, uy, base: a, spans: [] }
        lines.set(key, ln)
      }
      const t0 = a[0] * ux + a[1] * uy
      const t1 = b[0] * ux + b[1] * uy
      ln.spans.push([Math.min(t0, t1), Math.max(t0, t1), dy, -dx, pi])
    }
  })
  const segs: Seg[] = []
  const against: [number, number][] = []
  // Each wall runs the way the room is walked, so one wall can find the two it meets.
  const walk = (a: Point, b: Point, n: Point): Seg =>
    (b[0] - a[0]) * -n[1] + (b[1] - a[1]) * n[0] < 0 ? { a: b, b: a, n } : { a, b, n }
  for (const ln of lines.values()) {
    const at = ln.base[0] * ln.ux + ln.base[1] * ln.uy
    const pt = (t: number): Point => [
      r6(ln.base[0] + (t - at) * ln.ux),
      r6(ln.base[1] + (t - at) * ln.uy),
    ]
    const raw = ln.spans.flatMap((s) => [s[0], s[1]]).sort((a, b) => a - b)
    // the corners as they are, not rounded onto a grid
    const marks = raw.filter((v, i) => i === 0 || v - raw[i - 1]! > 1e-6)
    let run: number | null = null
    let out: Point | null = null
    for (let i = 0; i + 1 < marks.length; i++) {
      const m = (marks[i]! + marks[i + 1]!) / 2
      const on = ln.spans.filter((s) => m > s[0] + 1e-9 && m < s[1] - 1e-9)
      const wall = on.length === 1
      if (on.length === 2 && on[0]![4] !== on[1]![4]) against.push([on[0]![4], on[1]![4]])
      if (wall && run === null) {
        run = marks[i]!
        out = [on[0]![2], on[0]![3]]
      }
      if (wall && i + 2 === marks.length) {
        if (marks[i + 1]! - run! > 5e-3) segs.push(walk(pt(run!), pt(marks[i + 1]!), out!))
        run = null
      } else if (!wall && run !== null) {
        if (marks[i]! - run > 5e-3) segs.push(walk(pt(run), pt(marks[i]!), out!))
        run = null
      }
    }
  }
  return { segs, against }
}

export const outlineOf = (r: Room): Seg[] => outlineFrom(piecesOf(r)).segs

/** The pieces sorted into the parts of the room that actually hang together. */
export function partsOf(pieces: Poly[]): Poly[][] {
  const up = pieces.map((_unused, i) => i)
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i]!)))
  for (const [a, b] of outlineFrom(pieces).against) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) up[ra] = rb
  }
  const parts = new Map<number, Poly[]>()
  pieces.forEach((p, i) => {
    const k = find(i)
    if (!parts.has(k)) parts.set(k, [])
    parts.get(k)!.push(p)
  })
  return [...parts.values()]
}

export const partArea = (part: Poly[]) => part.reduce((s, p) => s + polyArea(p), 0)

export const same = (p: Point, q: Point) =>
  Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6

/** The walls chained into closed loops, so a wall knows the two it meets. */
export function chainWalls(segs: Seg[]): Seg[][] | null {
  if (!segs.length) return null
  const key = (p: Point) => `${Math.round(p[0] * 1e3)}|${Math.round(p[1] * 1e3)}`
  const leaving = new Map<string, Seg[]>()
  for (const sg of segs) {
    const k = key(sg.a)
    if (!leaving.has(k)) leaving.set(k, [])
    leaving.get(k)!.push(sg)
  }
  const dirOf = (sg: Seg) => Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0])
  const seen = new Set<Seg>()
  const loops: Seg[][] = []
  for (const start of segs) {
    if (seen.has(start)) continue
    const loop: Seg[] = []
    let cur: Seg | undefined = start
    let guard = 0
    while (cur && !seen.has(cur) && guard++ < 800) {
      seen.add(cur)
      loop.push(cur)
      const opts: Seg[] = (leaving.get(key(cur.b)) ?? []).filter((o) => !seen.has(o) || o === start)
      if (!opts.length) break
      if (opts.length === 1) cur = opts[0]
      else {
        // where more than two walls meet, keep to the room: take the sharpest turn back
        const back = dirOf(cur) + Math.PI
        let best: { t: number; o: Seg } | null = null
        for (const o of opts) {
          const t = (((back - dirOf(o)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
          if (!best || t < best.t) best = { t, o }
        }
        cur = best!.o
      }
      if (cur === start) break
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops.length ? loops : null
}

export const loopsOf = (r: Room) => chainWalls(outlineOf(r))

/** A corner that is not really a corner, and a wall too short to be a wall, both go. */
export function simplifyLoop(pts: Poly): Poly {
  let out = pts.slice()
  for (let pass = 0; pass < 4 && out.length > 3; pass++) {
    const keep: Poly = []
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]!
      const b = out[i]!
      const c = out[(i + 1) % out.length]!
      const d2 = Math.hypot(c[0] - b[0], c[1] - b[1])
      const room = keep.length + (out.length - i - 1) > 3
      if (d2 < 0.02 && room) continue
      const span = Math.hypot(c[0] - a[0], c[1] - a[1])
      // how far the corner stands off the line from one neighbour to the other
      const turn = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
      if (span > 1e-9 && turn / span < 0.02 && room) continue
      keep.push(b)
    }
    if (keep.length === out.length || keep.length < 3) break
    out = keep
  }
  return tidy(out)
}

export function meetLines(p1: Point, p2: Point, q1: Point, q2: Point): Point | null {
  const u = [p2[0] - p1[0], p2[1] - p1[1]]
  const v = [q2[0] - q1[0], q2[1] - q1[1]]
  const d = u[0]! * v[1]! - u[1]! * v[0]!
  if (Math.abs(d) < 1e-9) return null
  const t = ((q1[0] - p1[0]) * v[1]! - (q1[1] - p1[1]) * v[0]!) / d
  return [r6(p1[0] + t * u[0]!), r6(p1[1] + t * u[1]!)]
}

function segsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  const o1 = o(a, b, c)
  const o2 = o(a, b, d)
  const o3 = o(c, d, a)
  const o4 = o(c, d, b)
  return !!o1 && !!o2 && !!o3 && !!o4 && o1 !== o2 && o3 !== o4
}

export const simplePoly = (p: Poly) =>
  !p.some((_unused, i) =>
    p.some(
      (__unused, j) =>
        j > i + 1 &&
        !(i === 0 && j === p.length - 1) &&
        segsCross(p[i]!, p[(i + 1) % p.length]!, p[j]!, p[(j + 1) % p.length]!),
    ),
  )

function inTriangle(q: Point, a: Point, b: Point, c: Point): boolean {
  const d = (p1: Point, p2: Point, p3: Point) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = d(q, a, b)
  const d2 = d(q, b, c)
  const d3 = d(q, c, a)
  return !((d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12) && (d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12))
}

/** Any outline cut into convex pieces, so a room of any shape is still drawn and cut the same way. */
export function triangulate(poly: Poly): Poly[] {
  const p = facing(poly).slice()
  const out: Poly[] = []
  let guard = 0
  while (p.length > 3 && guard++ < 500) {
    let cut = false
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length]!
      const b = p[i]!
      const c = p[(i + 1) % p.length]!
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9) continue
      const skip = [(i + p.length - 1) % p.length, i, (i + 1) % p.length]
      if (p.some((q, j) => !skip.includes(j) && inTriangle(q, a, b, c))) continue
      out.push([a, b, c])
      p.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  if (p.length === 3) out.push(p.slice())
  return out.filter((t) => polyArea(t) > 1e-6)
}

// ---------- the frame and the shape in it ----------

export function loseSize(r: Room, dw: number, dh: number): void {
  const l = r.lost ?? { w: 0, h: 0 }
  r.lost = { w: r6(Math.max(0, l.w + dw)), h: r6(Math.max(0, l.h + dh)) }
}

/** The frame moved or resized on its own, the shape left where it stands in the world. */
export function setFrameOnly(r: Room, lx: number, ly: number, lw: number, lh: number): void {
  if (r.doors && (lx || ly))
    r.doors = r.doors.map((d) => ({ ...d, at: [r6(d.at[0] - lx), r6(d.at[1] - ly)] as Point }))
  if (r.labelAt && (lx || ly)) r.labelAt = [r6(r.labelAt[0] - lx), r6(r.labelAt[1] - ly)]
  const a = rad(r.angle || 0)
  const dx = lx + lw / 2 - r.w / 2
  const dy = ly + lh / 2 - r.h / 2
  const [cx, cy] = centreOf(r)
  const ncx = cx + dx * Math.cos(a) - dy * Math.sin(a)
  const ncy = cy + dx * Math.sin(a) + dy * Math.cos(a)
  loseSize(r, r.w - lw, r.h - lh)
  r.w = r6(lw)
  r.h = r6(lh)
  r.x = r6(ncx - lw / 2)
  r.y = r6(ncy - lh / 2)
}

/**
 * Tiny pieces dropped, the frame pulled in to what is left, and a shape that is whole again goes
 * back to being a plain rectangle. Nothing left at all: the room belongs in the tray, so null.
 */
export function normalise(r: Room): Room | null {
  const ps = piecesOf(r)
    .map(facing)
    .filter((p) => polyArea(p) > 0.02)
  if (!ps.length) return null
  const flat = ps.flat()
  const xs = flat.map((p) => p[0])
  const ys = flat.map((p) => p[1])
  const bx = Math.min(...xs)
  const by = Math.min(...ys)
  const bw = r6(Math.max(...xs) - bx)
  const bh = r6(Math.max(...ys) - by)
  const shifted = ps.map((p) => tidy(p.map(([x, y]) => [x - bx, y - by] as Point)))
  setFrameOnly(r, r6(bx), r6(by), bw, bh)
  const A = shifted.reduce((s, p) => s + polyArea(p), 0)
  r.pieces = Math.abs(A - bw * bh) < 1e-3 ? null : shifted
  return r
}

/**
 * One room is one place. Whatever a cut or a drag leaves, the room keeps the largest part of it and
 * is rebuilt from its own outline, so it never gathers slivers and never stands in two places.
 */
export function canonicalise(room: Room): Room | null {
  const r = room
  let ps = weld(piecesOf(r), 0.02)
    .map(facing)
    .filter((p) => p.length >= 3 && polyArea(p) > 1e-4)
  if (!ps.length) return null
  const parts = partsOf(ps)
  if (parts.length > 1)
    ps = parts.reduce((best, part) => (partArea(part) > partArea(best) ? part : best))
  const loops = chainWalls(outlineFrom(ps).segs)
  if (loops) {
    const rings = loops.map((l) => l.map((e) => e.a))
    const outer = rings.reduce((best, p) => (polyArea(p) > polyArea(best) ? p : best))
    // a room with a courtyard in it keeps its pieces; anything else is rebuilt from its outline
    const holes = rings.some((p) => p !== outer && polyArea(p) > 0.5)
    if (!holes) {
      const poly = simplifyLoop(outer)
      if (poly.length >= 3 && polyArea(poly) > 1e-3 && simplePoly(poly)) {
        const t = triangulate(poly)
        if (t.length) ps = t
      }
    }
  }
  r.pieces = ps
  return normalise(r)
}

/** The frame set to a part of itself: whatever falls outside is trimmed away. */
export function setFrame(r: Room, lx: number, ly: number, lw: number, lh: number): Room | null {
  if (!(r.pieces && r.pieces.length)) {
    setFrameOnly(r, lx, ly, lw, lh)
    return r
  }
  const box: Poly = [
    [lx, ly],
    [lx + lw, ly],
    [lx + lw, ly + lh],
    [lx, ly + lh],
  ]
  const kept = piecesOf(r)
    .map((p) => intersectConvex(p, box))
    .filter((p): p is Poly => !!p)
  setFrameOnly(r, lx, ly, lw, lh)
  r.pieces = kept.map((p) => tidy(p.map(([x, y]) => [x - lx, y - ly] as Point)))
  return canonicalise(r)
}

/** A shape stretched to a new size, which is what a typed dimension means. */
export function scaleTo(r: Room, lw: number, lh: number): void {
  const sx = lw / r.w
  const sy = lh / r.h
  if (r.pieces) r.pieces = r.pieces.map((p) => tidy(p.map(([x, y]) => [x * sx, y * sy] as Point)))
  if (r.doors)
    r.doors = r.doors.map((d) => ({ ...d, at: [r6(d.at[0] * sx), r6(d.at[1] * sy)] as Point }))
  if (r.labelAt) r.labelAt = [r6(r.labelAt[0] * sx), r6(r.labelAt[1] * sy)]
  setFrameOnly(r, 0, 0, lw, lh)
}

/** One room's footprint cut out of another's, exactly, slanted edges and all. */
export function cutBy(target: Room, cutter: Room): Room | null {
  const r = target
  const before = areaOf(r)
  let ps = piecesOf(r)
  for (const wp of worldPieces(cutter))
    ps = diffPieces(
      ps,
      wp.map(([x, y]) => toLocal(r, x, y)),
    )
  const after = ps.reduce((s, p) => s + polyArea(p), 0)
  if (before - after < 1e-6) return r
  if (after < 1) return null
  r.pieces = ps
  return canonicalise(r)
}

/** The room less everything past the setback line, where it stands. */
export function cutToSetback(
  room: Room,
  build: Box = BUILD,
  plot = PLOT,
): { room: Room | null; cut: boolean } {
  const r = room
  const B = build
  const M = 5
  const strips: Poly[] = [
    [
      [-M, -M],
      [B.x, -M],
      [B.x, plot.h + M],
      [-M, plot.h + M],
    ],
    [
      [B.x + B.w, -M],
      [plot.w + M, -M],
      [plot.w + M, plot.h + M],
      [B.x + B.w, plot.h + M],
    ],
    [
      [-M, -M],
      [plot.w + M, -M],
      [plot.w + M, B.y],
      [-M, B.y],
    ],
    [
      [-M, B.y + B.h],
      [plot.w + M, B.y + B.h],
      [plot.w + M, plot.h + M],
      [-M, plot.h + M],
    ],
  ]
  const before = areaOf(r)
  let ps = piecesOf(r)
  for (const st of strips)
    ps = diffPieces(
      ps,
      st.map(([x, y]) => toLocal(r, x, y)),
    )
  const after = ps.reduce((sum, p) => sum + polyArea(p), 0)
  if (before - after < 1e-6) return { room: r, cut: false }
  if (after < 1) return { room: null, cut: true }
  r.pieces = ps
  return { room: canonicalise(r), cut: true }
}

/**
 * A wall moved along its own normal. The two walls it meets follow it, so the room keeps one clean
 * outline instead of growing a stub; where the shape will not take it, the wall simply stops and
 * this returns null.
 */
export function pullWall(room: Room, seg: Seg, s: number): Room | null {
  const r = room
  if (Math.abs(s) < 1e-6) return null
  const loops = loopsOf(r)
  const loop = loops && loops.length === 1 ? loops[0]! : null
  const i = loop ? loop.findIndex((e) => same(e.a, seg.a) && same(e.b, seg.b)) : -1
  const n = seg.n
  if (loop && i >= 0 && loop.length >= 3) {
    const pts = loop.map((e) => e.a)
    const L = pts.length
    const j = (i + 1) % L
    const A: Point = [pts[i]![0] + s * n[0], pts[i]![1] + s * n[1]]
    const B: Point = [pts[j]![0] + s * n[0], pts[j]![1] + s * n[1]]
    const out = pts.slice()
    out[i] = meetLines(pts[(i + L - 1) % L]!, pts[i]!, A, B) ?? A
    out[j] = meetLines(pts[(j + 1) % L]!, pts[j]!, A, B) ?? B
    const poly = tidy(out)
    if (poly.length < 3 || polyArea(poly) < 1 || !simplePoly(poly)) return null
    r.pieces = triangulate(poly)
    return r
  }
  // A room with a hole in it has no single outline to follow: that wall moves as a strip.
  const [a, b] = [seg.a, seg.b]
  const quad = tidy([a, b, [b[0] + s * n[0], b[1] + s * n[1]], [a[0] + s * n[0], a[1] + s * n[1]]])
  let ps = piecesOf(r)
  if (s > 0) {
    let add: Poly[] = [facing(quad)]
    for (const p of ps) add = add.flatMap((x) => diffConvex(x, p))
    ps = ps.concat(add)
  } else ps = diffPieces(ps, quad)
  r.pieces = ps
  return r
}

// ---------- the walls as they stand on the plot ----------

/** Every wall of a room as it stands in the world, with the way out of the room. */
export function worldWalls(r: Room): Seg[] {
  const a = rad(r.angle || 0)
  const c = Math.cos(a)
  const sn = Math.sin(a)
  return outlineOf(r).map((w) => ({
    a: toWorld(r, w.a[0], w.a[1]),
    b: toWorld(r, w.b[0], w.b[1]),
    n: [w.n[0] * c - w.n[1] * sn, w.n[0] * sn + w.n[1] * c] as Point,
  }))
}

/** The corners of a room as it stands in the world: every end of every wall it shows. */
export const worldCorners = (r: Room): Point[] => worldWalls(r).map((w) => w.a)

export const worldN = (r: Room, n: Point): Point => {
  const a = rad(r.angle || 0)
  const c = Math.cos(a)
  const sn = Math.sin(a)
  return [n[0] * c - n[1] * sn, n[0] * sn + n[1] * c]
}

/** The wall's side of a plain room, when it is a whole side: those still drag a shared wall. */
export function sideOf(r: Room, seg: Seg): 'left' | 'right' | 'top' | 'bottom' | null {
  if (r.pieces && r.pieces.length) return null
  const t = 1e-6
  const [a, b] = [seg.a, seg.b]
  const full = (i: 0 | 1, hi: number) =>
    Math.abs(Math.min(a[i], b[i])) < t && Math.abs(Math.max(a[i], b[i]) - hi) < t
  if (full(1, r.h) && Math.abs(a[0]) < t && Math.abs(b[0]) < t) return 'left'
  if (full(1, r.h) && Math.abs(a[0] - r.w) < t && Math.abs(b[0] - r.w) < t) return 'right'
  if (full(0, r.w) && Math.abs(a[1]) < t && Math.abs(b[1]) < t) return 'top'
  if (full(0, r.w) && Math.abs(a[1] - r.h) < t && Math.abs(b[1] - r.h) < t) return 'bottom'
  return null
}

/** A room's angle set outright; a whole quarter turn is folded into its rectangle so it is square again. */
export function setAngle(r: Room, deg: number): void {
  let a = norm(deg)
  if (Math.abs(a - 360) < 1e-6) a = 0
  const quarter = Math.round(a / 90) * 90
  if (Math.abs(a - quarter) < 1e-6 && quarter % 360 !== 0) {
    const [cx, cy] = centreOf(r)
    const turns = (quarter / 90) % 4
    for (let t = 0; t < turns; t++) {
      const w = r.w
      const h = r.h
      r.w = h
      r.h = w
      if (r.pieces) r.pieces = r.pieces.map((p) => tidy(p.map(([x, y]) => [h - y, x] as Point)))
      if (r.doors)
        r.doors = r.doors.map((d) => ({ ...d, at: [r6(h - d.at[1]), r6(d.at[0])] as Point }))
      if (r.labelAt) r.labelAt = [r6(h - r.labelAt[1]), r6(r.labelAt[0])]
    }
    r.x = r6(cx - r.w / 2)
    r.y = r6(cy - r.h / 2)
    r.angle = 0
    return
  }
  r.angle = r2(a)
}

/** A room flipped about its own middle: its pieces, doors and angle all turn over. */
export function mirrorRoom(r: Room, axis: 'x' | 'y'): void {
  if (r.pieces && r.pieces.length)
    r.pieces = r.pieces.map((p) =>
      facing(p.map(([x, y]) => (axis === 'x' ? [r6(r.w - x), y] : [x, r6(r.h - y)]) as Point)),
    )
  if (r.doors)
    r.doors = r.doors.map((d) => ({
      ...d,
      at: (axis === 'x' ? [r6(r.w - d.at[0]), d.at[1]] : [d.at[0], r6(r.h - d.at[1])]) as Point,
      hinge: !d.hinge,
    }))
  if (r.labelAt)
    r.labelAt =
      axis === 'x' ? [r6(r.w - r.labelAt[0]), r.labelAt[1]] : [r.labelAt[0], r6(r.h - r.labelAt[1])]
  if (r.angle) r.angle = r2(norm(-r.angle))
}

/** A set of rooms turned as one about a point they share. */
export function rotateGroup(rs: Room[], deg: number, pivot: Point): void {
  const a = rad(deg)
  for (const r of rs) {
    const [cx, cy] = centreOf(r)
    const dx = cx - pivot[0]
    const dy = cy - pivot[1]
    const nx = pivot[0] + dx * Math.cos(a) - dy * Math.sin(a)
    const ny = pivot[1] + dx * Math.sin(a) + dy * Math.cos(a)
    setAngle(r, (r.angle || 0) + deg)
    r.x = r6(nx - r.w / 2)
    r.y = r6(ny - r.h / 2)
  }
}
