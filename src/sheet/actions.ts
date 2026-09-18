/**
 * Every change to the sheet as one named call. Each takes the sheet and its input and gives back a
 * sheet — the same one, untouched, when the change is refused — and a result saying what happened in
 * the mock's own words. The views, the tests and the layout agent all drive these and nothing else.
 */

import { MAX_STOREYS, type Box } from './plot'
import {
  DEFAULTS,
  acrossStoreys,
  centreOf,
  cloneRoom,
  cloneSheet,
  doorsOf,
  isOpen,
  kin,
  piecesOf,
  placedRooms,
  ruleOf,
  storeyCountOf,
  storeyNameOf,
  storeyOf,
  type Door,
  type DoorType,
  type Point,
  type Poly,
  type Room,
  type Settings,
  type Sheet,
} from './model'
import {
  areaOf,
  bboxOf,
  canonicalise,
  cutToSetback as cutShapeToSetback,
  diffPieces,
  facing,
  fmt,
  insideConvex,
  loopsOf,
  mirrorRoom,
  norm,
  outlineFrom,
  outlineOf,
  partArea,
  partsOf,
  polyArea,
  pullWall as pullWallShape,
  r2,
  r6,
  rotateGroup,
  scaleTo,
  setAngle,
  setFrame,
  setFrameOnly,
  simplePoly,
  snapTo,
  tidy,
  toLocal,
  toWorld,
  triangulate,
  unionBox,
  weld,
  worldPieces,
  type Seg,
} from './geometry'
import {
  alignWall,
  closeGaps,
  gridRest,
  onPlot,
  snapAngle,
  snapHeight,
  snapMove,
  wallCandidates,
} from './snap'
import { snapRooms } from './model'
import { allowedBox, hold, overlapsOf, resolve, settle, type Give } from './settle'
import {
  bestNeighbour,
  courtWhy,
  givePieces,
  pocketsOf,
  roomFromPocket,
  type Pocket,
} from './pockets'
import {
  doorAt,
  doorPlace,
  openWall as openWallOf,
  setDoorWidth as widthOfDoor,
  slideDoor as slideDoorAlong,
} from './doors'
import { DOOR, KINDS, KIND_INFO, hasHinge, hasSwing, sizeFor } from './sample'

export type Result = {
  ok: boolean
  said: string
  at?: Box
  moved?: string[]
  retired?: string[]
  born?: string[]
  area?: number
}

export type Change = { sheet: Sheet; result: Result }

const where = (r: Room): Box => {
  const b = bboxOf(r)
  return { x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h) }
}

const landed = (r: Room) =>
  `${r.name} at ${fmt(bboxOf(r).x)},${fmt(bboxOf(r).y)} ${fmt(bboxOf(r).w)}×${fmt(bboxOf(r).h)}`

const nextClock = (sheet: Sheet) => Math.max(0, ...sheet.rooms.map((r) => r.placedAt ?? 0)) + 1

/** An id nothing on the sheet has yet, made the same way twice. */
function freshId(prefix: string, taken: Set<string>): string {
  let i = 1
  while (taken.has(prefix + i)) i++
  return prefix + i
}

const roomIds = (sheet: Sheet) => new Set(sheet.rooms.map((r) => r.id))
const doorIds = (sheet: Sheet) => new Set(sheet.rooms.flatMap((r) => doorsOf(r).map((d) => d.id)))

const found = (sheet: Sheet, id: string) => sheet.rooms.find((r) => r.id === id) ?? null

/** The rooms a gesture has in hand, on the storey it is on. */
const takeRooms = (sheet: Sheet, ids: string[], storey: number) =>
  placedRooms(sheet, storey).filter((r) => ids.includes(r.id))

/** A room put back in the program: its shape, its turn and its doors go, its target size returns. */
export function sendBackRoom(sheet: Sheet, r: Room): void {
  if (r.extra) {
    sheet.rooms = sheet.rooms.filter((o) => o !== r)
    return
  }
  r.placed = false
  r.pieces = null
  r.angle = 0
  delete r.lost
  delete r.storey
  delete r.doors
  delete r.group
  delete r.labelAt
  const s = sizeFor(r.kind, r.target, sheet.settings)
  r.w = s.w
  r.h = s.h
}

/** Rooms a cut left with nothing go back to the program; the sheet's own rooms simply go. */
function tidyTray(sheet: Sheet): string[] {
  const gone: string[] = []
  for (const r of [...sheet.rooms])
    if (!r.placed && (r.pieces || r.angle || r.doors || r.extra)) {
      gone.push(r.name)
      sendBackRoom(sheet, r)
    }
  return gone
}

/**
 * After a room moves: the landing rule settles what it now overlaps, every room it moved is held on
 * the plot, and the gaps it left are closed.
 */
function afterChange(sheet: Sheet, storey: number, r: Room): string[] {
  const moved = settle(r, sheet.settings.rule, sheet, storey)
  if (moved.size)
    for (const o of placedRooms(sheet, storey))
      if (moved.has(o.id)) Object.assign(o, hold(o, sheet, storey))
  if (r.placed && !r.fixed) closeGaps(placedRooms(sheet, storey), r, sheet.settings)
  tidyTray(sheet)
  return [...moved.keys()]
}

const edit = (sheet: Sheet, fn: (next: Sheet) => Result): Change => {
  const next = cloneSheet(sheet)
  const result = fn(next)
  return result.ok ? { sheet: next, result } : { sheet, result }
}

// ---------- placing and moving ----------

export type PlaceInput = {
  id: string
  x: number
  y: number
  storey: number
  angle?: number
  w?: number
  h?: number
}

/** Dropped from the program: it snaps to walls, corners and lines, is held inside, and lands. */
export function place(sheet: Sheet, input: PlaceInput): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r) return { ok: false, said: `no room called ${input.id}` }
    if (r.locked || r.fixed) return { ok: false, said: `${r.name} is locked` }
    if (!Number.isFinite(input.x) || !Number.isFinite(input.y))
      return { ok: false, said: `${r.name}: x and y are needed` }
    if (input.w && input.h && input.w > 0.5 && input.h > 0.5 && input.w < 30 && input.h < 30) {
      if (r.placed) scaleTo(r, r2(input.w), r2(input.h))
      else {
        r.w = r2(input.w)
        r.h = r2(input.h)
      }
    }
    if (!r.placed) {
      r.placed = true
      r.storey = input.storey
      r.pieces = null
      r.angle = 0
      delete r.lost
    }
    if (input.angle !== undefined && Number.isFinite(input.angle)) setAngle(r, input.angle)
    r.x = r6(input.x)
    r.y = r6(input.y)
    const sm = snapMove(
      r,
      wallCandidates(snapRooms(next, input.storey, r), next.settings, next.plot),
      next.settings,
      next.plot,
    )
    r.x = sm.rect.x
    r.y = sm.rect.y
    Object.assign(r, hold(r, next, input.storey))
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: landed(r), at: where(r), moved }
  })
}

