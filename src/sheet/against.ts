/**
 * Where a zone stands when it is put against a named edge of another zone: the frame the sheet's own
 * actions are then given. The edge is the real edge the zone shows on that side, so a turned zone is
 * followed rather than approximated, and the zone placed against it comes to lie parallel to it.
 */

import { fmt, norm, r2, worldEdges, type Seg } from './geometry'
import type { Point, Zone } from './model'

/** A rounded zero is a zero, whichever way the arithmetic came out. */
const flat = (v: number) => (v === 0 ? 0 : v)

/** The side of a zone an edge faces, in the sheet's own frame: x runs east, y runs south. */
export type EdgeName = 'north' | 'south' | 'east' | 'west'

export const EDGE_NAMES: readonly EdgeName[] = ['north', 'south', 'east', 'west']

/**
 * Flush to the start of the edge, flush to its end, or centred on it. The start is the end nearer
 * the top-left of the sheet — the north end of an edge that runs down the plot, the west end of one
 * that runs across it — so the two ends read the same way whichever zone the edge belongs to.
 */
export type Along = 'start' | 'end' | 'centre'

const OUTWARD: Record<EdgeName, Point> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
}

export const edgeNamed = (value: unknown): EdgeName | null => {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  return EDGE_NAMES.find((name) => name === want) ?? null
}

export function alongNamed(value: unknown): Along {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  return want === 'start' || want === 'end' ? want : 'centre'
}

/** The frame a zone is given: where its own top-left corner lands, its size and its turn. */
export type Standing = { x: number; y: number; w: number; h: number; angle: number }

export type Placing = { ok: true; standing: Standing } | { ok: false; why: string }

/** The zone's longest edge on the named side, and how long it is, in the sheet's own frame. */
export function edgeOn(r: Zone, name: EdgeName): { seg: Seg; length: number } | null {
  const out = OUTWARD[name]
  let best: { seg: Seg; length: number } | null = null
  for (const seg of worldEdges(r)) {
    if (seg.n[0] * out[0] + seg.n[1] * out[1] < 0.5) continue
    const length = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1])
    if (!best || length > best.length) best = { seg, length }
  }
  return best
}

/**
 * The frame that puts a zone of this size against that edge, touching it, lying along it, and
 * aligned as asked; `offset` is metres from the near end of the edge and overrules the alignment.
 */
export function standAgainst(
  target: Zone,
  name: EdgeName,
  mover: { name: string; w: number; h: number },
  along: Along,
  offset?: number,
): Placing {
  const edge = edgeOn(target, name)
  if (!edge) return { ok: false, why: `${target.name} shows no ${name} edge` }
  const { seg, length } = edge
  if (mover.w > length + 0.01)
    return {
      ok: false,
      why:
        `${target.name}'s ${name} edge is ${fmt(length)} m and ${mover.name} needs ` +
        `${fmt(mover.w)} m along it: turn it, resize it, or put it against a longer edge`,
    }
  // The zone lies with its own width along the edge and its depth away from it: its local x runs
  // along the edge and its local y points out of the target, whichever way the edge was walked.
  const u: Point = [seg.n[1], -seg.n[0]]
  // The start of the edge is its top-left end, and the offset is measured from there.
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
  // where the zone's own (0,0) corner lands: the end of its run that the edge's own direction starts
  const run = d[0] * u[0] + d[1] * u[1] > 0 ? at : at + mover.w
  const corner: Point = [first[0] + run * d[0], first[1] + run * d[1]]
  const turn = norm((Math.atan2(u[1], u[0]) * 180) / Math.PI)
  const a = (turn * Math.PI) / 180
  // the frame's centre, from the corner the zone's own (0,0) stands on
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
