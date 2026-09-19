/**
 * How the rooms on a storey stand to each other: which pairs share a run of wall and how long it
 * is, and which pairs only meet at a corner or stand a sliver apart. This is what the architect
 * reasons with instead of coordinates, so everything here is named by room and measured in metres.
 */

import { placedRooms, type Room, type Sheet } from './model'
import { r2, worldWalls, type Seg } from './geometry'

/** A gap wider than this is two rooms standing apart, not a sliver worth reporting. */
export const NEAR_GAP = 0.5

/** Walls this close are one wall: the tolerance the sheet's own welding works to. */
const TOUCHING = 0.02

/** Corners this close are the same corner. */
const SAME_CORNER = 0.05

/** A run of shared wall shorter than this is a nick where two corners cross, not a shared wall. */
const SHARED_LEAST = 0.05

export type Sharing = { rooms: [string, string]; metres: number }

/** A pair that does not share a wall but all but touches: at a corner, or across a sliver. */
export type Apart = { rooms: [string, string]; how: 'a corner' | 'a gap'; metres: number }

export type Meetings = { sharing: Sharing[]; apart: Apart[] }

type Run = { along: number; apart: number }

/** How two walls facing each other stand: how much of their run they share, and how far apart. */
function facingRun(m: Seg, o: Seg): Run | null {
  const ml = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1])
  const ol = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1])
  if (ml < 1e-9 || ol < 1e-9) return null
  const u: [number, number] = [(m.b[0] - m.a[0]) / ml, (m.b[1] - m.a[1]) / ml]
  // the walls must run the same way and face each other, or they are not two sides of one wall
  if (Math.abs((u[0] * (o.b[1] - o.a[1]) - u[1] * (o.b[0] - o.a[0])) / ol) > 0.02) return null
  if (m.n[0] * o.n[0] + m.n[1] * o.n[1] > -0.9) return null
  const apart = (o.a[0] - m.a[0]) * m.n[0] + (o.a[1] - m.a[1]) * m.n[1]
  if (apart < -TOUCHING) return null // they overlap: the report names that, not this
  const t = (p: [number, number]) => p[0] * u[0] + p[1] * u[1]
  const m0 = Math.min(t(m.a), t(m.b))
  const m1 = Math.max(t(m.a), t(m.b))
  const o0 = Math.min(t(o.a), t(o.b))
  const o1 = Math.max(t(o.a), t(o.b))
  return { along: Math.min(m1, o1) - Math.max(m0, o0), apart }
}

/** The closest two rooms' corners come to each other. */
function cornerGap(a: Room, b: Room): number {
  let least = Infinity
  for (const wa of worldWalls(a))
    for (const wb of worldWalls(b))
      least = Math.min(least, Math.hypot(wa.a[0] - wb.a[0], wa.a[1] - wb.a[1]))
  return least
}

/** How one pair of rooms stands: the wall they share, else how they all but touch, else nothing. */
export function meetingOf(a: Room, b: Room): Sharing | Apart | null {
  let shared = 0
  let gap = Infinity
  for (const m of worldWalls(a))
    for (const o of worldWalls(b)) {
      const run = facingRun(m, o)
      if (!run) continue
      if (run.apart <= TOUCHING) {
        if (run.along > SHARED_LEAST) shared += run.along
      } else if (run.along > SHARED_LEAST && run.apart <= NEAR_GAP) gap = Math.min(gap, run.apart)
    }
  const rooms: [string, string] = [a.name, b.name]
  if (shared > SHARED_LEAST) return { rooms, metres: r2(shared) }
  const corner = cornerGap(a, b)
  if (corner <= SAME_CORNER) return { rooms, how: 'a corner', metres: 0 }
  if (gap <= NEAR_GAP) return { rooms, how: 'a gap', metres: r2(gap) }
  return null
}

const isSharing = (met: Sharing | Apart): met is Sharing => !('how' in met)

/** Every pair on the storey that meets, longest shared wall first, then the pairs that all but do. */
export function meetingsOf(sheet: Sheet, storey: number): Meetings {
  const rooms = placedRooms(sheet, storey)
  const sharing: Sharing[] = []
  const apart: Apart[] = []
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const met = meetingOf(rooms[i]!, rooms[j]!)
      if (!met) continue
      if (isSharing(met)) sharing.push(met)
      else apart.push(met)
    }
  sharing.sort((p, q) => q.metres - p.metres)
  return { sharing, apart }
}