export type MoveInput = {
  ids: string[]
  dx: number
  dy: number
  storey: number
  axisLock?: boolean
}

/** Dragged: the same snaps and hold, and a group moves as one. */
export function move(sheet: Sheet, input: MoveInput): Change {
  return edit(sheet, (next) => {
    const group = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed && !r.locked)
    const lead = group[0]
    if (!lead) return { ok: false, said: 'nothing to move' }
    const from = group.map((r) => ({ r, x: r.x, y: r.y }))
    const dx = input.axisLock && Math.abs(input.dy) > Math.abs(input.dx) ? 0 : input.dx
    const dy = input.axisLock && Math.abs(input.dx) >= Math.abs(input.dy) ? 0 : input.dy
    const cands = wallCandidates(
      snapRooms(next, input.storey, null).filter((o) => !input.ids.includes(o.id)),
      next.settings,
      next.plot,
    )
    const sm = snapMove(
      { ...lead, x: lead.x + dx, y: lead.y + dy },
      cands,
      next.settings,
      next.plot,
    )
    const held = hold(sm.rect, next, input.storey)
    const mx = held.x - lead.x
    const my = held.y - lead.y
    for (const g of from) {
      g.r.x = r6(g.x + mx)
      g.r.y = r6(g.y + my)
    }
    for (const g of from) Object.assign(g.r, hold(g.r, next, input.storey))
    const clock = nextClock(next)
    for (const g of from) g.r.placedAt = clock
    const moved = afterChange(next, input.storey, lead)
    return { ok: true, said: landed(lead), at: where(lead), moved }
  })
}

export type TurnInput = {
  ids: string[]
  storey: number
  angle?: number
  quarter?: boolean
  pivot?: Point
  faceNorth?: boolean
}

/** The knob, R, or Face north: it snaps to a neighbour's angle within 4°, else to the step. */
export function turn(sheet: Sheet, input: TurnInput): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed && !r.locked)
    const lead = sel[0]
    if (!lead) return { ok: false, said: 'nothing to turn' }
    const onStorey = placedRooms(next, input.storey)
    if (input.faceNorth) {
      const off = norm((lead.angle || 0) - next.plot.north)
      const k = Math.round(off / 90) % 4
      const aligned = Math.abs(off - Math.round(off / 90) * 90) < 0.5
      const want = aligned ? next.plot.north + ((k + 1) % 4) * 90 : next.plot.north
      if (sel.length === 1 && !input.pivot) setAngle(lead, want)
      else rotateGroup(sel, norm(want - (lead.angle || 0)), input.pivot ?? middleOf(sel))
    } else if (input.quarter) {
      if (sel.length === 1 && !input.pivot) {
        setAngle(lead, (lead.angle || 0) + 90)
        if (!lead.angle) {
          lead.x = r6(snapTo(lead.x, next.settings.grid))
          lead.y = r6(snapTo(lead.y, next.settings.grid))
        }
      } else rotateGroup(sel, 90, input.pivot ?? middleOf(sel))
    } else {
      const want = snapAngle(
        input.angle ?? lead.angle ?? 0,
        sel,
        onStorey,
        next.settings,
        next.plot.north,
      )
      if (sel.length === 1 && !input.pivot) setAngle(lead, want.angle)
      else rotateGroup(sel, want.angle - (lead.angle || 0), input.pivot ?? middleOf(sel))
    }
    const clock = nextClock(next)
    for (const r of sel) {
      Object.assign(r, hold(r, next, input.storey))
      r.placedAt = clock
    }
    const moved: string[] = []
    for (const r of sel) if (r.placed) moved.push(...afterChange(next, input.storey, r))
    return {
      ok: true,
      said: `${lead.name} at ${Math.round(norm(lead.angle || 0))}°`,
      at: where(lead),
      moved,
    }
  })
}

const middleOf = (sel: Room[]): Point => {
  const b = sel.length === 1 ? bboxOf(sel[0]!) : unionBox(sel)
  return [b.x + b.w / 2, b.y + b.h / 2]
}

export function mirror(
  sheet: Sheet,
  input: { ids: string[]; axis: 'x' | 'y'; storey: number },
): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed && !r.locked)
    if (!sel.length) return { ok: false, said: 'nothing to mirror' }
    const clock = nextClock(next)
    for (const r of sel) {
      mirrorRoom(r, input.axis)
      r.placedAt = clock
    }
    const moved: string[] = []
    for (const r of sel) moved.push(...afterChange(next, input.storey, r))
    return {
      ok: true,
      said: `${sel.map((r) => r.name).join(', ')} mirrored ${input.axis === 'x' ? 'left to right' : 'top to bottom'}`,
      moved,
    }
  })
}

// ---------- walls, corners and sizes ----------

export type WallInput = { id: string; wall: number; distance: number; storey: number }

/** One wall along its normal, the two it meets following, aligned to what is in reach. */
export function pullWall(sheet: Sheet, input: WallInput): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    if (r.locked || r.fixed) return { ok: false, said: `${r.name} is locked` }
    const seg = outlineOf(r)[input.wall]
    if (!seg) return { ok: false, said: `${r.name} has no such wall` }
    const frame = { x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle || 0 }
    const before = cloneRoom(r)
    const others = snapRooms(next, input.storey, r)
    const al = alignWall(frame, seg, input.distance, others, next.settings, next.plot)
    const g = next.settings.grid || 0.05
    let s = al.guide ? al.s : r2(snapTo(input.distance, g))
    const step = s >= 0 ? g : -g
    for (let guard = 0; guard < 400; guard++) {
      Object.assign(r, cloneRoom(before))
      if (Math.abs(s) < 1e-6) break
      if (pullWallShape(r, seg, s)) {
        if (canonicalise(r)) break
      }
      s = r2(s - step)
    }
    if (Math.abs(s) < 1e-6) return { ok: false, said: 'That wall cannot move there.' }
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return {
      ok: true,
      said: `${r.name} ${fmt(areaOf(r))} m²`,
      at: where(r),
      moved,
      area: r2(areaOf(r)),
    }
  })
}

export function moveCorner(
  sheet: Sheet,
  input: { id: string; corner: number; point: Point; storey: number },
): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    const loops = r.pieces && r.pieces.length ? loopsOf(r) : null
    if (!loops || loops.length !== 1)
      return { ok: false, said: 'Only a carved or drawn room has corners to move.' }
    const loop = loops[0]!.map((e) => e.a)
    if (!loop[input.corner]) return { ok: false, said: `${r.name} has no such corner` }
    const lp = toLocal(r, input.point[0], input.point[1])
    const poly = loop.map((pt, j) => (j === input.corner ? ([r6(lp[0]), r6(lp[1])] as Point) : pt))
    if (!simplePoly(poly) || polyArea(poly) < 1)
      return { ok: false, said: 'That shape is too small or crosses itself.' }
    r.pieces = triangulate(poly)
    if (!canonicalise(r)) {
      sendBackRoom(next, r)
      return { ok: true, said: `${r.name} went back to the program`, retired: [r.name] }
    }
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: `${r.name} ${fmt(areaOf(r))} m²`, at: where(r), moved }
  })
}

