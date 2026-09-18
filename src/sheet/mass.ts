/**
 * The mass beside the sheet, as numbers: where the camera puts a point of the world, the volumes the
 * storeys stand as, and the order of wall lines that draws them back to front, exact from any angle.
 * Nothing here draws; the view reads these and makes an element of each face.
 */

import { PLOT } from './plot'
import {
  allPlaced,
  heightCap,
  isOpen,
  piecesOf,
  zBase,
  zTop,
  type Point,
  type Poly,
  type Room,
  type Sheet,
} from './model'
import {
  facing,
  loopsOf,
  polyArea,
  rad,
  toWorld,
  triangulate,
  worldWalls,
  type Seg,
} from './geometry'
import { snapHeight } from './snap'

/** Where the eye stands: the turn round the plot, the tilt above the ground, the wheel and the pan. */
export type MassCamera = { theta: number; phi: number; zoom: number; px: number; py: number }

export const MASS_START: MassCamera = { theta: 35, phi: 32, zoom: 1, px: 0, py: 0 }

export type MassViewName = 'plan' | 'service' | 'side' | 'corner'

/** The four views the mock offers, each read from where a person would stand to look at the house. */
export const MASS_VIEWS: Record<MassViewName, { label: string; theta: number; phi: number }> = {
  plan: { label: 'Plan', theta: 0, phi: 89 },
  service: { label: 'Service street', theta: 0, phi: 28 },
  side: { label: 'Side street', theta: -90, phi: 28 },
  corner: { label: "Neighbours' corner", theta: 135, phi: 32 },
}

export const MIN_TILT = 8
export const MAX_TILT = 89

export const lookFrom = (cam: MassCamera, view: MassViewName): MassCamera => ({
  ...cam,
  theta: MASS_VIEWS[view].theta,
  phi: MASS_VIEWS[view].phi,
  px: 0,
  py: 0,
})

export const turnedBy = (cam: MassCamera, dx: number, dy: number): MassCamera => ({
  ...cam,
  theta: cam.theta + dx * 0.4,
  phi: Math.min(MAX_TILT, Math.max(MIN_TILT, cam.phi + dy * 0.3)),
})

export const zoomedBy = (cam: MassCamera, deltaY: number): MassCamera => ({
  ...cam,
  zoom: Math.min(4, Math.max(0.5, cam.zoom * Math.exp(-deltaY * 0.0015))),
})

export const recentred = (cam: MassCamera): MassCamera => ({ ...cam, px: 0, py: 0, zoom: 1 })

/** The blind wall on the boundary is dark, and red where it stands higher than the rulebook's 5 m. */
export const BLIND_BREACH = 5

export type MassProjection = {
  W: number
  H: number
  /** Pixels to the metre. */
  s: number
  /** Where the middle of the plot lands, and the two angles: enough to invert the drawing. */
  ox: number
  oy: number
  th: number
  ph: number
  /** A point of the world on the screen: across, down, and how near the eye it lies. */
  to: (x: number, y: number, z: number) => [number, number, number]
  /** The point of the ground a pixel stands over. */
  ground: (X: number, Y: number) => Point
  /** Which way the eye looks, on the ground. */
  viewDir: Point
  /** How many pixels a metre of height takes up the screen. */
  rise: number
}

/**
 * The camera as one parallel projection. The scale comes from the plot's diagonal alone, so turning
 * or tilting never zooms the mass; only the wheel does.
 */
export function massProjection(cam: MassCamera, W = 600, H = 400): MassProjection {
  const th = rad(cam.theta)
  const ph = rad(cam.phi)
  const cx = PLOT.w / 2
  const cy = PLOT.h / 2
  const diag = Math.hypot(PLOT.w, PLOT.h)
  const s = Math.min((W - 40) / diag, (H - 40) / (diag * 0.85)) * cam.zoom
  const ox = W / 2 + cam.px
  const oy = H / 2 + 1.6 * s * Math.cos(ph) + cam.py
  return {
    W,
    H,
    s,
    ox,
    oy,
    th,
    ph,
    to: (x, y, z) => {
      const u = (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th)
      const v = -(x - cx) * Math.sin(th) + (y - cy) * Math.cos(th)
      return [ox + u * s, oy + (v * Math.sin(ph) - z * Math.cos(ph)) * s, v]
    },
    ground: (X, Y) => {
      const u = (X - ox) / s
      const v = (Y - oy) / s / Math.max(0.05, Math.sin(ph))
      return [cx + u * Math.cos(th) - v * Math.sin(th), cy + u * Math.sin(th) + v * Math.cos(th)]
    },
    viewDir: [-Math.sin(th), Math.cos(th)],
    rise: s * Math.cos(ph),
  }
}

