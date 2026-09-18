/**
 * Snapping. A room looks for walls that run with its own — any wall of any room, whatever the
 * carving left, the setback line and the plot boundary, and the storeys below and above. The nearest
 * pull within the snap distance wins, then the nearest again on a direction across it.
 */

import { DEFAULT_PLOT, type Box, type PlotSpec } from './plot'
import {
  acrossStoreys,
  centreOf,
  floorZ,
  heightOf,
  isOpen,
  square,
  stH,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  type Frame,
  type Point,
  type Room,
  type Settings,
  type Sheet,
} from './model'
import {
  canonicalise,
  meetLines,
  norm,
  outlineOf,
  overlapCells,
  pullWall,
  r2,
  r6,
  rad,
  snapTo,
  toLocal,
  toWorld,
  worldCorners,
  worldWalls,
  type Seg,
} from './geometry'
import { MAX_STOREYS } from './plot'
import { cloneRoom } from './model'

/** A line drawn on the sheet to show what a move lined up with. */
export type Guide = { x1: number; y1: number; x2: number; y2: number }

export type SnapMark = { corner?: Point; wall?: Seg; line?: boolean }

/** A guide is drawn right across the sheet, so it is longer than any plot the tool draws. */
const ACROSS = 200

/** The lines a wall may snap to besides rooms: the setback line, and the plot boundary. */
export const snapBoxes = (plot: PlotSpec = DEFAULT_PLOT): Box[] => [plot.build, plot.box]

export function wallCandidates(
  others: Room[],
  settings: Settings,
  plot: PlotSpec = DEFAULT_PLOT,
): Seg[] {
  const out: Seg[] = []
  for (const o of others) for (const w of worldWalls(o)) out.push(w)
  if (settings.snapBuild)
    for (const B of snapBoxes(plot)) {
      out.push(
        { a: [B.x, B.y], b: [B.x, B.y + B.h], n: [-1, 0] },
        { a: [B.x + B.w, B.y], b: [B.x + B.w, B.y + B.h], n: [1, 0] },
      )
      out.push(
        { a: [B.x, B.y], b: [B.x + B.w, B.y], n: [0, -1] },
        { a: [B.x, B.y + B.h], b: [B.x + B.w, B.y + B.h], n: [0, 1] },
      )
    }
  return out
}

/** Where a room rests when nothing caught it: on the grid, by its corner or by its centre. */
export function gridRest(r: Room, settings: Settings): Room {
  if (square(r))
    return { ...r, x: r6(snapTo(r.x, settings.grid)), y: r6(snapTo(r.y, settings.grid)) }
  const [cx, cy] = centreOf(r)
  return {
    ...r,
    x: r6(snapTo(cx, settings.grid) - r.w / 2),
    y: r6(snapTo(cy, settings.grid) - r.h / 2),
  }
}

/**
 * How far a wall being dragged should go so its line runs through a nearby corner of another room,
 * or lies on another room's parallel wall: the candidate nearest the hand within the snap distance.
 */