export type Side4 = 'left' | 'right' | 'top' | 'bottom'

/** A plain room's side; with `shared`, the neighbour it shares that wall with follows. */
export function resize(
  sheet: Sheet,
  input: { id: string; side: Side4; distance: number; shared?: string; storey: number },
): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    if (r.locked || r.fixed) return { ok: false, said: `${r.name} is locked` }
    const f = { x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle || 0 }
    const shared = input.shared ? found(next, input.shared) : null
    const sf = shared ? { x: shared.x, y: shared.y, w: shared.w, h: shared.h } : null
    const sides: Record<Side4, Seg> = {
      right: { a: [f.w, 0], b: [f.w, f.h], n: [1, 0] },
      left: { a: [0, 0], b: [0, f.h], n: [-1, 0] },
      bottom: { a: [0, f.h], b: [f.w, f.h], n: [0, 1] },
      top: { a: [0, 0], b: [f.w, 0], n: [0, -1] },
    }
    const al = alignWall(
      f,
      sides[input.side],
      input.distance,
      placedRooms(next, input.storey).filter((o) => o !== r && o !== shared),
      next.settings,
      next.plot,
    )
    const g = next.settings.grid || 0.05
    const out = al.guide ? al.s : r2(snapTo(input.distance, g))
    let lx = 0
    let ly = 0
    let lw = f.w
    let lh = f.h
    if (input.side === 'right') lw = Math.max(1, r2(f.w + out))
    if (input.side === 'bottom') lh = Math.max(1, r2(f.h + out))
    if (input.side === 'left') {
      lx = Math.min(r2(-out), f.w - 1)
      lw = r2(f.w - lx)
    }
    if (input.side === 'top') {
      ly = Math.min(r2(-out), f.h - 1)
      lh = r2(f.h - ly)
    }
    if (!setFrame(r, lx, ly, lw, lh)) {
      sendBackRoom(next, r)
      return { ok: true, said: `${r.name} went back to the program`, retired: [r.name] }
    }
    if (shared && sf) {
      if (input.side === 'right') {
        shared.x = r.x + r.w
        shared.w = Math.max(1, r2(sf.x + sf.w - shared.x))
      }
      if (input.side === 'left') shared.w = Math.max(1, r2(r.x - sf.x))
      if (input.side === 'bottom') {
        shared.y = r.y + r.h
        shared.h = Math.max(1, r2(sf.y + sf.h - shared.y))
      }
      if (input.side === 'top') shared.h = Math.max(1, r2(r.y - sf.y))
    }
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: `${r.name} ${fmt(r.w)} × ${fmt(r.h)} m`, at: where(r), moved }
  })
}

/** A typed dimension: the shape scales to it. */
export function setSize(
  sheet: Sheet,
  input: { id: string; w?: number; h?: number; storey: number },
): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    const g = next.settings.grid || 0.05
    const w = input.w === undefined ? r.w : r2(snapTo(input.w, g))
    const h = input.h === undefined ? r.h : r2(snapTo(input.h, g))
    if (!(w > 0.5 && w < 30 && h > 0.5 && h < 30))
      return { ok: false, said: 'A side must be between 0.5 and 30 m.' }
    scaleTo(r, w, h)
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: `${r.name} ${fmt(r.w)} × ${fmt(r.h)} m`, at: where(r), moved }
  })
}

/** A typed area: the shape scales about its middle to that area, proportions kept. */
export function setArea(sheet: Sheet, input: { id: string; area: number; storey: number }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    if (!(input.area >= 1 && input.area <= 400))
      return { ok: false, said: 'An area must be between 1 and 400 m².' }
    const k = Math.sqrt(input.area / areaOf(r))
    const [cx, cy] = centreOf(r)
    scaleTo(r, r2(r.w * k), r2(r.h * k))
    const [nx, ny] = centreOf(r)
    r.x = r6(r.x + cx - nx)
    r.y = r6(r.y + cy - ny)
    Object.assign(r, hold(r, next, input.storey))
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return {
      ok: true,
      said: `${r.name} ${fmt(areaOf(r))} m²`,
      at: where(r),
      moved,
      area: r2(areaOf(r)),
    }
  })
}

// ---------- drawing and reshaping ----------

export type DrawInput = {
  id: string
  polygon: Poly
  shape: 'rect' | 'circle' | 'poly'
  storey: number
}

/** A rectangle, a circle or a polygon drawn as the room's footprint. */
export function draw(sheet: Sheet, input: DrawInput): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r) return { ok: false, said: `no room called ${input.id}` }
    const outline = tidy(facing(input.polygon))
    if (outline.length < 3 || polyArea(outline) < 1 || !simplePoly(outline))
      return { ok: false, said: 'That shape is too small or crosses itself; nothing was placed.' }
    const xs = outline.map((p) => p[0])
    const ys = outline.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    r.x = r6(x)
    r.y = r6(y)
    r.w = r6(Math.max(...xs) - x)
    r.h = r6(Math.max(...ys) - y)
    r.angle = 0
    delete r.lost
    const local = outline.map(([px, py]) => [r6(px - x), r6(py - y)] as Point)
    r.pieces =
      input.shape === 'rect' ? null : input.shape === 'circle' ? [local] : triangulate(local)
    if (r.pieces && !r.pieces.length) r.pieces = null
    r.placed = true
    r.storey = input.storey
    r.placedAt = nextClock(next)
    Object.assign(r, hold(r, next, input.storey))
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: landed(r), at: where(r), moved, area: r2(areaOf(r)) }
  })
}

/**
 * A boundary drawn on the room: what overlaps is taken away, a touching shape outside is added, and
 * a stroke that cuts the room in two leaves the larger part and splits the smaller into the program.
 */
