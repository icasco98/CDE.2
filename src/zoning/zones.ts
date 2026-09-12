import { signedArea, type Point, type Polygon } from '../geometry'
import { sidesOfCell, type Grid } from './grid'
import { allowed, usable, WALL } from './seeds'
import { NOBODY, type Division } from './types'

/*
 * From cells to shapes. A zone is the outline of the cells one room holds: one ring, because a
 * footprint is one polygon and a room with a hole in it is not a room. A zone that came out in two
 * pieces keeps the larger, and a room the division walled in is given a way out.
 */

/** One array, reused: the cells sharing a side with the cell being looked at. */
const beside = new Int32Array(4)

/** The cells one room holds, in index order. */
export function cellsOf(division: Division, room: number): readonly number[] {
  const out: number[] = []
  for (let index = 0; index < division.owner.length; index++)
    if (division.owner[index] === room) out.push(index)
  return out
}

/** The 4-connected pieces a room's cells fall into, largest first, then by their first cell. */
function piecesOf(division: Division, room: number): readonly (readonly number[])[] {
  const held = new Set(cellsOf(division, room))
  const pieces: number[][] = []
  const seen = new Set<number>()
  for (const start of held) {
    if (seen.has(start)) continue
    const piece: number[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const index = queue.pop() as number
      piece.push(index)
      for (let side = sidesOfCell(division.grid, index, beside); side-- > 0;) {
        const other = beside[side] as number
        if (!held.has(other) || seen.has(other)) continue
        seen.add(other)
        queue.push(other)
      }
    }
    pieces.push(piece.sort((a, b) => a - b))
  }
  return pieces.sort((a, b) => b.length - a.length || (a[0] ?? 0) - (b[0] ?? 0))
}

/**
 * A wall the seeding put down that the reaches left cut off from the rest of its room is joined
 * back to it, one cell wide, through whatever lies between. Decision 21: the morph may reshape a
 * pair of rooms, it may never part them, so a seeded contact is never simply given away.
 */
export function joinSeeds(division: Division, rooms: number): void {
  for (let room = 0; room < rooms; room++)
    for (let tries = 0; tries < TRIES; tries++) {
      const pieces = piecesOf(division, room)
      const main = pieces[0]
      const stray = pieces
        .slice(1)
        .find((piece) => piece.some((cell) => division.fixed[cell] === WALL))
      if (!main || !stray || !cutTo(division, room, main, stray)) break
    }
}

/** How many cut-off walls one room is joined back up before the rest are left to the pieces rule. */
const TRIES = 4

/** The shortest way from one piece of a room to another, cut through what lies between. */
function cutTo(
  division: Division,
  room: number,
  main: readonly number[],
  stray: readonly number[],
): boolean {
  const goal = new Set(main)
  const from = new Map<number, number>()
  const queue = [...stray]
  for (const cell of stray) from.set(cell, cell)
  while (queue.length > 0) {
    const index = queue.shift() as number
    for (let side = sidesOfCell(division.grid, index, beside); side-- > 0;) {
      const other = beside[side] as number
      if (from.has(other)) continue
      if (goal.has(other)) {
        for (let step = index; division.owner[step] !== room; step = from.get(step) as number)
          division.owner[step] = room
        return true
      }
      // A wall another room's seeding put down is not cut through, and neither is a claim; the
      // way round either of them is taken instead.
      if (!usable(division, other) || division.fixed[other] === WALL) continue
      if (!allowed(division, other, room)) continue
      from.set(other, index)
      queue.push(other)
    }
  }
  return false
}

/**
 * A zone that came out in two pieces keeps the larger; the smaller goes to the neighbour it
 * touches most, which is the room that was going to be on the other side of that wall anyway.
 */
