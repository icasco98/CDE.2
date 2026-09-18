/**
 * Landing: where a room is held, and how an overlap is settled. The order of importance is the
 * program order, and the lower room gives way — pushed aside or carved. Nothing moves a room on its
 * own except the landing rule the architect chose.
 */

import { BUILD, PLOT, type Box } from './plot'
import {
  ghostsOf,
  isGhost,
  isOpen,
  kin,
  placedRooms,
  rank,
  square,
  type Room,
  type Settings,
  type Sheet,
} from './model'
import {
  bboxOf,
  cornersOf,
  cutBy,
  localBox,
  overlapCells,
  overlapRect,
  r6,
  setFrame,
  loseSize,
  type Poly,
} from './geometry'

/** Where the ground floor may stand: inside the setback line, or out to the boundary. */
export function allowedBox(sheet: Sheet, storey: number): Box {
  // upstairs the setback holds everywhere
  if (storey > 0 && sheet.settings.hardSetback) return BUILD
  if (sheet.settings.boundary === 'sides') return { x: 0, y: 0, w: PLOT.w, h: BUILD.y + BUILD.h }
  if (sheet.settings.boundary === 'all') return { x: 0, y: 0, w: PLOT.w, h: PLOT.h }
  return BUILD
}

export function holdIn(r: Room, box: Box): Room {
  const b = bboxOf(r)
  const dx = b.w <= box.w ? Math.min(Math.max(b.x, box.x), box.x + box.w - b.w) - b.x : box.x - b.x
  const dy = b.h <= box.h ? Math.min(Math.max(b.y, box.y), box.y + box.h - b.h) - b.y : box.y - b.y
  return { ...r, x: r6(r.x + dx), y: r6(r.y + dy) }
}

export const holdOnPlot = (r: Room) => holdIn(r, { x: 0, y: 0, w: PLOT.w, h: PLOT.h })

/**
 * Where a room is kept: on the plot when rooms may leave the buildable line, else inside the line it
 * may reach; upstairs the setback holds hard, spill or no spill.
 */
export function hold(r: Room, sheet: Sheet, storey: number): Room {
  if (storey > 0 && sheet.settings.hardSetback && !isOpen(r)) return holdIn(r, BUILD)
  if (sheet.settings.allowSpill || isOpen(r)) return holdOnPlot(r)
  return holdIn(r, allowedBox(sheet, storey))
}

/** Past the line the ground floor may reach. */
export function outsideBuildable(r: Room, box: Box): boolean {
  const b = bboxOf(r)
  return (
    b.x < box.x - 1e-6 ||
    b.y < box.y - 1e-6 ||
    b.x + b.w > box.x + box.w + 1e-6 ||
    b.y + b.h > box.y + box.h + 1e-6
  )
}

/**
 * The least move that parts two rectangles, turned or not: the shortest overlap along any of their
 * four edge directions, pointed from the first's centre to the second's.
 */
export function partingMove(a: Room, b: Room): [number, number] | null {
  const pa = cornersOf(a)
  const pb = cornersOf(b)
  const axes: [number, number][] = []
  for (const p of [pa, pb])
    for (let i = 0; i < 2; i++) {
      const [x1, y1] = p[i]!
      const [x2, y2] = p[i + 1]!
      const l = Math.hypot(x2 - x1, y2 - y1) || 1
      axes.push([-(y2 - y1) / l, (x2 - x1) / l])
    }
  let best: { over: number; nx: number; ny: number; dir: number } | null = null
  for (const [nx, ny] of axes) {
    const proj = (p: [number, number][]) => p.map(([x, y]) => x * nx + y * ny)
    const qa = proj(pa)
    const qb = proj(pb)
    // How far b must go along the axis, either way, to clear a: the shorter way wins on this axis.
    const forward = Math.max(...qa) - Math.min(...qb)
    const backward = Math.max(...qb) - Math.min(...qa)
    if (forward <= 0 || backward <= 0) return null
    const over = Math.min(forward, backward)
    const dir = forward <= backward ? 1 : -1
    if (!best || over < best.over) best = { over, nx, ny, dir }
  }
  const m: { over: number; nx: number; ny: number; dir: number } = best!
  return [m.nx * m.over * m.dir, m.ny * m.over * m.dir]
}

