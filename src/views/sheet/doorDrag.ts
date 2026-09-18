/**
 * A door held by the hand: a press selects it, a drag slides it along its wall, and a metre off the
 * wall it comes free for another. The gesture holds no door: it says where one would land, and the
 * drop is one action.
 */

import {
  doorAt,
  doorPlace,
  doorsOf,
  moveDoor,
  placedRooms,
  toWorld,
  type Change,
  type DoorRef,
  type DoorType,
  type Hit,
  type Point,
  type Sheet,
} from '../../sheet'

export type DoorDrag = DoorRef & {
  type: DoorType
  w: number
  start: Point
  /** The wall it started on, in plot metres: within a metre of it the door stays on that wall. */
  wall: { a: Point; b: Point } | null
  at: Point | null
  hit: Hit | null
  moved: boolean
}

export function beginDoorDrag(
  sheet: Sheet,
  storey: number,
  ref: DoorRef,
  at: Point,
): DoorDrag | null {
  const r = placedRooms(sheet, storey).find((o) => o.id === ref.room)
  const d = r ? doorsOf(r).find((o) => o.id === ref.id) : undefined
  if (!r || !d) return null
  const pl = doorPlace(r, d)
  return {
    ...ref,
    type: d.type,
    w: d.w,
    start: at,
    wall: pl
      ? { a: toWorld(r, pl.seg.a[0], pl.seg.a[1]), b: toWorld(r, pl.seg.b[0], pl.seg.b[1]) }
      : null,
    at: null,
    hit: null,
    moved: false,
  }
}

/** Whether a point is still within a metre of the run of the wall the door started on. */
function onItsWall(drag: DoorDrag, [x, y]: Point): boolean {
  if (!drag.wall) return false
  const { a, b } = drag.wall
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  const off = (x - a[0]) * -u[1]! + (y - a[1]) * u[0]!
  const t = (x - a[0]) * u[0]! + (y - a[1]) * u[1]!
  return Math.abs(off) < 1 && t > -0.5 && t < L + 0.5
}

export function doorDragTo(drag: DoorDrag, at: Point, sheet: Sheet, storey: number): DoorDrag {
  if (!drag.moved && Math.hypot(at[0] - drag.start[0], at[1] - drag.start[1]) < 0.12) return drag
  const only = onItsWall(drag, at)
    ? (placedRooms(sheet, storey).find((o) => o.id === drag.room) ?? null)
    : null
  return { ...drag, moved: true, at, hit: doorAt(at[0], at[1], drag.w, sheet, storey, only) }
}

export function doorDrop(drag: DoorDrag, sheet: Sheet, storey: number): Change | null {
  if (!drag.moved || !drag.at) return null
  if (drag.hit?.why) return { sheet, result: { ok: false, said: drag.hit.why } }
  if (!drag.hit) return null
  return moveDoor(sheet, {
    room: drag.room,
    door: drag.id,
    x: drag.at[0],
    y: drag.at[1],
    storey,
    only: drag.hit.room.id,
  })
}
