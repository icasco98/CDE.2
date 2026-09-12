import { sidesOfCell } from './grid'
import { allowed, usable } from './seeds'
import { NOBODY, type Division, type PartitionRoom } from './types'

/*
 * The division itself: every free cell goes to the bubble whose reach covers it most deeply,
 * distance squared less a weight, and a cell no reach covers stays outside the house. The weights
 * are the one thing adjusted — round by round, until each room holds the area it asked for.
 *
 * Distance is measured along the longer of the two axes rather than as the crow flies. That is
 * still one number against a weight, and it is the number a plan is drawn with: a reach nothing
 * contests comes out a square instead of a circle, and a boundary between two reaches runs along
 * a grid line instead of curving, so the zones read as rooms before half two straightens them.
 */

/** How much floor a reach gains for each metre squared of weight: a square of side twice its reach. */
const SQUARE = 4

/** How many rounds the weights and the reaches are given to come to the targets. */
const ROUNDS = 40

/**
 * The rounds the reaches are walked back on: the second and the fourth eighth of the run. The
 * weights are given the rounds before the first walk to bring the areas near their targets, so the
 * walk is read off zones already about the right size, and every round after the second to bring
 * them back, so what follows has only single cells left to hand over. Two walks, because one
 * leaves a storey that spills its zones well off their bubbles and three is no better than two.
 */
const SETTLING = 8

/**
 * How much of each round's shortfall is taken into the weight. A room standing alone gains four
 * square metres of floor for every one of weight, so the whole of the shortfall over four is the
 * step that would close it at once; short of that, because a room hemmed in by others gains less
 * than that and a full step would have the weights ringing from one round to the next.
 */
const GAIN = 0.7

function areasOf(division: Division, count: number): Float64Array {
  const areas = new Float64Array(count)
  for (let index = 0; index < division.owner.length; index++) {
    const owner = division.owner[index] ?? NOBODY
    if (owner !== NOBODY) areas[owner] = (areas[owner] ?? 0) + division.grid.cellArea
  }
  return areas
}

/** What each room holds and where the middle of it falls, read in one pass over the cells. */
function heldBy(
  division: Division,
  count: number,
): { readonly areas: Float64Array; readonly x: Float64Array; readonly y: Float64Array } {
  const grid = division.grid
  const areas = new Float64Array(count)
  const x = new Float64Array(count)
  const y = new Float64Array(count)
  for (let index = 0; index < division.owner.length; index++) {
    const owner = division.owner[index] ?? NOBODY
    if (owner === NOBODY) continue
    const col = index % grid.cols
    areas[owner] = (areas[owner] ?? 0) + grid.cellArea
    x[owner] = (x[owner] ?? 0) + grid.left + (col + 0.5) * grid.step
    y[owner] = (y[owner] ?? 0) + grid.top + ((index - col) / grid.cols + 0.5) * grid.step
  }
  for (let room = 0; room < count; room++) {
    const held = (areas[room] ?? 0) / grid.cellArea
    if (held === 0) continue
    x[room] = (x[room] ?? 0) / held
    y[room] = (y[room] ?? 0) / held
  }
  return { areas, x, y }
}

/** Every cell a reach may still take: on the floor, not settled by a wall, and inside the line. */
function freeCells(division: Division): Int32Array {
  const out: number[] = []
  for (let index = 0; index < division.owner.length; index++)
    if (division.fixed[index] === 0 && usable(division, index)) out.push(index)
  return Int32Array.from(out)
}

/**
 * One pass over the free cells. A cell goes to the room whose reach covers it most deeply; a cell
 * no reach covers at all is left outside the house, which is what keeps the zones to the storey's
 * own area instead of spreading them over the whole floor.
 */