export function reshape(
  sheet: Sheet,
  input: { id: string; polygon: Poly; storey: number },
): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed || r.fixed || r.locked || isOpen(r))
      return { ok: false, said: 'That room cannot be reshaped.' }
    const outline = tidy(facing(input.polygon))
    if (outline.length < 3 || polyArea(outline) < 0.05 || !simplePoly(outline))
      return { ok: false, said: 'That shape is too small or crosses itself.' }
    const local = tidy(outline.map(([x, y]) => toLocal(r, x, y)))
    const tris = triangulate(local).filter((p) => polyArea(p) > 1e-4)
    if (!tris.length) return { ok: false, said: 'That shape is too small or crosses itself.' }
    const before = areaOf(r)
    let kept = piecesOf(r)
    for (const t of tris) kept = diffPieces(kept, t)
    kept = kept.filter((p) => p.length >= 3 && polyArea(p) > 1e-4)
    const after = kept.reduce((sum, p) => sum + polyArea(p), 0)
    const overlap = before - after
    if (overlap >= 0.05) {
      if (after < 0.5) return { ok: false, said: 'That would take the whole room away.' }
      const parts = partsOf(weld(kept, 0.02).map(facing)).sort((a, b) => partArea(b) - partArea(a))
      r.pieces = parts[0]!.map((p) => tidy(p.slice()))
      const inPart = (part: Poly[], pt: Point) => part.some((p) => insideConvex(p, pt[0], pt[1]))
      const born: Room[] = []
      const taken = roomIds(next)
      let clock = nextClock(next)
      for (const part of parts.slice(1)) {
        if (partArea(part) < 0.5) continue // a sliver is not a room
        const id = freshId('n', taken)
        taken.add(id)
        const nr: Room = {
          id,
          name: `${r.name}, cut`,
          kind: r.kind,
          cat: r.cat,
          target: r2(partArea(part)),
          w: r.w,
          h: r.h,
          x: r.x,
          y: r.y,
          angle: r.angle || 0,
          placed: true,
          placedAt: clock++,
          storey: storeyOf(r),
          pieces: part.map((p) => tidy(p.slice())),
        }
        const ds = doorsOf(r).filter((d) => inPart(part, d.at))
        if (ds.length) nr.doors = ds.map((d) => ({ ...d }))
        born.push(nr)
      }
      if (born.length) {
        const moved = new Set(born.flatMap((nr) => doorsOf(nr).map((d) => d.id)))
        r.doors = doorsOf(r).filter((d) => !moved.has(d.id))
        if (!r.doors.length) delete r.doors
      }
      if (!canonicalise(r)) {
        sendBackRoom(next, r)
        return { ok: true, said: `${r.name} went back to the program`, retired: [r.name] }
      }
      const alive = born.filter((nr) => canonicalise(nr))
      next.rooms.splice(next.rooms.indexOf(r) + 1, 0, ...alive)
      r.placedAt = nextClock(next)
      const movedIds = afterChange(next, input.storey, r)
      return {
        ok: true,
        said: `${fmt(overlap)} m² taken away${alive.length ? `; ${alive.map((nr) => nr.name).join(', ')} split off into the program` : ''}.`,
        area: r2(overlap),
        born: alive.map((nr) => nr.name),
        moved: movedIds,
        at: where(r),
      }
    }
    // outside: what the shape adds is the shape less the room, welded on only where it touches
    let add = tris
    for (const rp of piecesOf(r)) add = diffPieces(add, rp)
    add = add.filter((p) => p.length >= 3 && polyArea(p) > 1e-4)
    const addArea = add.reduce((sum, p) => sum + polyArea(p), 0)
    if (addArea < 0.05)
      return { ok: false, said: 'The shape does not touch the room, so nothing changed.' }
    const all = weld([...piecesOf(r), ...add], 0.03)
      .map(facing)
      .filter((p) => p.length >= 3 && polyArea(p) > 1e-4)
    if (partsOf(all).length > 1)
      return { ok: false, said: 'The shape does not touch the room, so nothing changed.' }
    r.pieces = all
    if (!canonicalise(r)) {
      sendBackRoom(next, r)
      return { ok: true, said: `${r.name} went back to the program`, retired: [r.name] }
    }
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return { ok: true, said: `${fmt(addArea)} m² added.`, area: r2(addArea), moved, at: where(r) }
  })
}

// ---------- settling an overlap by hand ----------

function settleByHand(sheet: Sheet, ids: string[], storey: number, how: Give): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, ids, storey)
    if (!sel.length) return { ok: false, said: 'nothing selected' }
    const moved = new Map<string, true>()
    let any = false
    for (const s of sel)
      for (const o of overlapsOf(next, storey).filter((x) => (x.a === s) !== (x.b === s))) {
        const loser = o.a === s ? o.b : o.a
        if (sel.includes(loser)) continue
        if (loser.fixed || loser.locked) continue
        any = true
        if (how === 'push') {
          const m = resolve(s, 'push', next, storey)
          for (const [k, v] of m) moved.set(k, v)
        } else {
          resolve(s, how, next, storey)
        }
      }
    if (!any) return { ok: false, said: 'Nothing lies under it.' }
    for (const o of placedRooms(next, storey))
      if (moved.has(o.id)) Object.assign(o, hold(o, next, storey))
    const retired = tidyTray(next)
    return {
      ok: true,
      said: how === 'push' ? 'the zones under it slid aside' : 'the zones under it were carved',
      moved: [...moved.keys()],
      retired,
    }
  })
}

export const carveBelow = (sheet: Sheet, input: { ids: string[]; storey: number }) =>
  settleByHand(sheet, input.ids, input.storey, 'carve')

export const pushOthers = (sheet: Sheet, input: { ids: string[]; storey: number }) =>
  settleByHand(sheet, input.ids, input.storey, 'push')

/** What lies past the setback line goes. */
export function cutToSetback(sheet: Sheet, input: { ids: string[]; storey: number }): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed)
    if (!sel.length) return { ok: false, said: 'nothing selected' }
    const names: string[] = []
    const retired: string[] = []
    for (const r of sel) {
      const out = cutShapeToSetback(r, next.plot)
      if (!out.cut) continue
      if (!out.room) {
        retired.push(r.name)
        sendBackRoom(next, r)
        continue
      }
      names.push(r.name)
      r.placedAt = nextClock(next)
      afterChange(next, input.storey, r)
    }
    if (!names.length && !retired.length)
      return { ok: false, said: 'Nothing stands past the setback line.' }
    return {
      ok: true,
      said: `${[...names, ...retired].join(', ')} cut by the setback`,
      retired,
    }
  })
}

/** The room's shape and the size a cut took, given back. */
export function restore(sheet: Sheet, input: { id: string; storey: number }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed || r.fixed) return { ok: false, said: 'no such room on the sheet' }
    const can =
      !!(r.pieces && r.pieces.length) || !!(r.lost && (r.lost.w > 1e-6 || r.lost.h > 1e-6))
    if (!can) return { ok: false, said: `${r.name} has nothing to restore.` }
    r.pieces = null
    if (r.lost) {
      const { w, h } = r.lost
      r.lost = null
      setFrameOnly(r, r2(-w / 2), r2(-h / 2), r2(r.w + w), r2(r.h + h))
      r.lost = null
    }
    r.placedAt = nextClock(next)
    const moved = afterChange(next, input.storey, r)
    return {
      ok: true,
      said: `${r.name} ${fmt(areaOf(r))} m²`,
      area: r2(areaOf(r)),
      at: where(r),
      moved,
    }
  })
}

/**
 * The selected rooms welded into one: the survivor keeps its name, kind, target and doors, takes the
 * others' footprints and doors, and the others go back to the program. They must share a wall.
 */
