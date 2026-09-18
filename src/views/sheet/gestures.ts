/**
 * The pointer gestures of the sheet, as state machines over the actions. Each `begin` opens a drag,
 * `dragTo` gives the next state with the shapes the sheet should draw while the hand holds it, and
 * `dropOf` names the one action that makes the change. No gesture touches a room: the preview is a
 * copy, and the sheet only ever changes through an action.
 */

import {
  NORTH,
  alignWall,
  bboxOf,
  canonicalise,
  centreOf,
  cloneRoom,
  draw,
  drawnPoint,
  hold,
  move,
  moveCorner,
  norm,
  outlineOf,
  place,
  placedRooms,
  polyArea,
  pullWall,
  pullWallShape,
  r2,
  r6,
  reshape,
  resize,
  rotateGroup,
  setFrame,
  setLabel,
  simplePoly,
  snapAngle,
  snapMove,
  snapPoint,
  snapRooms,
  snapTo,
  toLocal,
  triangulate,
  turn,
  unionBox,
  wallCandidates,
  type Change,
  type Guide,
  type Point,
  type PointSnap,
  type Poly,
  type Room,
  type Seg,
  type Settings,
  type SnapKind,
  type Sheet,
  type Side4,
} from '../../sheet'

type Mods = { shift: boolean }

/** The angle a turn agreed with, the lines to draw it through, and the room that already stood there. */
type Lock = { angle: number; through: Point[]; mate: Room | null }

/** What the sheet draws in place of the rooms the hand holds. */
type Preview = Map<string, Room>

type Marks = { guides: Guide[]; corner: Point | null }

const noMarks: Marks = { guides: [], corner: null }

export type Drag =
  | ({ kind: 'new'; id: string; room: Room; started: boolean } & Marks)
  | ({
      kind: 'move'
      ids: string[]
      lead: string
      start: Point
      dx: number
      dy: number
      axisLock: boolean
      preview: Preview
      moved: boolean
    } & Marks)
  | { kind: 'mark'; start: Point; now: Point; keep: string[]; moved: boolean }
  | ({
      kind: 'wall'
      id: string
      wall: number
      seg: Seg
      start: Point
      distance: number
      preview: Preview
      moved: boolean
    } & Marks)
  | ({
      kind: 'resize'
      id: string
      side: Side4
      shared: string | null
      seg: Seg
      start: Point
      distance: number
      preview: Preview
      moved: boolean
    } & Marks)
  | ({
      kind: 'corner'
      id: string
      index: number
      loop: Poly
      at: Point
      preview: Preview
      moved: boolean
    } & Marks)
  | { kind: 'turn'; id: string; angle: number; preview: Preview; lock: Lock | null; moved: boolean }
  | {
      kind: 'groupTurn'
      ids: string[]
      pivot: Point
      startAngle: number
      angle: number
      preview: Preview
      lock: Lock | null
      moved: boolean
    }
  | { kind: 'label'; id: string; at: Point; moved: boolean }

const empty: Preview = new Map()

const previewOf = (rooms: Room[]): Preview => new Map(rooms.map((r) => [r.id, r]))

const roomById = (sheet: Sheet, id: string): Room | null =>
  sheet.rooms.find((r) => r.id === id) ?? null

const takeRooms = (sheet: Sheet, storey: number, ids: string[]): Room[] =>
  placedRooms(sheet, storey).filter((r) => ids.includes(r.id))

const candidatesFor = (sheet: Sheet, storey: number, except: string[]): Seg[] =>
  wallCandidates(
    snapRooms(sheet, storey, null).filter((o) => !except.includes(o.id)),
    sheet.settings,
  )

// ---------- dropped from the program ----------

export function beginNew(sheet: Sheet, id: string): Drag | null {
  const r = roomById(sheet, id)
  if (!r || r.placed) return null
  return { kind: 'new', id, room: cloneRoom(r), started: false, ...noMarks }
}

// ---------- moving, and the box that selects ----------