function spread(
  division: Division,
  reach: { readonly x: Float64Array; readonly y: Float64Array },
  sites: readonly number[],
  weights: Float64Array,
  free: Int32Array,
): void {
  const grid = division.grid
  const count = sites.length
  // Walked by index rather than by iterator: a typed array's iterator allocates on every cell,
  // and this loop runs over the whole floor once for every room in every round.
  for (let cell = 0; cell < free.length; cell++) {
    const index = free[cell] as number
    const col = index % grid.cols
    const x = grid.left + (col + 0.5) * grid.step
    const y = grid.top + ((index - col) / grid.cols + 0.5) * grid.step
    const claim = division.claim[index] ?? NOBODY
    let best = NOBODY
    let deepest = 0
    for (let at = 0; at < count; at++) {
      const site = sites[at] as number
      if (claim !== NOBODY && !(division.claims[claim]?.includes(site) ?? false)) continue
      const dx = Math.abs(x - (reach.x[at] as number))
      const dy = Math.abs(y - (reach.y[at] as number))
      const away = dx > dy ? dx : dy
      const covered = away * away - (weights[site] as number)
      if (covered >= deepest) continue
      deepest = covered
      best = site
    }
    division.owner[index] = best
  }
}

/**
 * How much of the way a reach is moved back under its own bubble each round. A zone cut against
 * its neighbours and against the buildable line comes out lopsided, and its middle then sits away
 * from the bubble it grew from; walking the reach the other way brings the zone back over the
 * bubble, which is the one thing the morph promises about where a room ends up.
 */
const RECENTRE = 1

/** How far a zone's middle may sit from its bubble before the reaches are walked back, in metres. */
const ADRIFT_M = 0.5

/**
 * The weights adjusted until every room holds its target, and the reaches walked back under their
 * bubbles until each zone sits on the one it grew from. A room's reach starts at its bubble's own
 * radius, so the first round already draws the diagram the bubbles drew; what follows only settles
 * the boundaries between rooms that want the same floor.
 */
export function divide(
  division: Division,
  rooms: readonly PartitionRoom[],
  sites: readonly number[],
): void {
  const weights = new Float64Array(rooms.length)
  const reach = { x: new Float64Array(sites.length), y: new Float64Array(sites.length) }
  for (const [at, site] of sites.entries()) {
    const room = rooms[site]
    weights[site] = ((room?.targetArea ?? 0) / SQUARE) as number
    reach.x[at] = room?.at[0] ?? 0
    reach.y[at] = room?.at[1] ?? 0
  }
  const free = freeCells(division)
  const gain = GAIN
  for (let round = 0; round < ROUNDS; round++) {
    spread(division, reach, sites, weights, free)
    const held = heldBy(division, rooms.length)
    let off = 0
    let adrift = 0
    for (const site of sites) {
      const room = rooms[site]
      if (!room) continue
      off += Math.abs(room.targetArea - (held.areas[site] ?? 0))
      adrift = Math.max(
        adrift,
        Math.hypot((held.x[site] ?? 0) - room.at[0], (held.y[site] ?? 0) - room.at[1]),
      )
    }
    // A round that leaves every room within a cell of its target and every zone over its own
    // bubble has done what a reach can do; the last cells are handed over one at a time afterwards.
    if (off <= sites.length * division.grid.cellArea && adrift <= ADRIFT_M) break
    for (const [at, site] of sites.entries()) {
      const room = rooms[site]
      if (!room) continue
      const short = room.targetArea - (held.areas[site] ?? 0)
      weights[site] = Math.max(0, (weights[site] ?? 0) + (gain * short) / SQUARE)
      // The reach is walked back under its bubble only once the areas have nearly come right;
      // moving a reach while the weights are still far out moves the shortfalls about instead.
      if (round !== SETTLING && round !== 2 * SETTLING) continue
      if ((held.areas[site] ?? 0) <= 0) continue
      reach.x[at] = (reach.x[at] ?? 0) + RECENTRE * (room.at[0] - (held.x[site] ?? 0))
      reach.y[at] = (reach.y[at] ?? 0) + RECENTRE * (room.at[1] - (held.y[site] ?? 0))
    }
  }
}

/** One array, reused: the cells sharing a side with the cell being looked at. */
const beside = new Int32Array(4)

/** The eight cells round one, walked in a circle, so a run of them is a run round that cell. */
const AROUND = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const