export function combine(
  sheet: Sheet,
  input: { ids: string[]; survivor: string; storey: number },
): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed)
    const S = sel.find((r) => r.id === input.survivor)
    if (!S || sel.length < 2) return { ok: false, said: 'Pick the room that survives.' }
    const others = sel.filter((o) => o !== S)
    const mine = piecesOf(S).map((p) => p.slice())
    let theirs: Poly[] = []
    for (const O of others)
      theirs.push(...worldPieces(O).map((wp) => tidy(wp.map(([x, y]) => toLocal(S, x, y)))))
    theirs = weldToLines(theirs, outlineOf(S), 0.04)
    const ps = [...weldToLines(mine, outlineFrom(theirs).segs, 0.04), ...theirs]
    const welded = weld(ps, 0.03)
      .map(facing)
      .filter((p) => p.length >= 3 && polyArea(p) > 1e-4)
    if (partsOf(welded).length > 1)
      return {
        ok: false,
        said: 'Those rooms do not share a wall, so they cannot be combined. Close the gap first.',
      }
    for (const O of others) {
      for (const d of doorsOf(O)) {
        const w = toWorld(O, d.at[0], d.at[1])
        const l = toLocal(S, w[0], w[1])
        S.doors = [...doorsOf(S), { ...d, at: [r6(l[0]), r6(l[1])] }]
      }
      sendBackRoom(next, O)
    }
    S.pieces = welded
    if (!canonicalise(S)) {
      sendBackRoom(next, S)
      return { ok: true, said: `${S.name} went back to the program`, retired: [S.name] }
    }
    S.placedAt = nextClock(next)
    return {
      ok: true,
      said: `${others.map((o) => o.name).join(', ')} combined into ${S.name}`,
      at: where(S),
      area: r2(areaOf(S)),
      retired: others.map((o) => o.name),
    }
  })
}

/** Corners pulled onto wall lines they all but sit on, so a shared wall reads as one line. */
function weldToLines(pieces: Poly[], segs: Seg[], tol: number): Poly[] {
  return pieces.map((p) =>
    tidy(
      p.map((pt) => {
        let q = pt
        for (const sg of segs) {
          const u = [sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]]
          const L = Math.hypot(u[0]!, u[1]!) || 1
          const ux = u[0]! / L
          const uy = u[1]! / L
          const off = (q[0] - sg.a[0]) * -uy + (q[1] - sg.a[1]) * ux
          const t = (q[0] - sg.a[0]) * ux + (q[1] - sg.a[1]) * uy
          if (Math.abs(off) <= tol && Math.abs(off) > 1e-9 && t > -tol && t < L + tol)
            q = [r6(q[0] + uy * off), r6(q[1] - ux * off)]
        }
        return q
      }),
    ),
  )
}

// ---------- groups, locks and the program ----------

export function group(sheet: Sheet, input: { ids: string[]; storey: number }): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey).filter((r) => !r.fixed)
    if (sel.length < 2) return { ok: false, said: 'Two rooms at least make a group.' }
    const g = freshId('g', new Set(next.rooms.map((r) => r.group ?? '')))
    const onStorey = placedRooms(next, input.storey)
    for (const o of sel) for (const m of kin(o, onStorey)) m.group = g
    return { ok: true, said: `${sel.length} rooms grouped` }
  })
}

export function ungroup(sheet: Sheet, input: { ids: string[]; storey: number }): Change {
  return edit(sheet, (next) => {
    const sel = takeRooms(next, input.ids, input.storey)
    const gs = new Set(sel.map((o) => o.group).filter(Boolean))
    if (!gs.size) return { ok: false, said: 'Nothing here is grouped.' }
    for (const o of next.rooms) if (o.group && gs.has(o.group)) delete o.group
    return { ok: true, said: 'ungrouped' }
  })
}

const setLock = (sheet: Sheet, ids: string[], storey: number, on: boolean): Change =>
  edit(sheet, (next) => {
    const sel = takeRooms(next, ids, storey).filter((r) => !r.fixed)
    if (!sel.length) return { ok: false, said: 'nothing selected' }
    for (const o of sel) o.locked = on
    return {
      ok: true,
      said: `${sel.map((o) => o.name).join(', ')} ${on ? 'locked in place' : 'unlocked'}`,
    }
  })

export const lock = (sheet: Sheet, input: { ids: string[]; storey: number }) =>
  setLock(sheet, input.ids, input.storey, true)

export const unlock = (sheet: Sheet, input: { ids: string[]; storey: number }) =>
  setLock(sheet, input.ids, input.storey, false)

/** Off the sheet, back to the program. */
export function sendBack(sheet: Sheet, input: { ids: string[] }): Change {
  return edit(sheet, (next) => {
    const sel = next.rooms.filter((r) => input.ids.includes(r.id) && r.placed && !r.locked)
    if (!sel.length) return { ok: false, said: 'nothing to send back' }
    const names = sel.map((r) => r.name)
    for (const r of sel) sendBackRoom(next, r)
    return { ok: true, said: `sent back: ${names.join(', ')}`, retired: names }
  })
}

export function addRoom(
  sheet: Sheet,
  input: { kind: string; name?: string; size?: 'big' | 'medium' | 'small'; area?: number },
): Change {
  return edit(sheet, (next) => {
    const info = KIND_INFO[input.kind]
    const kind = KINDS[input.kind]
    if (!info || !kind) return { ok: false, said: `no kind called ${input.kind}` }
    const [label, lo, hi] = info
    const target =
      input.area !== undefined
        ? input.area
        : input.size === 'big'
          ? hi
          : input.size === 'small'
            ? lo
            : r2((lo + hi) / 2)
    if (!(target > 0)) return { ok: false, said: 'A room needs an area.' }
    const s = sizeFor(input.kind, target, next.settings)
    const r: Room = {
      id: freshId('n', roomIds(next)),
      name: input.name?.trim() || label,
      kind: input.kind,
      cat: kind.cat,
      target,
      w: s.w,
      h: s.h,
      x: 0,
      y: 0,
      angle: 0,
      pieces: null,
      placed: false,
    }
    next.rooms.push(r)
    return { ok: true, said: `${r.name} added to the program, ${fmt(target)} m²` }
  })
}

export function removeRoom(sheet: Sheet, input: { id: string }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r) return { ok: false, said: `no room called ${input.id}` }
    if (r.placed) sendBackRoom(next, r)
    next.rooms = next.rooms.filter((o) => o.id !== input.id)
    return { ok: true, said: `${r.name} taken out of the program` }
  })
}

/** The program order is the order of importance: a room moved before another, or to the end. */
export function reorder(sheet: Sheet, input: { id: string; before: string | null }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r) return { ok: false, said: `no room called ${input.id}` }
    if (input.before === input.id) return { ok: false, said: 'A room cannot move before itself.' }
    next.rooms = next.rooms.filter((o) => o !== r)
    const at = input.before ? next.rooms.findIndex((o) => o.id === input.before) : -1
    if (input.before && at < 0) return { ok: false, said: `no room called ${input.before}` }
    if (at < 0) next.rooms.push(r)
    else next.rooms.splice(at, 0, r)
    return { ok: true, said: `${r.name} is now ${next.rooms.indexOf(r) + 1} in the program` }
  })
}

// ---------- storeys and heights ----------