export function keepOnePiece(division: Division, rooms: number): void {
  for (let room = 0; room < rooms; room++) {
    const pieces = piecesOf(division, room)
    for (const piece of pieces.slice(1)) {
      const touches = new Map<number, number>()
      for (const index of piece)
        for (let side = sidesOfCell(division.grid, index, beside); side-- > 0;) {
          const owner = division.owner[beside[side] as number] ?? NOBODY
          if (owner === room) continue
          touches.set(owner, (touches.get(owner) ?? 0) + 1)
        }
      let taker = NOBODY
      let most = 0
      for (const [owner, count] of [...touches].sort((a, b) => a[0] - b[0])) {
        // A claim is a wall: a stray piece standing on a garage's driveway goes to nobody rather
        // than to a room the claim does not name.
        if (owner !== NOBODY && piece.some((index) => !allowed(division, index, owner))) continue
        if (count > most) {
          most = count
          taker = owner
        }
      }
      for (const index of piece) {
        division.owner[index] = taker
        division.fixed[index] = 0
      }
    }
  }
}

/** Every cell the flood from the edge of the grid cannot reach without crossing this room. */
function walledIn(division: Division, room: number): readonly number[] {
  const grid = division.grid
  const reached = new Uint8Array(grid.cols * grid.rows)
  const queue: number[] = []
  for (let index = 0; index < reached.length; index++) {
    const col = index % grid.cols
    const row = (index - col) / grid.cols
    const edge = col === 0 || row === 0 || col + 1 === grid.cols || row + 1 === grid.rows
    if (!edge || division.owner[index] === room || reached[index] === 1) continue
    reached[index] = 1
    queue.push(index)
  }
  while (queue.length > 0) {
    const index = queue.pop() as number
    for (let side = sidesOfCell(grid, index, beside); side-- > 0;) {
      const other = beside[side] as number
      if (reached[other] === 1 || division.owner[other] === room) continue
      reached[other] = 1
      queue.push(other)
    }
  }
  const inside: number[] = []
  for (let index = 0; index < reached.length; index++)
    if (reached[index] === 0 && division.owner[index] !== room) inside.push(index)
  return inside
}

/**
 * Holes closed. A pocket of floor nobody holds goes to the room that surrounds it; a room the
 * division walled inside another is given a way out instead, one cell wide, because a room with a
 * hole in it cannot be one polygon and a room with no wall to the rest of the house is not a plan.
 */
export function fillHoles(division: Division, rooms: number): void {
  for (let room = 0; room < rooms; room++) {
    const inside = walledIn(division, room)
    const trapped = new Map<number, number[]>()
    for (const index of inside) {
      const owner = division.owner[index] ?? NOBODY
      if (owner === NOBODY) {
        // A pocket a claim holds is not the surrounding room's to fill: the ground in front of a
        // garage bay stays the garage's or nobody's even when a room has closed round it.
        if (allowed(division, index, room)) division.owner[index] = room
        continue
      }
      trapped.set(owner, [...(trapped.get(owner) ?? []), index])
    }
    for (const [other, cells] of [...trapped].sort((a, b) => a[0] - b[0]))
      cutOut(division, room, other, cells)
  }
}

/**
 * The shortest way out for a room walled inside another, cut one cell wide through the room that
 * surrounds it and given to the room inside, so both of them come out as one polygon and the wall
 * between them is a wall a door could go on.
 */
function cutOut(
  division: Division,
  around: number,
  trapped: number,
  cells: readonly number[],
): void {
  const from = new Map<number, number>()
  const queue = [...cells]
  for (const index of cells) from.set(index, index)
  while (queue.length > 0) {
    const index = queue.shift() as number
    for (let side = sidesOfCell(division.grid, index, beside); side-- > 0;) {
      const other = beside[side] as number
      if (from.has(other)) continue
      const owner = division.owner[other] ?? NOBODY
      if (!allowed(division, other, trapped)) continue
      if (owner !== around) {
        // The first cell beyond the room that surrounds it: the way back is the channel to cut.
        for (let step = index; division.owner[step] === around; step = from.get(step) as number) {
          division.owner[step] = trapped
          division.fixed[step] = 0
        }
        return
      }
      from.set(other, index)
      queue.push(other)
    }
  }
}

/** The corners of a cell, clockwise on the sheet, which is the winding a footprint's polygon has. */
function cornersOf(grid: Grid, index: number): readonly [Point, Point, Point, Point] {
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  const x = grid.left + col * grid.step
  const y = grid.top + row * grid.step
  return [
    [x, y],
    [x + grid.step, y],
    [x + grid.step, y + grid.step],
    [x, y + grid.step],
  ]
}

