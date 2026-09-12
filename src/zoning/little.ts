import { ownedBy, windowOf } from './cores'
import type { Grid } from './grid'
import { contactsOwed, type Zoned } from './moves'
import { allowed, usable, WALL } from './seeds'
import { cellsOfBox, cellsOfShape, jogsRun, shapeOfCells, JOG, type Box, type Shape } from './shape'
import { NOBODY, type Division, type PartitionRoom } from './types'

/*
 * The small rooms. A room of a few square metres cannot be argued into shape by moving walls —
 * one step of a two-metre wall is a tenth of it — so it is drawn at its target outright: whole
 * grid steps either way, no narrower than the Municipality's 1.20 m, the sides nearest the
 * proportion its own cells had. It is put where it covers most of its own floor and most of the
 * walls seeded on it, and the room it takes the rest from makes way.
 */

/**
 * How far from where its cells lie a small room's rectangle may be put, in cells. Near first, and
 * only where nothing near will do at all is the room carried four metres: a room the division left
 * a strip a metre wide has to go somewhere it can be a room.
 */
const REACHES = [8, 16]

/** How many proportions a small room is offered before the nearest ones are taken as the answer. */
const SHAPES = 6

/** The narrowest a small room is drawn, in cells: the Municipality's 1.20 m, taken up to the grid. */
const LEAST_SIDE = 5

/** How far a small room's rectangle may overrun its target, in cells: the brief's one cell. */
const SLACK = 1

/** What standing on the wrong proportion costs, against a cell of the room's own floor. */
const SHAPELY = 3

/** What a cell is worth to a small room: its own floor, the walls seeded on it, and free floor. */
const OWN = 2
const SEEDED = 10
const FREE = 1

/** What a cell taken off the room next door costs, so a small room takes the spare floor first. */
const TAKEN = 3

/**
 * Every small room of the storey drawn at its target. They are taken in the order the program
 * holds them and each is settled before the next is looked at, so the same diagram gives the same
 * rooms; once one is down it is pinned, and no wall the settling moves afterwards touches it.
 */
export function settleLittle(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  rooms: readonly PartitionRoom[],
  contacts: readonly (readonly [number, number])[],
  little: (room: PartitionRoom) => boolean,
  corridor: number,
): void {
  for (const zone of zoned) {
    const room = rooms[zone.index]
    if (!room || !little(room) || zone.pinned) continue
    if (zone.held === zone.target) {
      zone.pinned = true
      continue
    }
    const put = placeFor(division, held, zoned, zone, contacts, corridor)
    if (!put) continue
    apply(division, held, zoned, zone, put)
    zone.pinned = true
  }
}

/** One small room put down: its own rectangle, and the shape each room round it is left with. */
type Placing = {
  readonly box: Box
  readonly others: ReadonlyMap<number, { readonly shape: Shape; readonly held: number }>
  /** The room the cells the small one lets go are handed to, or `NOBODY` where they are let go. */
  readonly taker: number
  /** Cells a neighbour gave up to keep its own walls running, which the wall-moving hands on. */
  readonly freed: readonly number[]
}

function placeFor(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  zone: Zoned,
  contacts: readonly (readonly [number, number])[],
  corridor: number,
): Placing | null {
  const grid = division.grid
  const shape = zone.shape
  // A room the fitting left nothing at all is put down from its bubble instead of from its cells,
  // square, because there is no floor of its own left to read a proportion off.
  const stood = shape === null ? null : windowOf(grid, cellsOfShape(grid, shape), 0)
  const own = ownedBy(division, zone.index)
  const shapes = sidesFor(zone.target, stood === null ? 1 : stood.cols / stood.rows).slice(
    0,
    SHAPES,
  )
  for (const reach of REACHES) {
    const window = windowOf(
      grid,
      own.length > 0 ? own : [Math.round(zone.at[1]) * grid.cols + Math.round(zone.at[0])],
      reach,
    )
    let best: Placing | null = null
    let most = -Infinity
    for (const [rank, sides] of shapes.entries())
      for (let row = window.row; row + sides.rows <= window.row + window.rows; row++)
        for (let col = window.col; col + sides.cols <= window.col + window.cols; col++) {
          const box: Box = { col, row, cols: sides.cols, rows: sides.rows }
          const worth = worthOf(division, zone.index, box)
          if (worth === null) continue
          const away = Math.hypot(
            col + sides.cols / 2 - zone.at[0],
            row + sides.rows / 2 - zone.at[1],
          )
          // The proportion its own cells had comes first, but a rectangle of the right size in the
          // wrong proportion is still a room, and one short of its target is not.
          const score = worth - rank * SHAPELY - away / 1000
          if (score <= most) continue
          const made = makeRoom(division, held, zoned, zone, box, corridor)
          if (!made || parts(zoned, contacts, zone, made)) continue
          most = score
          best = made
        }
    if (best) return best
  }
  return null
}

/**
 * Every pair of sides a rectangle of `target` cells can take, the proportion the room already had
 * first. Nothing narrower than the Municipality's least width unless nothing else will do at all.
 */
function sidesFor(target: number, shape: number): readonly Box[] {
  const found: { box: Box; off: number }[] = []
  for (const least of [LEAST_SIDE, JOG]) {
    for (let cols = least; cols <= target; cols++) {
      const rows = Math.ceil(target / cols)
      if (rows < least || cols * rows - target > SLACK) continue
      found.push({
        box: { col: 0, row: 0, cols, rows },
        off: Math.abs(Math.log(cols / rows) - Math.log(shape)),
      })
    }
    if (found.length > 0) break
  }
  return found.sort((one, other) => one.off - other.off).map((each) => each.box)
}