export function setStorey(
  sheet: Sheet,
  input: { ids: string[]; storey: number; to: number },
): Change {
  return edit(sheet, (next) => {
    const to = Math.max(0, Math.min(storeyCountOf(next) - 1, Math.floor(input.to)))
    const sel = takeRooms(next, input.ids, input.storey).filter(
      (r) => !acrossStoreys(r, next.settings) && !r.fixed,
    )
    if (!sel.length) return { ok: false, said: 'The stair stands on every storey already.' }
    const clock = nextClock(next)
    for (const o of sel) {
      o.storey = to
      Object.assign(o, hold(o, next, to))
      o.placedAt = clock
    }
    const moved: string[] = []
    for (const o of sel) moved.push(...afterChange(next, to, o))
    return {
      ok: true,
      said: `${sel.map((o) => o.name).join(', ')} on the ${storeyNameOf(to).toLowerCase()} storey`,
      moved,
    }
  })
}

/** A copy, one storey up or down or beside itself, with "copy" in its name. */
export function copyTo(
  sheet: Sheet,
  input: { ids: string[]; storey: number; to: number; shift?: number },
): Change {
  return edit(sheet, (next) => {
    const to = Math.max(0, Math.min(MAX_STOREYS - 1, Math.floor(input.to)))
    const sel = takeRooms(next, input.ids, input.storey).filter(
      (r) => !r.fixed && !acrossStoreys(r, next.settings),
    )
    if (!sel.length) return { ok: false, said: 'nothing to copy' }
    const shift = input.shift ?? (to === input.storey ? 1 : 0)
    const taken = roomIds(next)
    const made: Room[] = []
    let clock = nextClock(next)
    for (const src of sel) {
      const r = cloneRoom(src)
      r.id = freshId('p', taken)
      taken.add(r.id)
      r.name = /\bcopy\b/.test(r.name) ? r.name : r.name + ' copy'
      r.storey = to
      r.placed = true
      r.locked = false
      delete r.group
      delete r.doors
      delete r.labelAt
      r.x = r6(r.x + shift)
      r.y = r6(r.y + shift)
      r.placedAt = clock++
      next.rooms.push(r)
      made.push(r)
    }
    const moved: string[] = []
    for (const r of made) {
      Object.assign(r, hold(r, next, to))
      moved.push(...afterChange(next, to, r))
    }
    return {
      ok: true,
      said: `${made.map((r) => r.name).join(', ')}`,
      born: made.map((r) => r.name),
      moved,
    }
  })
}

export function addStorey(sheet: Sheet): Change {
  return edit(sheet, (next) => {
    if (storeyCountOf(next) >= MAX_STOREYS)
      return { ok: false, said: 'The rulebook allows three floors.' }
    next.storeyCount = storeyCountOf(next) + 1
    return { ok: true, said: `${storeyNameOf(next.storeyCount - 1)} storey added` }
  })
}

export function dropTopStorey(sheet: Sheet): Change {
  return edit(sheet, (next) => {
    const n = storeyCountOf(next)
    if (n <= 2) return { ok: false, said: 'The ground and the first storey stay.' }
    if (next.rooms.some((r) => r.placed && storeyOf(r) === n - 1))
      return { ok: false, said: `The ${storeyNameOf(n - 1).toLowerCase()} storey is not empty.` }
    next.storeyCount = n - 1
    return { ok: true, said: `${storeyNameOf(n - 1)} storey taken away` }
  })
}

/** Snaps to the floor above, two storeys, another zone's height; capped, the stair at its own top. */
export function setHeight(sheet: Sheet, input: { id: string; metres: number }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    const sn = snapHeight(input.metres, r, next)
    r.height = sn.h
    return { ok: true, said: `${r.name} ${fmt(sn.h)} m${sn.why ? ' · ' + sn.why : ''}` }
  })
}

export function clearHeight(sheet: Sheet, input: { id: string }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.height) return { ok: false, said: 'That room keeps its storey height already.' }
    delete r.height
    return { ok: true, said: `${r.name} back to the storey height` }
  })
}

// ---------- a room's own colour, and where its name is written ----------

export function setColor(sheet: Sheet, input: { ids: string[]; color: string }): Change {
  return edit(sheet, (next) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(input.color))
      return { ok: false, said: 'A colour is written as #rrggbb.' }
    const sel = next.rooms.filter((r) => input.ids.includes(r.id) && !r.fixed)
    if (!sel.length) return { ok: false, said: 'nothing selected' }
    for (const r of sel) r.color = input.color
    return { ok: true, said: `${sel.map((r) => r.name).join(', ')} in ${input.color}` }
  })
}

export function clearColor(sheet: Sheet, input: { ids: string[] }): Change {
  return edit(sheet, (next) => {
    const sel = next.rooms.filter((r) => input.ids.includes(r.id) && r.color)
    if (!sel.length) return { ok: false, said: 'Those rooms keep their category colour already.' }
    for (const r of sel) delete r.color
    return { ok: true, said: `${sel.map((r) => r.name).join(', ')} back to the category colour` }
  })
}

/** The name written where the hand put it, as a point in the room's frame. */
export function setLabel(sheet: Sheet, input: { id: string; at: Point }): Change {
  return edit(sheet, (next) => {
    const r = found(next, input.id)
    if (!r || !r.placed) return { ok: false, said: 'no such room on the sheet' }
    r.labelAt = [r6(input.at[0]), r6(input.at[1])]
    return { ok: true, said: `${r.name}: the name moved` }
  })
}

export function clearLabel(sheet: Sheet, input: { ids: string[] }): Change {
  return edit(sheet, (next) => {
    const sel = next.rooms.filter((r) => input.ids.includes(r.id) && r.labelAt)
    if (!sel.length) return { ok: false, said: 'Those names lie where they go by themselves.' }
    for (const r of sel) delete r.labelAt
    return { ok: true, said: `${sel.map((r) => r.name).join(', ')}: the name goes back` }
  })
}

// ---------- enclosed spaces ----------

const pocketAt = (sheet: Sheet, storey: number, index: number): Pocket | null =>
  pocketsOf(sheet, storey)[index] ?? null

export function givePocket(
  sheet: Sheet,
  input: { pocket: number; room?: string; storey: number },
): Change {
  return edit(sheet, (next) => {
    const pk = pocketAt(next, input.storey, input.pocket)
    if (!pk) return { ok: false, said: 'No enclosed space there.' }
    const room = input.room ? found(next, input.room) : bestNeighbour(pk, next)
    if (!room || room.fixed) return { ok: false, said: 'No room to give it to.' }
    if (!givePieces(room, pk.pieces, next, input.storey)) {
      sendBackRoom(next, room)
      return { ok: true, said: `${room.name} went back to the program`, retired: [room.name] }
    }
    room.placedAt = nextClock(next)
    return {
      ok: true,
      said: `${fmt(pk.area)} m² given to ${room.name}`,
      area: r2(pk.area),
      at: where(room),
    }
  })
}

