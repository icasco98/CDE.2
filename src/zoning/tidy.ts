import { sidesOfCell } from './grid'
import { allowed, usable } from './seeds'
import { NOBODY, type Division } from './types'

/*
 * The reaches put every cell where the bubbles want it and leave the boundaries between them
 * ragged, because a circle cut against another circle is not a wall. Two passes make the zones
 * read as shapes: a cell most of whose neighbours belong to one other room joins it, and a cell
 * flanked on both sides by one other room stops being a spike. Neither ever touches a cell a wall
 * put down, takes the floor from a room that has hardly any, or crosses the buildable line.
 */

/** How many of the four neighbours must agree before a cell joins them. */
const MAJORITY = 3

/** What a pass answers where it would leave a cell where it is. */
const STAY = -2

/** How many times the two passes are run before the zones are left as they are. */
const SWEEPS = 3

/** One array, reused: the cells sharing a side with the cell being looked at. */
const beside = new Int32Array(4)

/** The rooms with so little floor that the tidying never takes any of it. */
function holdingLittle(division: Division, small: number): ReadonlySet<number> {
  const areas = new Map<number, number>()
  for (const owner of division.owner)
    if (owner !== NOBODY) areas.set(owner, (areas.get(owner) ?? 0) + division.grid.cellArea)
  const little = new Set<number>()
  for (const [room, area] of areas) if (area < small) little.add(room)
  return little
}

/**
 * One pass, read from the division as it stands and written all at once, so what comes out does
 * not depend on which cell the pass reached first.
 */
function pass(
  division: Division,
  choose: (index: number, around: Int32Array, sides: number, mine: number) => number,
  small: number,
): boolean {
  const little = holdingLittle(division, small)
  const next = Int32Array.from(division.owner)
  let changed = false
  for (let index = 0; index < division.owner.length; index++) {
    if (division.fixed[index] !== 0 || !usable(division, index)) continue
    const mine = division.owner[index] ?? NOBODY
    if (little.has(mine)) continue
    const wanted = choose(index, beside, sidesOfCell(division.grid, index, beside), mine)
    if (wanted === STAY || wanted === mine) continue
    if (wanted !== NOBODY && !allowed(division, index, wanted)) continue
    next[index] = wanted
    changed = true
  }
  division.owner.set(next)
  return changed
}

/** The room three or more of a cell's four neighbours hold, where they agree on one. */
function majority(division: Division, around: Int32Array, sides: number, mine: number): number {
  const count = new Map<number, number>()
  for (let side = 0; side < sides; side++) {
    const owner = division.owner[around[side] as number] ?? NOBODY
    count.set(owner, (count.get(owner) ?? 0) + 1)
  }
  for (const [owner, held] of count) if (owner !== mine && held >= MAJORITY) return owner
  return STAY
}

/** The room holding both of a cell's opposite sides, where one does. */
function flanking(division: Division, index: number, mine: number): number {
  const grid = division.grid
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    if (col - dx < 0 || row - dy < 0 || col + dx >= grid.cols || row + dy >= grid.rows) continue
    const held = division.owner[index - dy * grid.cols - dx] ?? NOBODY
    if (held !== mine && held === (division.owner[index + dy * grid.cols + dx] ?? NOBODY))
      return held
  }
  return STAY
}

export function tidy(division: Division, small: number): void {
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const one = pass(
      division,
      (_index, around, sides, mine) => majority(division, around, sides, mine),
      small,
    )
    const other = pass(
      division,
      (index, _around, _sides, mine) => flanking(division, index, mine),
      small,
    )
    if (!one && !other) break
  }
}