export function alignWall(
  frame: Frame,
  seg: Seg,
  sRaw: number,
  others: Room[],
  settings: Settings,
  plot: PlotSpec = DEFAULT_PLOT,
): { s: number; guide?: Guide; mark?: SnapMark } {
  const F = { ...frame }
  const a = toWorld(F, seg.a[0], seg.a[1])
  const b = toWorld(F, seg.b[0], seg.b[1])
  const c = Math.cos(rad(F.angle || 0))
  const sn = Math.sin(rad(F.angle || 0))
  const n: Point = [seg.n[0] * c - seg.n[1] * sn, seg.n[0] * sn + seg.n[1] * c]
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const u: Point = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  const t = (p: Point) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]
  const d = settings.snapDist
  if (!(d > 0)) return { s: sRaw }
  // Anything on the wall's own line counts, near the wall's run or far along it: a corner across the
  // plan still lines the wall up. What lies within the run is preferred when both are in reach.
  let best: { gap: number; s: number; mark: SnapMark; near: boolean } | null = null
  const consider = (off: number, mark: SnapMark, near: boolean) => {
    const gap = Math.abs(off - sRaw)
    if (gap > d) return
    if (!best || (near && !best.near) || (near === best.near && gap < best.gap))
      best = { gap, s: off, mark, near }
  }
  for (const o of others) {
    for (const p of worldCorners(o)) {
      const tt = t(p)
      consider(
        (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1],
        { corner: p },
        tt >= -0.5 && tt <= L + 0.5,
      )
    }
    for (const w of worldWalls(o)) {
      const wl = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
      if (Math.abs((u[0] * (w.b[1] - w.a[1]) - u[1] * (w.b[0] - w.a[0])) / wl) > 0.02) continue
      const w0 = Math.min(t(w.a), t(w.b))
      const w1 = Math.max(t(w.a), t(w.b))
      consider(
        (w.a[0] - a[0]) * n[0] + (w.a[1] - a[1]) * n[1],
        { wall: w },
        !(w1 < -0.5 || w0 > L + 0.5),
      )
    }
  }
  // A neighbour's wall at any angle: the dragged wall's own corners land on its line, within its run,
  // so a turned room still meets the walls round it.
  for (const o of others)
    for (const w of worldWalls(o)) {
      const wl = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
      const wu: Point = [(w.b[0] - w.a[0]) / wl, (w.b[1] - w.a[1]) / wl]
      if (Math.abs(wu[0] * u[1] - wu[1] * u[0]) < 0.02) continue // parallel walls are met above
      const den = n[0] * wu[1] - n[1] * wu[0]
      if (Math.abs(den) < 1e-6) continue
      for (const p of [a, b]) {
        // along the pull, where p meets the wall's line
        const s = ((w.a[0] - p[0]) * wu[1] - (w.a[1] - p[1]) * wu[0]) / den
        const q: Point = [p[0] + n[0] * s, p[1] + n[1] * s]
        const tw = (q[0] - w.a[0]) * wu[0] + (q[1] - w.a[1]) * wu[1]
        if (tw < -0.5 || tw > wl + 0.5) continue
        consider(s, { corner: q, line: true }, tw >= 0 && tw <= wl)
      }
    }
  // The setback line and the plot boundary: the dragged wall's own corners land on those lines,
  // whatever the wall's angle, and the boundary is there to meet even where building to it is off.
  if (settings.snapBuild)
    for (const B of snapBoxes(plot)) {
      for (const [axis, at] of [
        [0, B.x],
        [0, B.x + B.w],
        [1, B.y],
        [1, B.y + B.h],
      ] as [0 | 1, number][]) {
        if (Math.abs(n[axis]) < 1e-6) continue
        const lo = axis ? B.x : B.y
        const hi = axis ? B.x + B.w : B.y + B.h
        for (const p of [a, b]) {
          const s = (at - p[axis]) / n[axis]
          const q: Point = [p[0] + n[0] * s, p[1] + n[1] * s]
          const along = axis === 0 ? q[1] : q[0]
          if (along < lo - 0.5 || along > hi + 0.5) continue
          consider(s, { corner: q, line: true }, false)
        }
      }
    }
  if (!best) return { s: sRaw }
  const found: { gap: number; s: number; mark: SnapMark; near: boolean } = best
  const at: Point = [a[0] + n[0] * found.s, a[1] + n[1] * found.s]
  const reach = ACROSS
  const guide = {
    x1: r2(at[0] - u[0] * reach),
    y1: r2(at[1] - u[1] * reach),
    x2: r2(at[0] + u[0] * reach),
    y2: r2(at[1] + u[1] * reach),
  }
  return { s: r6(found.s), guide, mark: found.mark }
}