export const beginMove = (ids: string[], lead: string, at: Point): Drag => ({
  kind: 'move',
  ids,
  lead,
  start: at,
  dx: 0,
  dy: 0,
  axisLock: false,
  preview: empty,
  moved: false,
  ...noMarks,
})

export const beginMark = (at: Point, keep: string[]): Drag => ({
  kind: 'mark',
  start: at,
  now: at,
  keep,
  moved: false,
})

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Every room the box touches, so the drop can take them in hand. */
export function marked(drag: Drag, sheet: Sheet, storey: number): string[] {
  if (drag.kind !== 'mark') return []
  const box = {
    x: Math.min(drag.start[0], drag.now[0]),
    y: Math.min(drag.start[1], drag.now[1]),
    w: Math.abs(drag.now[0] - drag.start[0]),
    h: Math.abs(drag.now[1] - drag.start[1]),
  }
  if (!(box.w > 0.2 && box.h > 0.2)) return [...drag.keep]
  const caught = placedRooms(sheet, storey)
    .filter((o) => overlaps(bboxOf(o), box))
    .map((o) => o.id)
  return [...new Set([...drag.keep, ...caught])]
}

// ---------- one wall, one corner, one side ----------

export function beginWall(sheet: Sheet, id: string, wall: number, at: Point): Drag | null {
  const r = roomById(sheet, id)
  if (!r) return null
  const seg = outlineOf(r)[wall]
  if (!seg) return null
  return {
    kind: 'wall',
    id,
    wall,
    seg,
    start: at,
    distance: 0,
    preview: empty,
    moved: false,
    ...noMarks,
  }
}

const sideSeg = (r: Room, side: Side4): Seg =>
  side === 'right'
    ? { a: [r.w, 0], b: [r.w, r.h], n: [1, 0] }
    : side === 'left'
      ? { a: [0, 0], b: [0, r.h], n: [-1, 0] }
      : side === 'bottom'
        ? { a: [0, r.h], b: [r.w, r.h], n: [0, 1] }
        : { a: [0, 0], b: [r.w, 0], n: [0, -1] }

export function beginResize(
  sheet: Sheet,
  id: string,
  side: Side4,
  shared: string | null,
  at: Point,
): Drag | null {
  const r = roomById(sheet, id)
  if (!r) return null
  return {
    kind: 'resize',
    id,
    side,
    shared,
    seg: sideSeg(r, side),
    start: at,
    distance: 0,
    preview: empty,
    moved: false,
    ...noMarks,
  }
}

export const beginCorner = (id: string, index: number, loop: Poly, at: Point): Drag => ({
  kind: 'corner',
  id,
  index,
  loop,
  at,
  preview: empty,
  moved: false,
  ...noMarks,
})

// ---------- turning ----------

export function beginTurn(sheet: Sheet, id: string): Drag | null {
  const r = roomById(sheet, id)
  if (!r) return null
  return { kind: 'turn', id, angle: r.angle || 0, preview: empty, lock: null, moved: false }
}

export const beginGroupTurn = (ids: string[], pivot: Point, at: Point): Drag => ({
  kind: 'groupTurn',
  ids,
  pivot,
  startAngle: (Math.atan2(at[1] - pivot[1], at[0] - pivot[0]) * 180) / Math.PI,
  angle: 0,
  preview: empty,
  lock: null,
  moved: false,
})

/** The point a selection turns about: the middle of what is in hand. */
export function middleOf(sheet: Sheet, storey: number, ids: string[]): Point {
  const sel = takeRooms(sheet, storey, ids)
  if (!sel.length) return [0, 0]
  const b = sel.length === 1 ? bboxOf(sel[0]!) : unionBox(sel)
  return [b.x + b.w / 2, b.y + b.h / 2]
}

// ---------- the name written where the hand puts it ----------

export const beginLabel = (id: string, at: Point): Drag => ({ kind: 'label', id, at, moved: false })

// ---------- the hand moves ----------