function keyOf(at: Point): string {
  return `${at[0].toFixed(4)}|${at[1].toFixed(4)}`
}

/** Runs of collinear corners are one wall, so a zone is drawn with the corners it really turns at. */
function straightened(ring: readonly Point[]): Polygon {
  const out: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const before = ring[(i + ring.length - 1) % ring.length] as Point
    const here = ring[i] as Point
    const after = ring[(i + 1) % ring.length] as Point
    const turn =
      (here[0] - before[0]) * (after[1] - here[1]) - (here[1] - before[1]) * (after[0] - here[0])
    if (Math.abs(turn) > 1e-9) out.push(here)
  }
  return out
}

/**
 * The outline of a set of cells: every side of a cell the set does not hold on its other side,
 * chained into rings. At a corner where the set touches itself the ring turns as tightly as it
 * can, which keeps two rings apart rather than joining them into a figure of eight.
 */
export function outlineOfCells(grid: Grid, cells: readonly number[]): readonly Polygon[] {
  const held = new Set(cells)
  const edges: Side[] = []
  const byStart = new Map<string, Side[]>()
  const put = (from: Point, to: Point): void => {
    const side: Side = { from, to, walked: false }
    edges.push(side)
    const key = keyOf(from)
    byStart.set(key, [...(byStart.get(key) ?? []), side])
  }
  for (const index of cells) {
    const [a, b, c, d] = cornersOf(grid, index)
    const col = index % grid.cols
    const row = (index - col) / grid.cols
    if (row === 0 || !held.has(index - grid.cols)) put(a, b)
    if (col + 1 === grid.cols || !held.has(index + 1)) put(b, c)
    if (row + 1 === grid.rows || !held.has(index + grid.cols)) put(c, d)
    if (col === 0 || !held.has(index - 1)) put(d, a)
  }
  const rings: Polygon[] = []
  for (const seed of edges) {
    if (seed.walked) continue
    const ring: Point[] = []
    let side = seed
    while (!side.walked) {
      side.walked = true
      ring.push(side.from)
      const onward = (byStart.get(keyOf(side.to)) ?? []).filter((each) => !each.walked)
      const next = onward.length === 1 ? onward[0] : tightest(side, onward)
      if (!next) break
      side = next
    }
    const shape = straightened(ring)
    if (shape.length >= 3) rings.push(shape)
  }
  return rings
}

/** One side of one cell that the room does not hold on its other side: a piece of the outline. */
type Side = { readonly from: Point; readonly to: Point; walked: boolean }

/** The tightest turn out of a corner, keeping the floor on the same hand all the way round. */
function tightest(came: Side, waiting: readonly Side[]): Side | undefined {
  const was: Point = [came.to[0] - came.from[0], came.to[1] - came.from[1]]
  let best: Side | undefined
  let bestTurn = -Infinity
  for (const side of waiting) {
    const going: Point = [side.to[0] - came.to[0], side.to[1] - came.to[1]]
    // Positive is a turn towards the floor the ring keeps on its right, so the sharpest of those
    // comes first and a run that touches itself at a corner comes out as two rings, not one.
    const turn = was[0] * going[1] - was[1] * going[0]
    const back = was[0] * going[0] + was[1] * going[1] < 0 ? -2 : 0
    const score = (turn > 0 ? 1 : turn < 0 ? -1 : 0) + back
    if (score <= bestTurn) continue
    bestTurn = score
    best = side
  }
  return best
}

/** The one ring a zone is: its outline's largest, which is the only one a footprint can carry. */
export function zoneOfCells(grid: Grid, cells: readonly number[]): Polygon {
  let largest: Polygon = []
  let most = 0
  for (const ring of outlineOfCells(grid, cells)) {
    const held = Math.abs(signedArea(ring))
    if (held <= most) continue
    most = held
    largest = signedArea(ring) >= 0 ? ring : [...ring].reverse()
  }
  return largest
}