/** A room moved: corner to corner first, then wall to wall, then the grid. */
export function snapMove(
  r: Room,
  cands: Seg[],
  settings: Settings,
  plot: PlotSpec = DEFAULT_PLOT,
): { rect: Room; guides: Guide[]; corner?: Point } {
  const guides: Guide[] = []
  if (!(settings.snapDist > 0) || !cands.length) return { rect: gridRest(r, settings), guides }
  // corner to corner first: the nearest pair within reach carries the whole room
  let best: { dd: number; move: Point; at: Point } | null = null
  for (const c of worldCorners(r))
    for (const w of cands)
      for (const o of [w.a, w.b]) {
        const dd = Math.hypot(o[0] - c[0], o[1] - c[1])
        if (dd <= settings.snapDist && (!best || dd < best.dd))
          best = { dd, move: [o[0] - c[0], o[1] - c[1]], at: o }
      }
  if (best) {
    const hit: { dd: number; move: Point; at: Point } = best
    return {
      rect: { ...r, x: r6(r.x + hit.move[0]), y: r6(r.y + hit.move[1]) },
      guides,
      corner: hit.at,
    }
  }
  type Hit = { d: number; move: Point; n: Point; wall: { a: Point; b: Point }; corner?: Point }
  const hits: Hit[] = []
  // any corner within reach of the setback line or the boundary lands on it, a turned room too
  if (settings.snapBuild)
    for (const B of snapBoxes(plot))
      for (const c of worldCorners(r)) {
        for (const [X, nx] of [
          [B.x, -1],
          [B.x + B.w, 1],
        ] as [number, number][])
          if (c[1] > B.y - 0.5 && c[1] < B.y + B.h + 0.5 && Math.abs(X - c[0]) <= settings.snapDist)
            hits.push({
              d: Math.abs(X - c[0]),
              move: [X - c[0], 0],
              n: [nx, 0],
              wall: { a: [X, B.y], b: [X, B.y + B.h] },
              corner: c,
            })
        for (const [Y, ny] of [
          [B.y, -1],
          [B.y + B.h, 1],
        ] as [number, number][])
          if (c[0] > B.x - 0.5 && c[0] < B.x + B.w + 0.5 && Math.abs(Y - c[1]) <= settings.snapDist)
            hits.push({
              d: Math.abs(Y - c[1]),
              move: [0, Y - c[1]],
              n: [0, ny],
              wall: { a: [B.x, Y], b: [B.x + B.w, Y] },
              corner: c,
            })
      }
  for (const m of worldWalls(r)) {
    const ml = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) || 1
    const u: Point = [(m.b[0] - m.a[0]) / ml, (m.b[1] - m.a[1]) / ml]
    const t = ([x, y]: Point) => x * u[0] + y * u[1]
    const m0 = Math.min(t(m.a), t(m.b))
    const m1 = Math.max(t(m.a), t(m.b))
    for (const o of cands) {
      const ol = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1
      if (Math.abs((u[0] * (o.b[1] - o.a[1]) - u[1] * (o.b[0] - o.a[0])) / ol) > 0.02) continue
      const d = (o.a[0] - m.a[0]) * m.n[0] + (o.a[1] - m.a[1]) * m.n[1]
      if (Math.abs(d) > settings.snapDist) continue
      // the two walls have to face each other along their run, not merely lie on one line
      const o0 = Math.min(t(o.a), t(o.b))
      const o1 = Math.max(t(o.a), t(o.b))
      if (o0 > m1 + 0.5 || o1 < m0 - 0.5) continue
      hits.push({ d: Math.abs(d), move: [d * m.n[0], d * m.n[1]], n: m.n, wall: o })
    }
  }
  if (!hits.length) return { rect: gridRest(r, settings), guides }
  hits.sort((p, q) => p.d - q.d)
  const first = hits[0]!
  const second = hits.find((h) => Math.abs(h.n[0] * first.n[0] + h.n[1] * first.n[1]) < 0.7)
  let mx = first.move[0]
  let my = first.move[1]
  if (second) {
    mx += second.move[0]
    my += second.move[1]
  } else if (square(r)) {
    // one way is held by a wall; the other still rests on the grid
    if (Math.abs(first.n[1]) < 0.02) {
      const y = r.y + my
      my += r6(snapTo(y, settings.grid)) - y
    } else if (Math.abs(first.n[0]) < 0.02) {
      const x = r.x + mx
      mx += r6(snapTo(x, settings.grid)) - x
    }
  }
  for (const h of [first, second].filter((x): x is Hit => !!x)) {
    const u = [h.wall.b[0] - h.wall.a[0], h.wall.b[1] - h.wall.a[1]]
    const L = Math.hypot(u[0]!, u[1]!) || 1
    const ext = 1.5
    guides.push({
      x1: r2(h.wall.a[0] - (u[0]! / L) * ext),
      y1: r2(h.wall.a[1] - (u[1]! / L) * ext),
      x2: r2(h.wall.b[0] + (u[0]! / L) * ext),
      y2: r2(h.wall.b[1] + (u[1]! / L) * ext),
    })
  }
  return { rect: { ...r, x: r6(r.x + mx), y: r6(r.y + my) }, guides }
}

