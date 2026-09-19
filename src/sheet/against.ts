/**
 * Where a room stands when it is put against a named wall of another room: the frame the sheet's own
 * actions are then given. The wall is the real wall the room shows on that side, so a turned room is
 * followed rather than approximated, and the room placed against it comes to lie parallel to it.
 */

import { fmt, norm, r2, worldWalls, type Seg } from './geometry'

/** A rounded zero is a zero, whichever way the arithmetic came out. */
const flat = (v: number) => (v === 0 ? 0 : v)
import type { Point, Room } from './model'

/** The side of a room a wall faces, in the sheet's own frame: x runs east, y runs south. */
export type WallName = 'north' | 'south' | 'east' | 'west'

export const WALL_NAMES: readonly WallName[] = ['north', 'south', 'east', 'west']

/**
 * Flush to the start of the wall, flush to its end, or centred on it. The start is the end nearer
 * the top-left of the sheet — the north end of a wall that runs down the plot, the west end of one
 * that runs across it — so the two ends read the same way whichever room the wall belongs to.
 */
export type Along = 'start' | 'end' | 'centre'

const OUTWARD: Record<WallName, Point> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
}

export const wallNamed = (value: unknown): WallName | null => {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  return WALL_NAMES.find((name) => name === want) ?? null
}

export function alongNamed(value: unknown): Along {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  return want === 'start' || want === 'end' ? want : 'centre'
}

/** The frame a room is given: where its own top-left corner lands, its size and its turn. */
export type Standing = { x: number; y: number; w: number; h: number; angle: number }

export type Placing = { ok: true; standing: Standing } | { ok: false; why: string }

/** The room's longest wall on the named side, and how long it is. */
function wallOn(r: Room, name: WallName): { seg: Seg; length: number } | null {
  const out = OUTWARD[name]
  let best: { seg: Seg; length: number } | null = null
  for (const seg of worldWalls(r)) {
    if (seg.n[0] * out[0] + seg.n[1] * out[1] < 0.5) continue
    const length = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1])
    if (!best || length > best.length) best = { seg, length }
  }
  return best
}

/**
 * The frame that puts a room of this size against that wall, touching it, lying along it, and
 * aligned as asked; `offset` is metres from the near end of the wall and overrules the alignment.
 */
export function standAgainst(
  target: Room,
  name: WallName,
  mover: { name: string; w: number; h: number },
  along: Along,
  offset?: number,
): Placing {
  const wall = wallOn(target, name)
  if (!wall) return { ok: false, why: `${target.name} shows no ${name} wall` }
  const { seg, length } = wall
  if (mover.w > length + 0.01)
    return {
      ok: false,
      why:
        `${target.name}'s ${name} wall is ${fmt(length)} m and ${mover.name} needs ` +
        `${fmt(mover.w)} m along it: turn it, resize it, or put it against a longer wall`,
    }
  // The room lies with its own width along the wall and its depth away from it: its local x runs
  // along the wall and its local y points out of the target, whichever way the wall was walked.
  const u: Point = [seg.n[1], -seg.n[0]]
  // The start of the wall is its top-left end, and the offset is measured from there.
  const first: Point =
    seg.a[1] < seg.b[1] || (seg.a[1] === seg.b[1] && seg.a[0] <= seg.b[0]) ? seg.a : seg.b
  const last: Point = first === seg.a ? seg.b : seg.a
  const d: Point = [(last[0] - first[0]) / length, (last[1] - first[1]) / length]
  const free = length - mover.w
  const asked =
    offset !== undefined && Number.isFinite(offset)
      ? offset
      : along === 'start'
        ? 0
        : along === 'end'
          ? free
          : free / 2
  const at = Math.min(Math.max(asked, 0), free)
  // where the room's own (0,0) corner lands: the end of its run that the wall's own direction starts
  const run = d[0] * u[0] + d[1] * u[1] > 0 ? at : at + mover.w
  const corner: Point = [first[0] + run * d[0], first[1] + run * d[1]]
  const turn = norm((Math.atan2(u[1], u[0]) * 180) / Math.PI)
  const a = (turn * Math.PI) / 180
  // the frame's centre, from the corner the room's own (0,0) stands on
  const cx = corner[0] + (mover.w / 2) * Math.cos(a) - (mover.h / 2) * Math.sin(a)
  const cy = corner[1] + (mover.w / 2) * Math.sin(a) + (mover.h / 2) * Math.cos(a)
  // A quarter turn is a rectangle with its sides swapped, as the sheet keeps it, so the frame given
  // to the actions is the one they will hold and nothing turns twice.
  const quarter = Math.round(turn / 90) % 4
  const square = Math.abs(turn - quarter * 90) < 1e-6
  const w = square && quarter % 2 ? mover.h : mover.w
  const h = square && quarter % 2 ? mover.w : mover.h
  return {
    ok: true,
    standing: {
      x: flat(r2(cx - w / 2)),
      y: flat(r2(cy - h / 2)),
      w: r2(w),
      h: r2(h),
      angle: square ? 0 : r2(turn),
    },
  }
}