/** The largest loop of a room's outline, in plot metres: what its shadow and its handles are drawn on. */
export function worldLoop(r: Room): Poly {
  const loops = loopsOf(r)
  const pts: Poly =
    loops && loops.length
      ? loops
          .reduce((best, l) => (l.length > best.length ? l : best), loops[0]!)
          .map((e: Seg) => e.a)
      : [
          [0, 0],
          [r.w, 0],
          [r.w, r.h],
          [0, r.h],
        ]
  return pts.map(([x, y]) => toWorld(r, x, y))
}

/** What the view turns about: the middle of what is selected, else the middle of the plot. */
export function massPivot(sheet: Sheet, ids: string[]): [number, number, number] {
  const sel = allPlaced(sheet).filter((r) => ids.includes(r.id) && !r.fixed)
  if (!sel.length) return [PLOT.w / 2, PLOT.h / 2, 0]
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let z = Infinity
  for (const r of sel) {
    z = Math.min(z, zBase(r, sheet.settings))
    for (const p of worldLoop(r)) {
      x0 = Math.min(x0, p[0])
      y0 = Math.min(y0, p[1])
      x1 = Math.max(x1, p[0])
      y1 = Math.max(y1, p[1])
    }
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2, z]
}

/** A wall of one block: where it runs, which way it faces, and whether it is a wall of the room. */
export type MassEdge = {
  a: Point
  b: Point
  n: Point
  /** True where this edge is a wall of the room, not a cut through the middle of its footprint. */
  outline: boolean
  /** How much the wall turns toward the eye: positive is seen, negative is away. */
  facing: number
}

/** One convex block of a room, standing between two levels. */
export type Prism = {
  room: Room
  z0: number
  h: number
  poly: Poly
  edges: MassEdge[]
  depth: number
  onOutline: (p: Point, q: Point) => boolean
}

const onPlotEdge = (p: Point) =>
  Math.abs(p[0]) < 0.03 ||
  Math.abs(p[0] - PLOT.w) < 0.03 ||
  Math.abs(p[1]) < 0.03 ||
  Math.abs(p[1] - PLOT.h) < 0.03

/** A wall along the plot boundary: blind, and over 5 m a breach of the rulebook. */
export const blindWall = (a: Point, b: Point) => onPlotEdge(a) && onPlotEdge(b)

export const breaches = (top: number) => top > BLIND_BREACH + 0.001

function prismOf(
  room: Room,
  poly: Poly,
  z0: number,
  h: number,
  onOutline: (p: Point, q: Point) => boolean,
  P: MassProjection,
): Prism {
  const cx = poly.reduce((x, q) => x + q[0], 0) / poly.length
  const cy = poly.reduce((y, q) => y + q[1], 0) / poly.length
  const vd = P.viewDir
  const edges = poly.map((p, i): MassEdge => {
    const q = poly[(i + 1) % poly.length]!
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    let n: Point = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L]
    if ((cx - p[0]) * n[0] + (cy - p[1]) * n[1] > 0) n = [-n[0], -n[1]]
    return { a: p, b: q, n, outline: onOutline(p, q), facing: n[0] * vd[0] + n[1] * vd[1] }
  })
  return { room, z0, h, poly, edges, depth: P.to(cx, cy, 0)[2], onOutline }
}

/** Whether the point lies on one of the room's own walls, so a seam through a carve is not drawn. */
function outlineTest(r: Room): (p: Point, q: Point) => boolean {
  const walls = worldWalls(r)
  return (p, q) => {
    const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    return walls.some((w) => {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
      const u: Point = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
      const t = (m[0] - w.a[0]) * u[0] + (m[1] - w.a[1]) * u[1]
      const d = Math.abs(-(m[0] - w.a[0]) * u[1] + (m[1] - w.a[1]) * u[0])
      return d < 0.015 && t > -0.015 && t < L + 0.015
    })
  }
}

const convex = (poly: Poly) => {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    const o = poly[(i + 2) % poly.length]!
    if ((q[0] - p[0]) * (o[1] - q[1]) - (q[1] - p[1]) * (o[0] - q[0]) < -1e-6) return false
  }
  return true
}

/**
 * Every placed room as a set of convex blocks, each standing from its storey's floor to its top. An
 * open-plan area lies flat on the ground and is left to the view to draw under everything.
 */
export function prismsOf(sheet: Sheet, P: MassProjection): Prism[] {
  const out: Prism[] = []
  for (const r of allPlaced(sheet)) {
    if (isOpen(r)) continue
    const z0 = zBase(r, sheet.settings)
    const h = zTop(r, sheet)
    const onOutline = outlineTest(r)
    const pieces = piecesOf(r)
      .map((pc) => facing(pc).map(([x, y]) => toWorld(r, x, y)) as Poly)
      .flatMap((pc) => (convex(pc) ? [pc] : triangulate(pc)))
    for (const pc of pieces)
      if (pc.length >= 3 && polyArea(pc) >= 1e-4) out.push(prismOf(r, pc, z0, h, onOutline, P))
  }
  return out
}