export function dragTo(drag: Drag, at: Point, mods: Mods, sheet: Sheet, storey: number): Drag {
  const { settings } = sheet
  switch (drag.kind) {
    case 'new': {
      const base = { ...drag.room, x: at[0] - drag.room.w / 2, y: at[1] - drag.room.h / 2 }
      const snap = snapMove(base, candidatesFor(sheet, storey, []), settings)
      return {
        ...drag,
        started: true,
        room: snap.rect,
        guides: snap.guides,
        corner: snap.corner ?? null,
      }
    }
    case 'mark':
      return { ...drag, now: at, moved: true }
    case 'label': {
      const r = roomById(sheet, drag.id)
      if (!r) return drag
      const local = toLocal(r, at[0], at[1])
      return { ...drag, at: [r6(local[0]), r6(local[1])], moved: true }
    }
    case 'move': {
      const lead = roomById(sheet, drag.lead)
      if (!lead) return drag
      const rawX = at[0] - drag.start[0]
      const rawY = at[1] - drag.start[1]
      const axisLock = mods.shift
      const dx = axisLock && Math.abs(rawY) > Math.abs(rawX) ? 0 : rawX
      const dy = axisLock && Math.abs(rawX) >= Math.abs(rawY) ? 0 : rawY
      const snap = snapMove(
        { ...lead, x: lead.x + dx, y: lead.y + dy },
        candidatesFor(sheet, storey, drag.ids),
        settings,
      )
      const held = hold(snap.rect, sheet, storey)
      const mx = held.x - lead.x
      const my = held.y - lead.y
      const carried = takeRooms(sheet, storey, drag.ids)
        .filter((o) => !o.fixed && !o.locked)
        .map((o) => hold({ ...cloneRoom(o), x: r6(o.x + mx), y: r6(o.y + my) }, sheet, storey))
      return {
        ...drag,
        dx: rawX,
        dy: rawY,
        axisLock,
        moved: true,
        preview: previewOf(carried),
        guides: snap.guides,
        corner: snap.corner ?? null,
      }
    }
    case 'wall': {
      const r = roomById(sheet, drag.id)
      if (!r) return drag
      const distance = alongNormal(r, drag.seg, at, drag.start)
      const pulled = pulledWall(r, drag.seg, distance, snapRooms(sheet, storey, r), settings)
      return {
        ...drag,
        distance,
        moved: true,
        preview: pulled.room ? previewOf([pulled.room]) : drag.preview,
        guides: pulled.guide ? [pulled.guide] : [],
        corner: pulled.corner,
      }
    }
    case 'resize': {
      const r = roomById(sheet, drag.id)
      if (!r) return drag
      const distance = alongNormal(r, drag.seg, at, drag.start)
      const shared = drag.shared ? roomById(sheet, drag.shared) : null
      const sized = resized(r, drag.side, distance, shared, sheet, storey)
      return {
        ...drag,
        distance,
        moved: true,
        preview: sized.rooms.length ? previewOf(sized.rooms) : drag.preview,
        guides: sized.guide ? [sized.guide] : [],
        corner: sized.corner,
      }
    }
    case 'corner': {
      const r = roomById(sheet, drag.id)
      if (!r) return drag
      const snap = snapPoint(
        at,
        candidatesFor(sheet, storey, [drag.id]),
        null,
        mods.shift,
        settings,
        placedRooms(sheet, storey),
      )
      const clone = cloneRoom(r)
      const local = toLocal(clone, snap.at[0], snap.at[1])
      const poly = drag.loop.map((pt, j) =>
        j === drag.index ? ([r6(local[0]), r6(local[1])] as Point) : pt,
      )
      const ok = simplePoly(poly) && polyArea(poly) >= 1
      if (ok) clone.pieces = triangulate(poly)
      const mark = snap.marks[0]
      return {
        ...drag,
        at: snap.at,
        moved: drag.moved || ok,
        preview: ok ? previewOf([clone]) : drag.preview,
        guides: snap.guides,
        corner: mark && mark.type === 'corner' ? mark.at : null,
      }
    }
    case 'turn': {
      const r = roomById(sheet, drag.id)
      if (!r) return drag
      const [cx, cy] = centreOf(r)
      const want = norm((Math.atan2(at[1] - cy, at[0] - cx) * 180) / Math.PI + 90)
      const snap = snapAngle(want, [r], placedRooms(sheet, storey), settings, NORTH)
      const clone = cloneRoom(r)
      clone.angle = snap.angle
      return {
        ...drag,
        angle: snap.angle,
        moved: true,
        preview: previewOf([clone]),
        lock: snap.locked
          ? {
              angle: snap.angle,
              through: snap.mate ? [[cx, cy], centreOf(snap.mate)] : [[cx, cy]],
              mate: snap.mate,
            }
          : null,
      }
    }
    case 'groupTurn': {
      const sel = takeRooms(sheet, storey, drag.ids)
        .filter((o) => !o.fixed && !o.locked)
        .map(cloneRoom)
      if (!sel.length) return drag
      const was = sel[0]!.angle || 0
      const turned =
        (Math.atan2(at[1] - drag.pivot[1], at[0] - drag.pivot[0]) * 180) / Math.PI - drag.startAngle
      const snap = snapAngle(was + turned, sel, placedRooms(sheet, storey), settings, NORTH)
      rotateGroup(sel, snap.angle - was, drag.pivot)
      return {
        ...drag,
        angle: snap.angle,
        moved: true,
        preview: previewOf(sel),
        lock: snap.locked
          ? {
              angle: snap.angle,
              through: snap.mate ? [drag.pivot, centreOf(snap.mate)] : [drag.pivot],
              mate: snap.mate,
            }
          : null,
      }
    }
  }
}