/** Whether a room's cells round this one hang together without it: the test that keeps a zone whole. */
function partsWithout(division: Division, index: number, room: number): boolean {
  const grid = division.grid
  const col = index % grid.cols
  const row = (index - col) / grid.cols
  let ring = 0
  for (let corner = 0; corner < 8; corner++) {
    const step = AROUND[corner] as readonly [number, number]
    const x = col + step[0]
    const y = row + step[1]
    const held =
      x >= 0 &&
      y >= 0 &&
      x < grid.cols &&
      y < grid.rows &&
      division.owner[y * grid.cols + x] === room
    if (held) ring |= 1 << corner
  }
  const at = (corner: number): boolean => (ring & (1 << (corner % 8))) !== 0
  let runs = 0
  for (let i = 0; i < 8; i++) {
    // Only a run that holds a cell sharing a side counts; a corner alone joins nothing.
    if (!at(i) || at(i + 7)) continue
    let holds = false
    for (let j = i; j < i + 8 && at(j); j++) if (j % 2 === 0) holds = true
    if (holds) runs += 1
  }
  return runs > 1
}

/** Whether a cell may leave its room: only from the edge of it, and never cutting the zone in two. */
export function loosable(division: Division, index: number, room: number): boolean {
  if (division.fixed[index] !== 0) return false
  const sides = sidesOfCell(division.grid, index, beside)
  let mine = 0
  for (let side = 0; side < sides; side++)
    if (division.owner[beside[side] as number] === room) mine += 1
  if (mine === 4) return false
  return !partsWithout(division, index, room)
}

/**
 * The last cells. A room still off its target by more than half a cell is put right by handing one
 * cell along a chain of rooms from the one that has floor to spare, or from the floor outside the
 * house where the chain reaches it: every room on the way takes one and gives one, so only the two
 * ends of the chain change area and the storey comes to its targets to the cell.
 */
export function settleAreas(
  division: Division,
  rooms: readonly PartitionRoom[],
  small: number,
): void {
  const cell = division.grid.cellArea
  const areas = areasOf(division, rooms.length)
  const short = (room: number): number => (rooms[room]?.targetArea ?? 0) - (areas[room] ?? 0)
  for (let pass = 0; pass < PASSES; pass++) {
    // One reading of what could be handed where serves a whole pass; a cell is checked against the
    // division as it stands before it moves, so a reading gone stale hands nothing on.
    const hands = handsOf(division, rooms, areas, small)
    let moved = false
    for (const [needy] of rooms.entries())
      for (let fix = 0; fix < MOST_CHAINS && Math.abs(short(needy)) > cell / 2; fix++) {
        const chain = chainFrom(rooms, hands, short, cell, needy, short(needy) > 0)
        if (!chain || chain.length === 0) break
        // From the far end back, so each hand-over is made on the cells the one before it left.
        for (const step of [...chain].reverse()) {
          const index = takeOne(division, hands, step)
          if (index < 0) break
          division.owner[index] = step.to
          if (step.from !== NOBODY) areas[step.from] = (areas[step.from] ?? 0) - cell
          if (step.to !== NOBODY) areas[step.to] = (areas[step.to] ?? 0) + cell
          moved = true
        }
      }
    if (!moved) break
  }
}

/** How many readings of the boundaries the storey is given to come to its targets. */
const PASSES = 8

/** How many chains one room is handed in one pass. */
const MOST_CHAINS = 64

/**
 * The next cell of a pair's boundary that is still there to be handed over, the loosest first.
 * A reading taken at the start of a pass goes stale as the cells move, so each one is checked
 * against the division as it stands and passed over where it has already changed hands.
 */
function takeOne(division: Division, hands: ReadonlyMap<string, number[]>, step: Hand): number {
  const waiting = hands.get(keyOf(step.from, step.to))
  while (waiting && waiting.length > 0) {
    const index = waiting.shift() as number
    if ((division.owner[index] ?? NOBODY) !== step.from) continue
    if (step.from !== NOBODY && !loosable(division, index, step.from)) continue
    return index
  }
  return -1
}

/** One hand-over: the room a cell leaves, and the room it joins. */
type Hand = { readonly from: number; readonly to: number }

function keyOf(from: number, to: number): string {
  return `${from}|${to}`
}