/**
 * Turning locks onto an angle a room nearby already stands at, before it falls back to the fixed
 * steps; the room it agreed with is named so it can be shown.
 */
export function snapAngle(
  a: number,
  exclude: Room[],
  onStorey: Room[],
  settings: Settings,
  north: number,
): { angle: number; locked: boolean; mate: Room | null } {
  a = norm(a)
  let best: { d: number; t: number; mate: Room } | null = null
  for (const o of onStorey) {
    if (exclude.includes(o)) continue
    for (let k = 0; k < 4; k++) {
      const t = norm((o.angle || 0) + k * 90)
      const d = Math.abs(((a - t + 540) % 360) - 180)
      if (d < 4 && (!best || d < best.d)) best = { d, t, mate: o }
    }
  }
  if (best) {
    const found: { d: number; t: number; mate: Room } = best
    return { angle: r2(found.t), locked: true, mate: found.mate }
  }
  const step = settings.rotSnap
  const base = settings.turnFrom === 'north' ? north : 0
  return {
    angle: r2(step > 0 ? norm(Math.round((a - base) / step) * step + base) : a),
    locked: false,
    mate: null,
  }
}

/**
 * A height pulled or slid snaps to the storey, to two storeys, and to the height of any other zone,
 * within 15 cm, and says what it agreed with.
 */
export function snapHeight(
  h: number,
  r: Room,
  sheet: Sheet,
  tol = 0.15,
): { h: number; why: string } {
  const { settings } = sheet
  const k = storeyOf(r)
  const across = acrossStoreys(r, settings)
  const targets: { h: number; why: string }[] = across
    ? []
    : [{ h: stH(settings, k), why: 'the floor above' }]
  if (!across && k + 1 < MAX_STOREYS)
    targets.push({ h: stH(settings, k) + stH(settings, k + 1), why: 'two storeys' })
  if (across)
    for (let i = 1; i <= storeyCountOf(sheet); i++)
      targets.push({
        h: floorZ(settings, i) - floorZ(settings, k),
        why: `the ${storeyNameOf(i - 1).toLowerCase()} storey's roof`,
      })
  for (const o of sheet.rooms)
    if (
      o !== r &&
      o.placed &&
      !o.fixed &&
      !isOpen(o) &&
      !acrossStoreys(o, settings) &&
      storeyOf(o) === k &&
      Math.abs(heightOf(o, sheet) - stH(settings, k)) > 0.01
    )
      targets.push({ h: heightOf(o, sheet), why: 'same as ' + o.name })
  let best: { h: number; why: string; d: number } | null = null
  for (const t of targets) {
    const d = Math.abs(t.h - h)
    if (d <= tol && (!best || d < best.d)) best = { ...t, d }
  }
  return best ? { h: r2(best.h), why: best.why } : { h: r2(snapTo(h, 0.1)), why: '' }
}

// ---------- drawing a point ----------

/** A wall's line drawn right through the sheet, so a point can line up with it from anywhere. */
export const guideOf = (w: { a: Point; b: Point }): Guide => {
  const u = [w.b[0] - w.a[0], w.b[1] - w.a[1]]
  const L = Math.hypot(u[0]!, u[1]!) || 1
  const ext = ACROSS
  const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]
  return {
    x1: r2(m[0]! - (u[0]! / L) * ext),
    y1: r2(m[1]! - (u[1]! / L) * ext),
    x2: r2(m[0]! + (u[0]! / L) * ext),
    y2: r2(m[1]! + (u[1]! / L) * ext),
  }
}

/**
 * The angles the rooms nearest a point stand at, each with its quarter turns, nearest room first;
 * the plot's own square comes last.
 */
export function anglesNear(pt: Point, onStorey: Room[]): number[] {
  const out: number[] = []
  const near = onStorey
    .map((r) => {
      const [cx, cy] = centreOf(r)
      return { a: norm(r.angle || 0), d: Math.hypot(cx - pt[0], cy - pt[1]) }
    })
    .sort((p, q) => p.d - q.d)
    .slice(0, 3)
  for (const n of near)
    for (let k = 0; k < 4; k++) {
      const a = norm(n.a + k * 90)
      if (!out.some((x) => Math.abs(x - a) < 1e-6)) out.push(a)
    }
  for (const a of [0, 90, 180, 270]) if (!out.some((x) => Math.abs(x - a) < 1e-6)) out.push(a)
  return out
}

