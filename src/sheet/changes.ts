/**
 * What an action did to the sheet, in the terms the architect thinks in: which rooms moved and how
 * far, and which overlaps or spills appeared that were not there before. It is read by comparing the
 * sheet before with the sheet after, so nothing has to be threaded through the actions.
 */

import { bboxOf, r2 } from './geometry'
import { allPlaced, storeyOf, type Room, type Sheet } from './model'
import { report } from './report'

export type Move = {
  room: string
  /** Put on the sheet, moved, reshaped, or taken back to the program. */
  how: 'placed' | 'moved' | 'reshaped' | 'sent back'
  /** How far its middle travelled, in metres; nothing for a room that only changed shape. */
  metres?: number
}

export type Changed = {
  moves: Move[]
  /** The overlaps and spills that were not there before this action. */
  newOverlaps: { rooms: [string, string]; area: number }[]
  newSpills: string[]
}

const middle = (r: Room): [number, number] => {
  const b = bboxOf(r)
  return [b.x + b.w / 2, b.y + b.h / 2]
}

const reshaped = (was: Room, now: Room) =>
  Math.abs(was.w - now.w) > 0.01 ||
  Math.abs(was.h - now.h) > 0.01 ||
  Math.abs((was.angle || 0) - (now.angle || 0)) > 0.01 ||
  JSON.stringify(was.pieces) !== JSON.stringify(now.pieces)

const pairKey = (o: { a: string; b: string }) => [o.a, o.b].sort().join(' and ')

/** The rooms an action moved, and the trouble it left that was not there before. */
export function changesBetween(before: Sheet, after: Sheet, storey: number): Changed {
  const was = new Map(before.rooms.map((r) => [r.id, r]))
  const moves: Move[] = []
  for (const now of allPlaced(after)) {
    if (storeyOf(now) !== storey) continue
    const then = was.get(now.id)
    if (!then) continue
    if (!then.placed) {
      moves.push({ room: now.name, how: 'placed' })
      continue
    }
    const from = middle(then)
    const to = middle(now)
    const metres = r2(Math.hypot(to[0] - from[0], to[1] - from[1]))
    if (metres > 0.01) moves.push({ room: now.name, how: 'moved', metres })
    else if (reshaped(then, now)) moves.push({ room: now.name, how: 'reshaped' })
  }
  for (const then of allPlaced(before)) {
    if (storeyOf(then) !== storey) continue
    const now = after.rooms.find((r) => r.id === then.id)
    if (!now || !now.placed) moves.push({ room: then.name, how: 'sent back' })
  }
  const old = report(before, storey)
  const fresh = report(after, storey)
  const knownPairs = new Set(old.overlaps.map(pairKey))
  const knownSpills = new Set(old.spills)
  return {
    moves,
    newOverlaps: fresh.overlaps
      .filter((o) => !knownPairs.has(pairKey(o)))
      .map((o) => ({ rooms: [o.a, o.b] as [string, string], area: o.area })),
    newSpills: fresh.spills.filter((name) => !knownSpills.has(name)),
  }
}