/**
 * One cell for every pair of rooms that could hand one over: on the boundary between them, loose
 * enough to leave without cutting its room in two, and not a cell a wall put down. The loosest is
 * kept, so a hand-over tidies the boundary it is made on rather than roughening it. `NOBODY` at
 * either end is the floor outside the house, which has cells to give and room to take them.
 */
function handsOf(
  division: Division,
  rooms: readonly PartitionRoom[],
  areas: Float64Array,
  small: number,
): ReadonlyMap<string, number[]> {
  const cell = division.grid.cellArea
  const waiting = new Map<
    string,
    { readonly index: number; readonly loose: number; readonly near: number }[]
  >()
  const spare = (room: number): boolean =>
    room === NOBODY || (areas[room] ?? 0) - cell >= Math.min(small, rooms[room]?.targetArea ?? 0)
  for (let index = 0; index < division.owner.length; index++) {
    if (!usable(division, index)) continue
    const from = division.owner[index] ?? NOBODY
    if (from === NOBODY ? division.fixed[index] !== 0 : !loosable(division, index, from)) continue
    if (!spare(from)) continue
    const sides = sidesOfCell(division.grid, index, beside)
    let mine = 0
    for (let side = 0; side < sides; side++)
      if (division.owner[beside[side] as number] === from) mine += 1
    const takers: number[] = sides < 4 && from !== NOBODY ? [NOBODY] : []
    for (let side = 0; side < sides; side++) {
      const to = division.owner[beside[side] as number] ?? NOBODY
      if (to !== from && !takers.includes(to)) takers.push(to)
    }
    const col = index % division.grid.cols
    const x = division.grid.left + (col + 0.5) * division.grid.step
    const y = division.grid.top + ((index - col) / division.grid.cols + 0.5) * division.grid.step
    for (const to of takers) {
      if (to !== NOBODY && !allowed(division, index, to)) continue
      const room = rooms[to === NOBODY ? from : to]
      const near = room ? Math.hypot(x - room.at[0], y - room.at[1]) : 0
      const key = keyOf(from, to)
      waiting.set(key, [...(waiting.get(key) ?? []), { index, loose: mine, near }])
    }
  }
  const ready = new Map<string, number[]>()
  for (const [key, cells] of waiting)
    ready.set(
      key,
      // The loosest cell first, so a hand-over tidies the boundary; and of two equally loose ones,
      // the one nearer the taking room's own bubble, so a zone grows towards itself and not away.
      [...cells]
        .sort(
          (one, other) =>
            one.loose - other.loose || one.near - other.near || one.index - other.index,
        )
        .map((each) => each.index),
    )
  return ready
}

/**
 * The shortest chain of rooms from the one that is off its target to somewhere with the floor to
 * put it right: a room with more than it asked for, or the ground outside the house.
 */
function chainFrom(
  rooms: readonly PartitionRoom[],
  hands: ReadonlyMap<string, number[]>,
  short: (room: number) => number,
  cell: number,
  needy: number,
  gaining: boolean,
): readonly Hand[] | null {
  const came = new Map<number, Hand>()
  const seen = new Set<number>([needy])
  const queue = [needy]
  /** The chain read back from its far end: each step's other room is the one before it. */
  const trail = (end: number): readonly Hand[] => {
    const out: Hand[] = []
    for (let at = end; at !== needy;) {
      const step = came.get(at)
      if (!step) break
      out.unshift(step)
      at = gaining ? step.to : step.from
    }
    return out
  }
  while (queue.length > 0) {
    const here = queue.shift() as number
    for (const other of [...rooms.keys(), NOBODY]) {
      if (other === here || seen.has(other)) continue
      const step: Hand = gaining ? { from: other, to: here } : { from: here, to: other }
      if ((hands.get(keyOf(step.from, step.to)) ?? []).length === 0) continue
      seen.add(other)
      came.set(other, step)
      const enough =
        other === NOBODY || (gaining ? short(other) < -cell / 2 : short(other) > cell / 2)
      if (enough) return trail(other)
      queue.push(other)
    }
  }
  return null
}