export type SnapKind = 'corner' | 'meet' | 'wall' | 'line' | 'square' | 'angle' | 'grid' | 'free'

export type PointSnap = {
  at: Point
  guides: Guide[]
  kind: SnapKind
  marks: { type: 'corner' | 'square' | 'tick'; at: Point; u?: Point; n?: Point }[]
  ray?: { from: Point; angle: number; length: number }
}

const gridPt = ([x, y]: Point, settings: Settings): Point => [
  r6(snapTo(x, settings.grid || 0.05)),
  r6(snapTo(y, settings.grid || 0.05)),
]

/**
 * A drawn point pulled onto what is already there, and told what it caught: a corner of any room
 * first, then where two wall lines meet, then the nearest wall (or its line carried past its end),
 * then the direction of a neighbouring room's walls from the last corner, and last the grid. Shift
 * held leaves the point exactly where the pointer is.
 */
export function snapPoint(
  pt: Point,
  cands: Seg[],
  from: Point | null,
  shift: boolean,
  settings: Settings,
  onStorey: Room[],
): PointSnap {
  const grid = gridPt(pt, settings)
  const d = settings.snapDist
  if (shift) return { at: [r6(pt[0]), r6(pt[1])], guides: [], kind: 'free', marks: [] }
  const withAngle = (res: PointSnap): PointSnap => {
    if (!from || res.kind !== 'grid') return res
    const dx = pt[0] - from[0]
    const dy = pt[1] - from[1]
    const len = Math.hypot(dx, dy)
    if (len < 0.3) return res
    const want = norm((Math.atan2(dy, dx) * 180) / Math.PI)
    for (const a of anglesNear(pt, onStorey)) {
      const diff = Math.abs(((want - a + 540) % 360) - 180)
      if (diff > 4) continue
      const u = [Math.cos(rad(a)), Math.sin(rad(a))]
      const along = snapTo(dx * u[0]! + dy * u[1]!, settings.grid || 0.05)
      if (along <= 0.05) continue
      return {
        at: [r6(from[0] + u[0]! * along), r6(from[1] + u[1]! * along)],
        guides: [],
        kind: 'angle',
        marks: [],
        ray: { from, angle: a, length: along },
      }
    }
    return res
  }
  if (!(d > 0) || !cands.length) return withAngle({ at: grid, guides: [], kind: 'grid', marks: [] })
  // Square to a wall, both ways: the last corner sits on a wall, so a guide rises from it at a right
  // angle and the point rides that guide; or the point comes near a wall, and the foot of the
  // perpendicular from the last corner onto it is where the new side meets it square.
  const rise: { w: Seg; n: Point }[] = []
  if (settings.snapSquare && from)
    for (const w of cands) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
      const u: Point = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
      const t = (from[0] - w.a[0]) * u[0] + (from[1] - w.a[1]) * u[1]
      const off = (from[0] - w.a[0]) * -u[1] + (from[1] - w.a[1]) * u[0]
      if (Math.abs(off) < 0.03 && t >= -0.02 && t <= L + 0.02) rise.push({ w, n: [-u[1], u[0]] })
    }
  const reach = ACROSS
  const squareLine = (o: [number, number, number, number]): Guide => ({
    x1: r2(o[0] - o[2] * reach),
    y1: r2(o[1] - o[3] * reach),
    x2: r2(o[0] + o[2] * reach),
    y2: r2(o[1] + o[3] * reach),
  })
  let corner: { c: Point; dd: number; w: Seg } | null = null
  for (const w of cands)
    for (const c of [w.a, w.b]) {
      const dd = Math.hypot(c[0] - pt[0], c[1] - pt[1])
      if (dd <= d && (!corner || dd < corner.dd)) corner = { c, dd, w }
    }
  if (corner) {
    const hit: { c: Point; dd: number; w: Seg } = corner
    return {
      at: [r6(hit.c[0]), r6(hit.c[1])],
      guides: [guideOf(hit.w)],
      kind: 'corner',
      marks: [{ type: 'corner', at: hit.c }],
    }
  }
  const hits: { dd: number; w: Seg; u: Point; off: number; onWall: boolean }[] = []
  for (const w of cands) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
    const u: Point = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
    const t = (pt[0] - w.a[0]) * u[0] + (pt[1] - w.a[1]) * u[1]
    const off = (pt[0] - w.a[0]) * -u[1] + (pt[1] - w.a[1]) * u[0]
    if (Math.abs(off) > d) continue
    hits.push({ dd: Math.abs(off), w, u, off, onWall: t >= -0.02 && t <= L + 0.02 })
  }
  // riding the guide that rises square from the last corner's wall
  let ride: { g: { w: Seg; n: Point }; along: number; off: number } | null = null
  if (from)
    for (const g of rise) {
      const along = (pt[0] - from[0]) * g.n[0] + (pt[1] - from[1]) * g.n[1]
      const off = (pt[0] - from[0]) * -g.n[1] + (pt[1] - from[1]) * g.n[0]
      if (
        Math.abs(off) <= d &&
        Math.abs(along) > 0.05 &&
        (!ride || Math.abs(off) < Math.abs(ride.off))
      )
        ride = { g, along, off }
    }
  if (!hits.length) {
    if (ride && from) {
      const r = ride
      const along = snapTo(r.along, settings.grid || 0.05)
      const at: Point = [from[0] + r.g.n[0] * along, from[1] + r.g.n[1] * along]
      return {
        at: [r6(at[0]), r6(at[1])],
        guides: [squareLine([from[0], from[1], r.g.n[0], r.g.n[1]])],
        kind: 'square',
        marks: [{ type: 'square', at: from, u: [r.g.n[1], -r.g.n[0]], n: r.g.n }],
      }
    }
    return withAngle({ at: grid, guides: [], kind: 'grid', marks: [] })
  }
  // a wall itself before its line carried on, then the nearest
  hits.sort((p, q) => Number(q.onWall) - Number(p.onWall) || p.dd - q.dd)
  const first = hits[0]!
  if (settings.snapSquare && from) {
    // landing square: the foot of the perpendicular from the last corner onto the wall in reach
    for (const h of hits) {
      const w = h.w
      const u = h.u
      const tf = (from[0] - w.a[0]) * u[0] + (from[1] - w.a[1]) * u[1]
      const foot: Point = [w.a[0] + u[0] * tf, w.a[1] + u[1] * tf]
      const gap = Math.hypot(foot[0] - pt[0], foot[1] - pt[1])
      if (gap > d || Math.hypot(foot[0] - from[0], foot[1] - from[1]) < 0.05) continue
      const n: Point = [-u[1], u[0]]
      return {
        at: [r6(foot[0]), r6(foot[1])],
        guides: [guideOf(w), squareLine([foot[0], foot[1], n[0], n[1]])],
        kind: 'square',
        marks: [
          {
            type: 'square',
            at: foot,
            u,
            n: (from[0] - foot[0]) * n[0] + (from[1] - foot[1]) * n[1] >= 0 ? n : [-n[0], -n[1]],
          },
        ],
      }
    }
    // riding the rising guide across a wall line: where the two meet
    if (ride && Math.abs(ride.g.n[0] * first.u[0] + ride.g.n[1] * first.u[1]) < 0.999) {
      const m = meetLines(
        from,
        [from[0] + ride.g.n[0], from[1] + ride.g.n[1]],
        first.w.a,
        first.w.b,
      )
      if (m && Math.hypot(m[0] - pt[0], m[1] - pt[1]) <= d)
        return {
          at: [r6(m[0]), r6(m[1])],
          guides: [guideOf(first.w), squareLine([from[0], from[1], ride.g.n[0], ride.g.n[1]])],
          kind: 'meet',
          marks: [{ type: 'corner', at: m }],
        }
    }
  }
  let at: Point = [pt[0] - first.off * -first.u[1], pt[1] - first.off * first.u[0]]
  const second = hits.find((h) => Math.abs(h.u[0] * first.u[0] + h.u[1] * first.u[1]) < 0.7)
  const guides = [guideOf(first.w)]
  if (second) {
    const m = meetLines(first.w.a, first.w.b, second.w.a, second.w.b)
    if (m) {
      at = m
      guides.push(guideOf(second.w))
      return { at: [r6(at[0]), r6(at[1])], guides, kind: 'meet', marks: [{ type: 'corner', at }] }
    }
  }
  const g = settings.grid || 0.05
  if (Math.abs(first.u[0]) > 0.999) at[0] = snapTo(at[0], g)
  else if (Math.abs(first.u[1]) > 0.999) at[1] = snapTo(at[1], g)
  else {
    const t = (at[0] - first.w.a[0]) * first.u[0] + (at[1] - first.w.a[1]) * first.u[1]
    const ts = snapTo(t, g)
    at = [first.w.a[0] + first.u[0] * ts, first.w.a[1] + first.u[1] * ts]
  }
  return {
    at: [r6(at[0]), r6(at[1])],
    guides,
    kind: first.onWall ? 'wall' : 'line',
    marks: [{ type: 'tick', at, u: first.u }],
  }
}