export function makeCourt(sheet: Sheet, input: { pocket: number; storey: number }): Change {
  return edit(sheet, (next) => {
    const pk = pocketAt(next, input.storey, input.pocket)
    if (!pk) return { ok: false, said: 'No enclosed space there.' }
    const why = courtWhy(pk, next.settings)
    if (why) return { ok: false, said: why }
    const r = roomFromPocket(
      pk,
      'court',
      'Court',
      'open',
      true,
      freshId('x', roomIds(next)),
      nextClock(next),
    )
    r.storey = input.storey
    next.rooms.push(r)
    return { ok: true, said: `court ${fmt(pk.area)} m²`, area: r2(pk.area), born: [r.name] }
  })
}

export function makeCorridor(sheet: Sheet, input: { pocket: number; storey: number }): Change {
  return edit(sheet, (next) => {
    const pk = pocketAt(next, input.storey, input.pocket)
    if (!pk) return { ok: false, said: 'No enclosed space there.' }
    const hall = next.rooms.find((r) => r.kind === 'hallway' && r.placed && pk.touch.has(r.id))
    if (hall) {
      if (!givePieces(hall, pk.pieces, next, input.storey)) {
        sendBackRoom(next, hall)
        return { ok: true, said: `${hall.name} went back to the program`, retired: [hall.name] }
      }
      hall.placedAt = nextClock(next)
      return { ok: true, said: `${fmt(pk.area)} m² given to ${hall.name}`, area: r2(pk.area) }
    }
    const n = next.rooms.filter((r) => r.kind === 'hallway' && r.placed).length + 1
    const r = roomFromPocket(
      pk,
      'hallway',
      n > 1 ? `Hallway ${n}` : 'Hallway',
      'circulation',
      false,
      freshId('x', roomIds(next)),
      nextClock(next),
    )
    r.storey = input.storey
    next.rooms.push(r)
    return { ok: true, said: `${r.name} ${fmt(pk.area)} m²`, area: r2(pk.area), born: [r.name] }
  })
}

// ---------- doors ----------

export function addDoor(
  sheet: Sheet,
  input: { x: number; y: number; type: DoorType; width?: number; storey: number },
): Change {
  return edit(sheet, (next) => {
    const w = input.width ?? DOOR[input.type].w
    const hit = doorAt(input.x, input.y, input.type === 'open' ? 0.6 : w, next, input.storey)
    if (!hit) return { ok: false, said: 'No wall there.' }
    if (input.type === 'open') {
      if (hit.why && !hit.why.startsWith('That wall is too short'))
        return { ok: false, said: hit.why }
      const out = openWallOf(hit, next, input.storey, () => freshId('d', doorIds(next)))
      if (out.why) return { ok: false, said: out.why }
      return { ok: true, said: `${hit.room.name}: wall opened`, at: where(hit.room) }
    }
    if (hit.why) return { ok: false, said: hit.why }
    const d: Door = {
      id: freshId('d', doorIds(next)),
      type: input.type,
      w,
      flip: input.type === 'street2', // a double street door swings out
      hinge: false,
      at: [r6(hit.pl.p[0]), r6(hit.pl.p[1])],
    }
    hit.room.doors = [...doorsOf(hit.room), d]
    return {
      ok: true,
      said: `${DOOR[input.type].label} on ${hit.room.name}${hit.pl.snapped === 'middle' ? ', middle of the wall' : hit.pl.snapped === 'jamb' ? ', a jamb from the corner' : ''}`,
      at: where(hit.room),
    }
  })
}

const findDoor = (sheet: Sheet, roomId: string, doorId: string) => {
  const r = sheet.rooms.find((o) => o.id === roomId && o.placed) ?? null
  const d = r ? (doorsOf(r).find((o) => o.id === doorId) ?? null) : null
  return { r, d }
}

/**
 * Slid along its wall, or dropped on another wall when the point is off this one. `only` holds the
 * door on one room's wall, so a slide along a shared wall does not hand the door to the neighbour.
 */
export function moveDoor(
  sheet: Sheet,
  input: { room: string; door: string; x: number; y: number; storey: number; only?: string },
): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    const hit = doorAt(input.x, input.y, d.w, next, input.storey, found(next, input.only ?? ''))
    if (!hit) return { ok: false, said: 'No wall there.' }
    if (hit.why) return { ok: false, said: hit.why }
    r.doors = doorsOf(r).filter((o) => o !== d)
    if (!r.doors.length) delete r.doors
    const nd: Door = { ...d, at: [r6(hit.pl.p[0]), r6(hit.pl.p[1])] }
    hit.room.doors = [...doorsOf(hit.room), nd]
    return { ok: true, said: `${DOOR[d.type].label} on ${hit.room.name}` }
  })
}

/** A grid step along the wall, kept a jamb from the corners. */
export function slideDoor(
  sheet: Sheet,
  input: { room: string; door: string; step: number },
): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    const nd = slideDoorAlong(r, d, input.step)
    if (!nd) return { ok: false, said: `${DOOR[d.type].label} on ${r.name} lost its wall` }
    Object.assign(d, nd)
    return { ok: true, said: `${DOOR[d.type].label} on ${r.name}` }
  })
}

export function setDoorWidth(
  sheet: Sheet,
  input: { room: string; door: string; w: number },
): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    const out = widthOfDoor(r, d, input.w)
    if (!out.door) return { ok: false, said: out.why ?? 'That door will not fit.' }
    Object.assign(d, out.door)
    return { ok: true, said: `${DOOR[d.type].label} on ${r.name}, ${fmt(d.w)} m` }
  })
}

export function flipDoor(sheet: Sheet, input: { room: string; door: string }): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    if (!hasSwing(d))
      return { ok: false, said: `A ${DOOR[d.type].label.toLowerCase()} does not swing.` }
    d.flip = !d.flip
    return { ok: true, said: `${DOOR[d.type].label} on ${r.name} swings the other way` }
  })
}

export function hingeDoor(sheet: Sheet, input: { room: string; door: string }): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    if (!hasHinge(d))
      return { ok: false, said: `A ${DOOR[d.type].label.toLowerCase()} has no hinge.` }
    d.hinge = !d.hinge
    return { ok: true, said: `${DOOR[d.type].label} on ${r.name} hinged on the other side` }
  })
}

export function removeDoor(sheet: Sheet, input: { room: string; door: string }): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    r.doors = doorsOf(r).filter((o) => o !== d)
    if (!r.doors.length) delete r.doors
    return { ok: true, said: `${DOOR[d.type].label} on ${r.name} removed` }
  })
}