const retire = (r: Room) => {
  r.placed = false
}

/**
 * Push: the dropped room stays; every neighbour it overlaps is moved out, square neighbours of a
 * square room along the axis of least penetration, anything turned by the least parting move, and
 * that neighbour then pushes its own, up to a fixed number of rounds so a chain slides as one.
 */
export function pushFrom(
  mover: Room,
  all: Room[],
  sheet: Sheet,
  storey: number,
): Map<string, true> {
  const moved = new Map<string, true>()
  const queue: Room[] = [mover]
  let rounds = 0
  while (queue.length && rounds++ < 60) {
    const a = queue.shift()!
    for (const b of all) {
      if (b === a || b === mover) continue
      if (!overlapCells(a, b).length) continue
      if (b.fixed || b.locked) {
        // A court never moves: whatever landed on it is set off it instead.
        const m = partingMove(b, a)
        if (!m) continue
        const asked = { ...a, x: r6(a.x + m[0]), y: r6(a.y + m[1]) }
        const off = sheet.settings.allowSpill
          ? holdOnPlot(asked)
          : holdIn(asked, allowedBox(sheet, storey))
        const mx = off.x - a.x
        const my = off.y - a.y
        for (const o of kin(a, all)) {
          const h = hold({ ...o, x: r6(o.x + mx), y: r6(o.y + my) }, sheet, storey)
          o.x = h.x
          o.y = h.y
          moved.set(o.id, true)
          if (o !== a) queue.push(o)
        }
        continue
      }
      if (a.fixed || a.locked) continue
      let next: Room
      if (square(a) && square(b)) {
        const o = overlapRect(bboxOf(a), bboxOf(b)) ?? { x: 0, y: 0, w: 0, h: 1 }
        const ax = a.x + a.w / 2
        const bx = b.x + b.w / 2
        const ay = a.y + a.h / 2
        const by = b.y + b.h / 2
        let nx = b.x
        let ny = b.y
        if (o.w < o.h) nx = bx >= ax ? a.x + a.w : a.x - b.w
        else ny = by >= ay ? a.y + a.h : a.y - b.h
        next = { ...b, x: r6(nx), y: r6(ny) }
      } else {
        const m = partingMove(a, b)
        if (!m) continue
        next = { ...b, x: r6(b.x + m[0]), y: r6(b.y + m[1]) }
      }
      next = sheet.settings.allowSpill ? holdOnPlot(next) : holdIn(next, allowedBox(sheet, storey))
      const mx = next.x - b.x
      const my = next.y - b.y
      // a grouped room takes its group along
      for (const o of kin(b, all)) {
        const h = o === b ? next : hold({ ...o, x: r6(o.x + mx), y: r6(o.y + my) }, sheet, storey)
        o.x = h.x
        o.y = h.y
        moved.set(o.id, true)
        queue.push(o)
      }
    }
  }
  return moved
}

/**
 * Yield: the dropped room is cut back in its own frame on the side that loses least, once per
 * overlapping piece, until it overlaps nothing; or, when it keeps the rest, it loses only the pieces
 * themselves and stands as an L.
 */
export function yieldTo(mover: Room, all: Room[], settings: Settings): Room | null {
  if (settings.yieldKeeps === 'rest') {
    let cur: Room | null = mover
    for (const b of all)
      if (b !== mover) {
        cur = cutBy(mover, b)
        if (!cur) {
          retire(mover)
          return null
        }
      }
    return cur
  }
  let guard = 0
  while (guard++ < 24) {
    let piece: Box | null = null
    for (const b of all) {
      if (b === mover) continue
      const ps = overlapCells(mover, b)
      if (ps.length) {
        piece = localBox(mover, ps[0]!)
        break
      }
    }
    if (!piece) return mover
    const o = piece
    const w = mover.w
    const h = mover.h
    const cuts = [
      { loss: (o.x + o.w) * h, lx: o.x + o.w, ly: 0, lw: w - (o.x + o.w), lh: h },
      { loss: (w - o.x) * h, lx: 0, ly: 0, lw: o.x, lh: h },
      { loss: (o.y + o.h) * w, lx: 0, ly: o.y + o.h, lw: w, lh: h - (o.y + o.h) },
      { loss: (h - o.y) * w, lx: 0, ly: 0, lw: w, lh: o.y },
    ].sort((p, s) => p.loss - s.loss)
    const c = cuts[0]!
    if (c.lw < 1 || c.lh < 1) {
      retire(mover)
      return null
    }
    loseSize(mover, mover.w - c.lw, mover.h - c.lh)
    if (!setFrame(mover, c.lx, c.ly, c.lw, c.lh)) {
      retire(mover)
      return null
    }
  }
  return mover
}