// ---------- gaps: a wall that nearly meets a neighbour's is pulled onto it ----------

/** The facing walls of two rooms closer than the setting, with how far apart they stand. */
export function nearWalls(a: Room, b: Room, upTo: number): { d: number; seg: Seg }[] {
  const out: { d: number; seg: Seg }[] = []
  const wa = worldWalls(a)
  const la = outlineOf(a)
  const wb = worldWalls(b)
  for (let i = 0; i < wa.length; i++) {
    const m = wa[i]!
    const ml = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) || 1
    const u: Point = [(m.b[0] - m.a[0]) / ml, (m.b[1] - m.a[1]) / ml]
    const t = ([x, y]: Point) => x * u[0] + y * u[1]
    const m0 = Math.min(t(m.a), t(m.b))
    const m1 = Math.max(t(m.a), t(m.b))
    for (const o of wb) {
      const ol = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1
      if (Math.abs((u[0] * (o.b[1] - o.a[1]) - u[1] * (o.b[0] - o.a[0])) / ol) > 0.02) continue
      if (m.n[0] * o.n[0] + m.n[1] * o.n[1] > -0.9) continue // the walls must face each other
      const d = (o.a[0] - m.a[0]) * m.n[0] + (o.a[1] - m.a[1]) * m.n[1]
      if (d < 0.004 || d > upTo) continue // apart, and by a gap not a wall
      const o0 = Math.min(t(o.a), t(o.b))
      const o1 = Math.max(t(o.a), t(o.b))
      if (Math.min(m1, o1) - Math.max(m0, o0) < 0.3) continue // and overlap along their run
      out.push({ d, seg: la[i]! })
    }
  }
  return out
}