/** What a box is worth to a small room; nothing where a cell of it is floor the room may not have. */
function worthOf(division: Division, index: number, box: Box): number | null {
  const grid = division.grid
  const cells = cellsOfBox(grid, box)
  if (cells.length !== box.cols * box.rows) return null
  let worth = 0
  for (const cell of cells) {
    if (!usable(division, cell) || !allowed(division, cell, index)) return null
    if (division.owner[cell] !== index) worth += division.owner[cell] === NOBODY ? FREE : -TAKEN
    else worth += division.fixed[cell] === WALL ? OWN + SEEDED : OWN
  }
  return worth
}

/**
 * The rooms round a small one asked to make way for it. Each gives up whatever of its floor the
 * rectangle stands on and takes back whatever the small room lets go, and the move is only made
 * where every one of them is still a rectangle or an L afterwards and still has its own floor.
 */
function makeRoom(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  zone: Zoned,
  box: Box,
  corridor: number,
): Placing | null {
  const grid = division.grid
  const wanted = new Set(cellsOfBox(grid, box))
  const losing = new Set<number>()
  for (const cell of wanted) {
    const taken = held[cell] as number
    if (taken === NOBODY || taken === zone.index) continue
    // Neither a room already built on another storey nor the corridor's own run gives way to a
    // small room: the run has a width the Municipality sets, and a bite out of its side would
    // narrow it where it could not be seen.
    if ((zoned[taken] as Zoned).pinned || taken === corridor) return null
    losing.add(taken)
  }
  const going = (zone.shape === null ? [] : cellsOfShape(grid, zone.shape)).filter(
    (cell) => !wanted.has(cell),
  )
  const largest = [...losing].sort(
    (one, other) => (zoned[other] as Zoned).held - (zoned[one] as Zoned).held || one - other,
  )[0]
  for (const taker of [largest ?? NOBODY, NOBODY]) {
    const others = new Map<number, { shape: Shape; held: number }>()
    const freed: number[] = []
    let ok = true
    for (const other of new Set([...losing, ...(taker === NOBODY ? [] : [taker])])) {
      const neighbour = zoned[other] as Zoned
      const standing = cellsOfShape(grid, neighbour.shape as Shape)
      const cut = cutFor(grid, neighbour.shape as Shape, standing, wanted)
      const cells = standing.filter((cell) => !cut.has(cell))
      if (taker === other) cells.push(...going.filter((cell) => !cut.has(cell)))
      const kept = [...new Set(cells)]
      const made = kept.length === 0 ? null : shapeOfCells(grid, kept)
      if (!made || !jogsRun(made) || kept.length < neighbour.floor) {
        ok = false
        break
      }
      for (const cell of cut) if (!wanted.has(cell)) freed.push(cell)
      others.set(other, { shape: made, held: kept.length })
    }
    if (ok) return { box, others, taker, freed }
  }
  return null
}

/**
 * What a neighbour has to give up so that a small room may stand where it does. The cells the
 * rectangle covers, and, where those cells sit in a corner of a plain rectangle, the whole of that
 * corner: a room that gave up only the cells under the other would be left with a bite out of its
 * side, and a bite is not a wall. What the corner gives over is floor nobody holds, which the
 * wall-moving then hands to whoever is short.
 */
function cutFor(
  grid: Grid,
  shape: Shape,
  standing: readonly number[],
  wanted: ReadonlySet<number>,
): ReadonlySet<number> {
  const lost = standing.filter((cell) => wanted.has(cell))
  const cut = new Set(lost)
  if (shape.arm !== null || lost.length === 0) return cut
  const box = shape.main
  let left = grid.cols
  let right = -1
  let top = grid.rows
  let bottom = -1
  for (const cell of lost) {
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    left = Math.min(left, col)
    right = Math.max(right, col)
    top = Math.min(top, row)
    bottom = Math.max(bottom, row)
  }
  const cols =
    left - box.col <= box.col + box.cols - 1 - right
      ? { from: box.col, to: right }
      : { from: left, to: box.col + box.cols - 1 }
  const rows =
    top - box.row <= box.row + box.rows - 1 - bottom
      ? { from: box.row, to: bottom }
      : { from: top, to: box.row + box.rows - 1 }
  for (let row = rows.from; row <= rows.to; row++)
    for (let col = cols.from; col <= cols.to; col++) cut.add(row * grid.cols + col)
  return cut
}

/** Whether putting a small room down would leave a pair the bubbles put together owing more wall. */
function parts(
  zoned: readonly Zoned[],
  contacts: readonly (readonly [number, number])[],
  zone: Zoned,
  put: Placing,
): boolean {
  const after = new Map<number, Shape | null>([[zone.index, { main: put.box, arm: null }]])
  const before = new Map<number, Shape | null>([[zone.index, zone.shape]])
  for (const [other, made] of put.others) {
    after.set(other, made.shape)
    before.set(other, (zoned[other] as Zoned).shape)
  }
  return contactsOwed(zoned, contacts, after) > contactsOwed(zoned, contacts, before)
}

function apply(
  division: Division,
  held: Int32Array,
  zoned: readonly Zoned[],
  zone: Zoned,
  put: Placing,
): void {
  const grid = division.grid
  if (zone.shape !== null) for (const cell of cellsOfShape(grid, zone.shape)) held[cell] = NOBODY
  for (const [other, made] of put.others) {
    const neighbour = zoned[other] as Zoned
    neighbour.shape = made.shape
    neighbour.held = made.held
    for (const cell of cellsOfShape(grid, made.shape)) held[cell] = other
  }
  for (const cell of put.freed) held[cell] = NOBODY
  for (const cell of cellsOfBox(grid, put.box)) held[cell] = zone.index
  zone.shape = { main: put.box, arm: null }
  zone.held = put.box.cols * put.box.rows
}
