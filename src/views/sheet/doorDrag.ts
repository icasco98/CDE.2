/**
 * A door held by the hand: a press selects it and a drag slides it along the wall it stands on. It
 * never leaves that wall, since a door draws one edge. The gesture holds no door: it says where the
 * door would land, and the drop is one action.
 */

import {
  doorSlid,
  doorsOf,
  moveDoor,
  placedRooms,
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
  return { ...ref, type: d.type, w: d.w, start: at, at: null, hit: null, moved: false }
}

export function doorDragTo(drag: DoorDrag, at: Point, sheet: Sheet, storey: number): DoorDrag {
  if (!drag.moved && Math.hypot(at[0] - drag.start[0], at[1] - drag.start[1]) < 0.12) return drag
  const r = placedRooms(sheet, storey).find((o) => o.id === drag.room)
  const d = r ? doorsOf(r).find((o) => o.id === drag.id) : undefined
  const slid = r && d ? doorSlid(sheet, storey, r, d, at[0], at[1]) : null
  return { ...drag, moved: true, at, hit: slid ? slid.hit : null }
}

export function doorDrop(drag: DoorDrag, sheet: Sheet, storey: number): Change | null {
  if (!drag.moved || !drag.at) return null
  if (drag.hit?.why) return { sheet, result: { ok: false, said: drag.hit.why } }
  if (!drag.hit) return null
  return moveDoor(sheet, { room: drag.room, door: drag.id, x: drag.at[0], y: drag.at[1], storey })
}