/** How far the hand has pulled a wall along its own normal, read in the room's own frame. */
function alongNormal(r: Room, seg: Seg, at: Point, start: Point): number {
  const a = ((r.angle || 0) * Math.PI) / 180
  const dx = at[0] - start[0]
  const dy = at[1] - start[1]
  const along = dx * Math.cos(a) + dy * Math.sin(a)
  const across = -dx * Math.sin(a) + dy * Math.cos(a)
  return along * seg.n[0] + across * seg.n[1]
}

/**
 * One wall pulled as far as the shape will take it: the hand may ask for more than a clean room can
 * give, so the wall stops at the furthest grid step that still leaves one.
 */
function pulledWall(
  r: Room,
  seg: Seg,
  distance: number,
  others: Room[],
  settings: Settings,
): { room: Room | null; guide?: Guide; corner: Point | null } {
  const aligned = alignWall(
    { x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle || 0 },
    seg,
    distance,
    others,
    settings,
  )
  const grid = settings.grid || 0.05
  let s = aligned.guide ? aligned.s : r2(snapTo(distance, grid))
  const step = s >= 0 ? grid : -grid
  for (let guard = 0; guard < 400; guard++) {
    if (Math.abs(s) < 1e-6) break
    const clone = cloneRoom(r)
    if (pullWallShape(clone, seg, s) && canonicalise(clone))
      return { room: clone, guide: aligned.guide, corner: aligned.mark?.corner ?? null }
    s = r2(s - step)
  }
  return { room: null, guide: aligned.guide, corner: aligned.mark?.corner ?? null }
}