/**
 * Every gap under the setting closed, the room placed last giving way. The rooms given are changed
 * in place, as the actions' own copy of the sheet; the ids of the rooms it moved come back.
 */
export function closeGaps(all: Room[], only: Room | null, settings: Settings): Set<string> {
  const upTo = settings.closeGap
  const done = new Set<string>()
  if (!(upTo > 0)) return done
  for (let pass = 0; pass < 3; pass++) {
    let any = false
    for (const a of all) {
      if (a.fixed || a.locked || !a.placed) continue
      if (only && a !== only) continue
      for (const b of all) {
        if (b === a || !b.placed) continue
        // the newer wall moves, never the older
        if (!only && (a.placedAt ?? 0) < (b.placedAt ?? 0)) continue
        const near = nearWalls(a, b, upTo)
        if (!near.length) continue
        const was = cloneRoom(a)
        const g = near.sort((p, q) => q.d - p.d)[0]!
        const ok = pullWall(a, g.seg, g.d)
        let alive = true
        if (ok) alive = !!canonicalise(a)
        const clash =
          !ok ||
          !alive ||
          !a.placed ||
          all.some((o) => o !== a && o.placed && overlapCells(a, o).length)
        if (clash) {
          Object.assign(a, was)
          continue
        }
        done.add(a.id)
        any = true
      }
    }
    if (!any) break
  }
  return done
}

/** A drawn point never leaves the plot, and stays on the floor when rooms are held in. */
export function onPlot(at: Point, box: Box): Point {
  return [
    r6(Math.min(Math.max(at[0], box.x), box.x + box.w)),
    r6(Math.min(Math.max(at[1], box.y), box.y + box.h)),
  ]
}

export const localPoint = (r: Room, p: Point): Point => toLocal(r, p[0], p[1])