/** A door whose wall moved away, put back on the nearest wall long enough for it. */
export function reattachDoor(
  sheet: Sheet,
  input: { room: string; door: string; storey: number },
): Change {
  return edit(sheet, (next) => {
    const { r, d } = findDoor(next, input.room, input.door)
    if (!r || !d) return { ok: false, said: 'no such door' }
    if (doorPlace(r, d)) return { ok: false, said: 'That door is on a wall already.' }
    const wp = toWorld(r, d.at[0], d.at[1])
    let best: { o: Room; qp: Point; dist: number } | null = null
    for (const o of placedRooms(next, input.storey)) {
      if (isOpen(o) || o.fixed) continue
      for (const seg of outlineOf(o)) {
        const a = toWorld(o, seg.a[0], seg.a[1])
        const b = toWorld(o, seg.b[0], seg.b[1])
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
        const t = Math.min(
          Math.max((wp[0] - a[0]) * u[0]! + (wp[1] - a[1]) * u[1]!, d.w / 2),
          Math.max(d.w / 2, L - d.w / 2),
        )
        const qp: Point = [a[0] + u[0]! * t, a[1] + u[1]! * t]
        const dist = Math.hypot(wp[0] - qp[0], wp[1] - qp[1])
        if (L >= d.w + 0.1 && (!best || dist < best.dist)) best = { o, qp, dist }
      }
    }
    if (!best) return { ok: false, said: 'No wall long enough for it.' }
    r.doors = doorsOf(r).filter((o) => o !== d)
    if (!r.doors.length) delete r.doors
    const l = toLocal(best.o, best.qp[0], best.qp[1])
    best.o.doors = [...doorsOf(best.o), { ...d, at: [r6(l[0]), r6(l[1])] }]
    return { ok: true, said: `${DOOR[d.type].label} on ${best.o.name}` }
  })
}

/** The stretch two rooms share taken out, with no leaf and no jambs, never past a corner. */
export function openWall(sheet: Sheet, input: { x: number; y: number; storey: number }): Change {
  return addDoor(sheet, { ...input, type: 'open' })
}

// ---------- settings ----------

const CHOICES: Record<string, string[]> = {
  yieldKeeps: ['rect', 'rest'],
  dims: ['all', 'size', 'none'],
  pocketKeeps: ['shape', 'square'],
  boundary: ['off', 'sides', 'all'],
  turnFrom: ['sheet', 'north'],
}

const LIMITS: Record<string, [number, number]> = {
  jamb: [0.05, 0.5],
  tagDelay: [0.5, 6],
  storeyH: [3, 4.5],
  storeyH1: [3, 4.5],
  storeyH2: [3, 4.5],
  maxHeight: [9, 20],
  stairTop: [9, 21],
  snapDist: [0, 1],
  dur: [0, 1500],
  punch: [1, 5],
  hallW: [1.2, 2.4],
  tint: [0.1, 0.6],
  closeGap: [0, 0.5],
  courtArea: [4, 20],
  courtSide: [1, 3],
  dimSize: [0.25, 0.7],
}

const STEPS: Record<string, number[]> = { grid: [0, 0.25, 0.5, 1], rotSnap: [0, 5, 15, 45] }

/** Every setting, validated as the mock's `setSetting` does. */
export function setSetting(sheet: Sheet, input: { name: string; value: unknown }): Change {
  return edit(sheet, (next) => {
    const { name } = input
    if (name.startsWith('color.')) {
      const k = name.slice(6)
      if (!(k in DEFAULTS.colors) || !/^#[0-9a-fA-F]{6}$/.test(String(input.value)))
        return { ok: false, said: `${name} takes a colour as #rrggbb.` }
      next.settings.colors = { ...next.settings.colors, [k]: String(input.value) }
      return { ok: true, said: `${name} is ${String(input.value)}` }
    }
    if (!(name in DEFAULTS) || name === 'colors')
      return { ok: false, said: `no setting called ${name}` }
    const numeric = typeof DEFAULTS[name as keyof Settings] === 'number'
    let v: unknown = input.value
    if (numeric) {
      v = Number(input.value)
      if (Number.isNaN(v as number)) return { ok: false, said: `${name} takes a number.` }
    }
    if (name === 'rule') v = ruleOf(v)
    const choices = CHOICES[name]
    if (choices && !choices.includes(String(v)))
      return { ok: false, said: `${name} is one of ${choices.join(', ')}.` }
    const limit = LIMITS[name]
    if (limit) v = r2(Math.min(limit[1], Math.max(limit[0], v as number)))
    if (name === 'dur') v = Math.min(1500, Math.max(0, Math.round(v as number)))
    const steps = STEPS[name]
    if (steps && !steps.includes(v as number))
      v = steps.reduce((p, c) =>
        Math.abs(c - (v as number)) < Math.abs(p - (v as number)) ? c : p,
      )
    if (name === 'hallW') {
      const width = v as number
      for (const r of next.rooms)
        if (r.kind === 'hallway') {
          if (!r.placed) {
            const s = sizeFor(r.kind, r.target, { ...next.settings, hallW: width })
            r.w = s.w
            r.h = s.h
          } else scaleTo(r, width, r.h)
        }
    }
    ;(next.settings as unknown as Record<string, unknown>)[name] = v
    if (['boundary', 'allowSpill', 'hardSetback', 'openBelow', 'stairAcross'].includes(name))
      for (let k = 0; k < MAX_STOREYS; k++)
        for (const r of placedRooms(next, k)) Object.assign(r, hold(r, next, k))
    return { ok: true, said: `${name} is ${String(v)}` }
  })
}

// ---------- undo and redo: a history of sheets, capped at 200 ----------

export const HISTORY_CAP = 200

export type History = { past: Sheet[]; future: Sheet[] }

export const newHistory = (): History => ({ past: [], future: [] })

/** The sheet as it stands, kept so one Undo goes back to it. */
export function remember(history: History, sheet: Sheet): History {
  const past = [...history.past, cloneSheet(sheet)]
  if (past.length > HISTORY_CAP) past.shift()
  return { past, future: [] }
}

export function undo(sheet: Sheet, input: { history: History }): Change & { history: History } {
  const { past, future } = input.history
  const back = past[past.length - 1]
  if (!back)
    return { sheet, result: { ok: false, said: 'Nothing to undo.' }, history: input.history }
  return {
    sheet: back,
    result: { ok: true, said: 'undone' },
    history: { past: past.slice(0, -1), future: [...future, cloneSheet(sheet)] },
  }
}

export function redo(sheet: Sheet, input: { history: History }): Change & { history: History } {
  const { past, future } = input.history
  const forward = future[future.length - 1]
  if (!forward)
    return { sheet, result: { ok: false, said: 'Nothing to redo.' }, history: input.history }
  return {
    sheet: forward,
    result: { ok: true, said: 'redone' },
    history: { past: [...past, cloneSheet(sheet)], future: future.slice(0, -1) },
  }
}

/** A point a drawing gesture gives, kept on the plot and on the floor. */
export function drawnPoint(sheet: Sheet, storey: number, at: Point): Point {
  const box: Box = sheet.settings.allowSpill ? sheet.plot.box : allowedBox(sheet, storey)
  return onPlot(at, box)
}

/** Where a room would rest with nothing to catch it, for a test or a preview. */
export const restOnGrid = (r: Room, settings: Settings) => gridRest(r, settings)