/** A plain room's side, with the neighbour that shares that wall following it. */
function resized(
  r: Room,
  side: Side4,
  distance: number,
  shared: Room | null,
  sheet: Sheet,
  storey: number,
): { rooms: Room[]; guide?: Guide; corner: Point | null } {
  const frame = { x: r.x, y: r.y, w: r.w, h: r.h, angle: r.angle || 0 }
  const aligned = alignWall(
    frame,
    sideSeg(r, side),
    distance,
    placedRooms(sheet, storey).filter((o) => o.id !== r.id && o.id !== shared?.id),
    sheet.settings,
  )
  const grid = sheet.settings.grid || 0.05
  const out = aligned.guide ? aligned.s : r2(snapTo(distance, grid))
  const clone = cloneRoom(r)
  let lx = 0
  let ly = 0
  let lw = frame.w
  let lh = frame.h
  if (side === 'right') lw = Math.max(1, r2(frame.w + out))
  if (side === 'bottom') lh = Math.max(1, r2(frame.h + out))
  if (side === 'left') {
    lx = Math.min(r2(-out), frame.w - 1)
    lw = r2(frame.w - lx)
  }
  if (side === 'top') {
    ly = Math.min(r2(-out), frame.h - 1)
    lh = r2(frame.h - ly)
  }
  const rooms: Room[] = setFrame(clone, lx, ly, lw, lh) ? [clone] : []
  if (rooms.length && shared) {
    const follower = cloneRoom(shared)
    if (side === 'right') {
      follower.x = clone.x + clone.w
      follower.w = Math.max(1, r2(shared.x + shared.w - follower.x))
    }
    if (side === 'left') follower.w = Math.max(1, r2(clone.x - shared.x))
    if (side === 'bottom') {
      follower.y = clone.y + clone.h
      follower.h = Math.max(1, r2(shared.y + shared.h - follower.y))
    }
    if (side === 'top') follower.h = Math.max(1, r2(clone.y - shared.y))
    rooms.push(follower)
  }
  return { rooms, guide: aligned.guide, corner: aligned.mark?.corner ?? null }
}

// ---------- the hand lets go: one action ----------

/** The change the drag asks for, or nothing when it asks for none. */
export function dropOf(drag: Drag, sheet: Sheet, storey: number): Change | null {
  if (drag.kind === 'mark') return null
  if (drag.kind === 'new')
    return drag.started
      ? place(sheet, { id: drag.id, x: drag.room.x, y: drag.room.y, storey })
      : null
  if (!drag.moved) return null
  switch (drag.kind) {
    case 'move':
      return move(sheet, {
        ids: drag.ids,
        dx: drag.dx,
        dy: drag.dy,
        storey,
        axisLock: drag.axisLock,
      })
    case 'wall':
      return pullWall(sheet, { id: drag.id, wall: drag.wall, distance: drag.distance, storey })
    case 'resize':
      return resize(sheet, {
        id: drag.id,
        side: drag.side,
        distance: drag.distance,
        shared: drag.shared ?? undefined,
        storey,
      })
    case 'corner':
      return moveCorner(sheet, { id: drag.id, corner: drag.index, point: drag.at, storey })
    case 'turn':
      return turn(sheet, { ids: [drag.id], storey, angle: drag.angle })
    case 'groupTurn':
      return turn(sheet, { ids: drag.ids, storey, angle: drag.angle, pivot: drag.pivot })
    case 'label':
      return setLabel(sheet, { id: drag.id, at: drag.at })
  }
}

/** Where a block dragged by its grip lands: before the block it is over, or after it. */
export const reorderSide = (
  clientY: number,
  box: { y: number; height: number },
): 'before' | 'after' => (clientY > box.y + box.height / 2 ? 'after' : 'before')

/** The turn the knob reads, so the degrees beside it follow the hand. */
export const angleShown = (drag: Drag | null, fallback: number): number =>
  drag && (drag.kind === 'turn' || drag.kind === 'groupTurn')
    ? Math.round(norm(drag.angle))
    : Math.round(norm(fallback))

/** What the sheet draws instead of a room, while a drag holds it. */
export const shownRoom = (r: Room, drag: Drag | null): Room =>
  drag && 'preview' in drag ? (drag.preview.get(r.id) ?? r) : r

// ---------- drawing a shape, and measuring ----------

export type Shape = 'rect' | 'circle' | 'poly'

/** A shape being drawn for a room: the corners taken so far, and what the next point caught. */
export type Drawing = {
  id: string
  shape: Shape
  pts: Point[]
  at: Point | null
  from: Point | null
  snap: PointSnap | null
  reshaping: boolean
}