type Tree = { leaf: Prism[] } | { line: MassEdge; front: Tree; back: Tree }

const sideOfLine = (line: MassEdge, p: Point) =>
  (p[0] - line.a[0]) * line.n[0] + (p[1] - line.a[1]) * line.n[1]

/** The part of a polygon on one side of a line: `sign` 1 is the side the normal points to. */
function clipSide(poly: Poly, line: MassEdge, sign: number): Poly {
  const out: Poly = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!
    const prev = poly[(i + poly.length - 1) % poly.length]!
    const sc = sign * sideOfLine(line, cur)
    const sp = sign * sideOfLine(line, prev)
    const meet = (): Point => {
      const t = sp / (sp - sc)
      return [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
    }
    if (sc >= 0) {
      if (sp < 0) out.push(meet())
      out.push(cur)
    } else if (sp >= 0) out.push(meet())
  }
  return out.length >= 3 ? out : []
}

const TREE_DEPTH = 40

/** Which sides of a line a block's corners fall on, read without building a list of them. */
function sides(poly: Poly, line: MassEdge): { front: boolean; back: boolean } {
  let front = false
  let back = false
  for (const p of poly) {
    const v = sideOfLine(line, p)
    if (v > 0.01) front = true
    else if (v < -0.01) back = true
    if (front && back) break
  }
  return { front, back }
}

function build(items: Prism[], left: number, P: MassProjection): Tree {
  if (items.length <= 1 || left <= 0) return { leaf: items }
  let best: { line: MassEdge; score: number } | null = null
  for (const it of items)
    for (const e of it.edges) {
      let front = 0
      let back = 0
      let cut = 0
      for (const o of items) {
        const { front: f, back: bk } = sides(o.poly, e)
        if (f && bk) cut++
        else if (f) front++
        else back++
      }
      if (front + cut === 0 || back + cut === 0) continue // parts nothing
      const score = cut * 4 + Math.abs(front - back)
      if (!best || score < best.score) best = { line: e, score }
    }
  if (!best) return { leaf: items }
  const line = best.line
  const F: Prism[] = []
  const Bk: Prism[] = []
  for (const o of items) {
    const { front: f, back: bk } = sides(o.poly, line)
    if (!bk) F.push(o)
    else if (!f) Bk.push(o)
    else {
      const pf = clipSide(o.poly, line, 1)
      const pb = clipSide(o.poly, line, -1)
      if (pf.length >= 3 && polyArea(pf) > 1e-4)
        F.push(prismOf(o.room, facing(pf), o.z0, o.h, o.onOutline, P))
      if (pb.length >= 3 && polyArea(pb) > 1e-4)
        Bk.push(prismOf(o.room, facing(pb), o.z0, o.h, o.onOutline, P))
    }
  }
  return { line, front: build(F, left - 1, P), back: build(Bk, left - 1, P) }
}

/**
 * The blocks in drawing order, far to near. Every wall line parts the blocks into two sides, cutting
 * any block it crosses, until no line parts what is left; read back to front for this view, the tree
 * is exact for any angle, turned rooms and all. Blocks left together stand over one another, and
 * there the higher one is in front of an eye that looks down. `undecided` names those groups.
 */
export function orderPrisms(
  prisms: Prism[],
  P: MassProjection,
): {
  order: Prism[]
  undecided: string[][]
} {
  const vd = P.viewDir
  const tree = build(prisms, TREE_DEPTH, P)
  const order: Prism[] = []
  const undecided: string[][] = []
  const walk = (node: Tree): void => {
    if ('leaf' in node) {
      const l = node.leaf.slice().sort((x, y) => x.z0 - y.z0 || x.depth - y.depth)
      if (l.length > 1) undecided.push(l.map((o) => o.room.name))
      order.push(...l)
      return
    }
    const f = node.line.n[0] * vd[0] + node.line.n[1] * vd[1]
    if (f >= 0) {
      walk(node.back)
      walk(node.front)
    } else {
      walk(node.front)
      walk(node.back)
    }
  }
  walk(tree)
  return { order, undecided }
}

/** The walls of one block the eye can see, the nearest drawn last. */
export function seenWalls(prism: Prism, P: MassProjection): MassEdge[] {
  const depth = (e: MassEdge) => P.to((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 0)[2]
  return prism.edges.filter((e) => e.outline && e.facing > 0).sort((x, y) => depth(x) - depth(y))
}

/**
 * The height a pull on the post asks for: the drag in pixels read as metres, held between 2.5 m and
 * the room's cap, then snapped to the storeys and to the heights already standing.
 */
export function heightFromDrag(
  r: Room,
  sheet: Sheet,
  from: number,
  dY: number,
  rise: number,
): { h: number; why: string } {
  const step = Math.max(1, rise)
  const want = Math.min(heightCap(r, sheet.settings), Math.max(2.5, from - dY / step))
  return snapHeight(want, r, sheet, Math.max(0.15, 5 / step))
}