export type Give = 'push' | 'yield' | 'carve'

/** One room gives way to another: pushed aside, trimmed to the free space, or carved by its shape. */
export function giveWay(
  loser: Room,
  winner: Room,
  how: Give,
  moved: Map<string, true>,
  sheet: Sheet,
  storey: number,
): boolean {
  if (loser.fixed || loser.locked || isGhost(loser, storey, sheet)) return false
  if (how === 'push') {
    const m = pushFrom(winner, [winner, loser], sheet, storey)
    for (const [k, v] of m) moved.set(k, v)
    return m.size > 0
  }
  if (how === 'yield') {
    yieldTo(loser, [winner], sheet.settings)
    return true
  }
  if (!cutBy(loser, winner)) retire(loser)
  return true
}

/** Every overlap on the storey, pair by pair. */
export function overlapsOf(sheet: Sheet, storey: number): { a: Room; b: Room; polys: Poly[] }[] {
  const out: { a: Room; b: Room; polys: Poly[] }[] = []
  const p = placedRooms(sheet, storey).concat(ghostsOf(sheet, storey))
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      const polys = overlapCells(p[i]!, p[j]!)
      if (polys.length) out.push({ a: p[i]!, b: p[j]!, polys })
    }
  return out
}

/**
 * After a room moves, every overlap it is in is settled, the lower room giving way each time; a room
 * pushed into another is settled in turn. Locked and fixed rooms never give way. Wait leaves the
 * overlap tinted until it is settled by hand, so nothing moves at all.
 */
export function settle(r: Room, how: string, sheet: Sheet, storey: number): Map<string, true> {
  const moved = new Map<string, true>()
  const seen = new Map<string, number>()
  let guard = 0
  if (how !== 'push') return moved
  const keyOf = (o: { a: Room; b: Room }) => [o.a.id, o.b.id].sort().join('|')
  while (guard++ < 40) {
    // every overlap the moved rooms are in, each pair tried at most twice
    const pairs = overlapsOf(sheet, storey).filter(
      (o) =>
        (o.a === r || o.b === r || moved.has(o.a.id) || moved.has(o.b.id)) &&
        (seen.get(keyOf(o)) ?? 0) < 2,
    )
    if (!pairs.length) break
    const o = pairs[0]!
    const key = keyOf(o)
    seen.set(key, (seen.get(key) ?? 0) + 1)
    let [win, lose] = rank(o.a, sheet) <= rank(o.b, sheet) ? [o.a, o.b] : [o.b, o.a]
    const stuck = (x: Room) => x.fixed || x.locked || isGhost(x, storey, sheet)
    // a locked room never gives way, even to a higher one
    if (stuck(lose!) && !stuck(win!)) [win, lose] = [lose, win]
    giveWay(lose!, win!, 'push', moved, sheet, storey)
  }
  return moved
}

/** The overlap settled by hand: the other rooms pushed aside, trimmed, or carved by this one. */
export function resolve(mover: Room, how: Give, sheet: Sheet, storey: number): Map<string, true> {
  const all = placedRooms(sheet, storey)
  if (how === 'push') return pushFrom(mover, all, sheet, storey)
  if (how === 'yield') {
    yieldTo(mover, all, sheet.settings)
    return new Map()
  }
  for (const b of all)
    if (b !== mover && b.placed && !b.fixed && !b.locked) if (!cutBy(b, mover)) retire(b)
  return new Map()
}