export const startDrawing = (id: string, shape: Shape, reshaping = false): Drawing => ({
  id,
  shape,
  pts: [],
  at: null,
  from: null,
  snap: null,
  reshaping,
})

/** The corner a new point is measured from: the last one taken, or where a drag began. */
export const lastCorner = (d: Drawing): Point | null =>
  d.shape === 'poly' ? (d.pts[d.pts.length - 1] ?? null) : d.from

/** A point the hand offers, pulled onto what is already drawn and held on the plot. */
export function drawnAt(
  d: Drawing,
  at: Point,
  mods: Mods,
  sheet: Sheet,
  storey: number,
): PointSnap {
  const snap = snapPoint(
    at,
    candidatesFor(sheet, storey, d.reshaping ? [] : [d.id]),
    lastCorner(d),
    mods.shift,
    sheet.settings,
    placedRooms(sheet, storey),
  )
  return { ...snap, at: drawnPoint(sheet, storey, snap.at) }
}

/** The shape as it stands: null while it has too little to be one. */
export function shapePolygon(d: Drawing): Poly | null {
  if (d.shape === 'rect' && d.from && d.at) {
    const [x0, y0] = d.from
    const [x1, y1] = d.at
    return [
      [Math.min(x0, x1), Math.min(y0, y1)],
      [Math.max(x0, x1), Math.min(y0, y1)],
      [Math.max(x0, x1), Math.max(y0, y1)],
      [Math.min(x0, x1), Math.max(y0, y1)],
    ]
  }
  if (d.shape === 'circle' && d.from && d.at) {
    const radius = Math.hypot(d.at[0] - d.from[0], d.at[1] - d.from[1])
    if (radius < 0.1) return null
    const sides = 32
    return Array.from({ length: sides }, (_unused, i): Point => [
      r6(d.from![0] + radius * Math.cos((2 * Math.PI * i) / sides)),
      r6(d.from![1] + radius * Math.sin((2 * Math.PI * i) / sides)),
    ])
  }
  if (d.shape === 'poly') {
    const pts = d.at ? [...d.pts, d.at] : d.pts
    return pts.length >= 3 ? pts : null
  }
  return null
}

/** Whether a click on a polygon's first corner closes it. */
export const closesPolygon = (d: Drawing, at: Point): boolean =>
  d.shape === 'poly' &&
  d.pts.length >= 3 &&
  !!d.pts[0] &&
  Math.hypot(at[0] - d.pts[0]![0], at[1] - d.pts[0]![1]) < 0.35

/** A drawn shape becomes the room's footprint, or redraws its boundary while reshaping. */
export function drawnShape(d: Drawing, polygon: Poly, sheet: Sheet, storey: number): Change {
  return d.reshaping
    ? reshape(sheet, { id: d.id, polygon, storey })
    : draw(sheet, { id: d.id, polygon, shape: d.shape, storey })
}

/** Two points measured on the sheet, with what each one caught. */
export type Measure = {
  a: Point | null
  b: Point | null
  at: Point | null
  kindA: SnapKind | null
  kindB: SnapKind | null
}

export const startMeasure = (): Measure => ({
  a: null,
  b: null,
  at: null,
  kindA: null,
  kindB: null,
})

export function measureClick(m: Measure, snap: PointSnap): Measure {
  if (!m.a || m.b) return { a: snap.at, b: null, at: snap.at, kindA: snap.kind, kindB: null }
  return { ...m, b: snap.at, at: null, kindB: snap.kind }
}

export function measurePoint(at: Point, mods: Mods, sheet: Sheet, storey: number): PointSnap {
  const snap = snapPoint(
    at,
    candidatesFor(sheet, storey, []),
    null,
    mods.shift,
    sheet.settings,
    placedRooms(sheet, storey),
  )
  return { ...snap, at: drawnPoint(sheet, storey, snap.at) }
}
