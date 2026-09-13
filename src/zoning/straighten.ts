import { boundingBox, GRID_M, type Point, type Polygon } from '../geometry'
import { cellCentre, INSIDE, OFF, PAST, type Grid } from './grid'
import { placedCells } from './seeds'
import type { Division, Kerb, PartitionInput, PartitionRoom } from './types'

/*
 * Decision 19, half two, rebuilt around the spine (Z6). The corridor is fixed first, straight, from
 * the room it starts at, and a column stands either side of it. Each column is filled with bands
 * from the kerb inward: the rooms with a street claim first, then the rooms the entry opens onto,
 * then the rest in the order the bubbles settled, with every room a link ties together kept on the
 * one side. A band is one room at the column's width where that leaves it a room's proportion, two
 * rooms one behind the other where it would not, and only as deep as the room needs otherwise; the
 * garage bays stand in a strip of their own, in tandem; the stair and the entry's WC are pockets on
 * the corridor that the room after them wraps; a companion is cut from a corner of its owner. Walls
 * run and align by construction, every zone is a rectangle or a rectangle with one arm, and the
 * court is what is left.
 */

/** The floor under which a room is drawn at its target outright, as a pocket or a carve, in m². */
const POCKET_M2 = 8

/** The narrowest a pocket room is drawn, in metres: a WC's own width. */
const POCKET_LEAST_M = 1.5

/** The proportion a small room is drawn nearest to, short side to long. */
const POCKET_ASPECT = 0.75

/** A garage bay in the room-type table: three metres wide. */
const BAY_WIDE_M = 3

/** The widest a stair is drawn across, in metres, so its run is a flight and not a hall. */
const STAIR_WIDE_M = 3

/** How wide the corridor is drawn, in metres: the top of the room-type table's band, on the grid. */
const CORRIDOR_WIDE_M = 2

/** The least depth any band is given, in metres; a room shallower than this is a corridor. */
const LEAST_DEPTH_M = 1.5

/** The shortest jog the engine will draw, in metres: half two's promise. */
const JOG_M = 1

/** The wall a door needs, in metres, which is how far past its last room the corridor runs. */
const DOOR_M = 1

/** A column narrower than this holds no band; the rooms go to the other side, in metres. */
const COLUMN_LEAST_M = 4

/** The narrowest a band is laid beside a strip; narrower, the bands start past the strip. */
const BESIDE_LEAST_M = 3.5

/** How far off the street a bubble may stand and still be a room at the kerb, in metres. */
const KERB_NEAR_M = 1.5

/** The longest a room is drawn against its width: the top of the room-type table's proportions. */
const LONG = 1.6

/** How far over its target a room may be drawn to close a band, as a share of the target. */
const OVER = 1.25

/** How far a pocket on the spine will wait for a strip against the boundary to end, in metres. */
const POCKET_WAIT_M = 3

/** A band that overruns the buildable line by no more than this is cut back to it, in metres. */
const TRIM_M = 0.5

/** How much deeper than wide a room is drawn when the column is deeper than it needs. */
const DEEPER = 1.25

/** The narrowest a room may be, in metres: the Municipality's floor for a habitable room. */
const LEGAL_WIDE_M = 3

/** The kinds with a role of their own in the laying. */
const BAY = 'garage'
const STAIR = 'stair'
const ENTRY = 'entry-foyer'

const WAYS: readonly Point[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

function nearestWay(along: Point): Point {
  let best = WAYS[0] as Point
  let closest = -Infinity
  for (const way of WAYS) {
    const with_ = along[0] * way[0] + along[1] * way[1]
    if (with_ <= closest) continue
    closest = with_
    best = way
  }
  return best
}

function unitBetween(from: Point, to: Point): Point {
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  return run < 1e-9 ? [1, 0] : [(to[0] - from[0]) / run, (to[1] - from[1]) / run]
}

/**
 * The corridor turned onto an axis before the floor is divided at all. The owner's ruling is that
 * a diagonal is drawn by hand, so the one room the bubbles lay at a free angle is turned onto the
 * nearer of the plot's two ways — the way the service street runs and the way in from it — about
 * the end it starts from, keeping that end and its length.
 */
export function squareCorridor(
  room: PartitionRoom,
  startsAt: Point | undefined,
  street: Kerb | undefined,
): PartitionRoom {
  if (room.half <= 0) return room
  const along: Point = [Math.cos(room.angle), Math.sin(room.angle)]
  const first: Point = [room.at[0] - along[0] * room.half, room.at[1] - along[1] * room.half]
  const second: Point = [room.at[0] + along[0] * room.half, room.at[1] + along[1] * room.half]
  const near =
    startsAt === undefined ||
    Math.hypot(first[0] - startsAt[0], first[1] - startsAt[1]) <=
      Math.hypot(second[0] - startsAt[0], second[1] - startsAt[1])
      ? first
      : second
  const away: Point = near === first ? along : [-along[0], -along[1]]
  const street0 = street ? nearestWay(unitBetween(street.from, street.to)) : ([1, 0] as Point)
  const ways: readonly Point[] = [
    street0,
    [-street0[0], -street0[1]],
    [-street0[1], street0[0]],
    [street0[1], -street0[0]],
  ]
  let squared = ways[0] as Point
  let closest = -Infinity
  for (const way of ways) {
    const with_ = away[0] * way[0] + away[1] * way[1]
    if (with_ <= closest) continue
    closest = with_
    squared = way
  }
  return {
    ...room,
    at: [near[0] + squared[0] * room.half, near[1] + squared[1] * room.half],
    angle: Math.atan2(squared[1], squared[0]),
  }
}

/*
 * The frame the laying works in: `s` runs along the spine from its start, `t` runs across it, both
 * in metres and both on the sheet's grid because the spine lies on a grid axis. A box is a range
 * of each. Every box is turned back into plot metres only when its cells are written.
 */
type Frame = {
  readonly origin: Point
  /** Unit vectors in plot metres: the way `s` and `t` run. */
  readonly es: Point
  readonly et: Point
}

type Box = { readonly s0: number; readonly s1: number; readonly t0: number; readonly t1: number }

function snap(value: number): number {
  return Math.round(value / GRID_M) * GRID_M
}

function snapUp(value: number): number {
  return Math.ceil(value / GRID_M - 1e-9) * GRID_M
}

function areaOf(box: Box): number {
  return Math.max(0, box.s1 - box.s0) * Math.max(0, box.t1 - box.t0)
}

function toFrame(frame: Frame, at: Point): { readonly s: number; readonly t: number } {
  const dx = at[0] - frame.origin[0]
  const dy = at[1] - frame.origin[1]
  return { s: dx * frame.es[0] + dy * frame.es[1], t: dx * frame.et[0] + dy * frame.et[1] }
}

/** The extent of a polygon in the frame. */
function extentOf(frame: Frame, polygon: Polygon): Box {
  let s0 = Infinity
  let s1 = -Infinity
  let t0 = Infinity
  let t1 = -Infinity
  for (const corner of polygon) {
    const { s, t } = toFrame(frame, corner)
    s0 = Math.min(s0, s)
    s1 = Math.max(s1, s)
    t0 = Math.min(t0, t)
    t1 = Math.max(t1, t)
  }
  return { s0, s1, t0, t1 }
}

/** The cells whose middles fall inside a box, in row order. */
function cellsInBox(grid: Grid, frame: Frame, box: Box): readonly number[] {
  const out: number[] = []
  for (let index = 0; index < grid.cols * grid.rows; index++) {
    if ((grid.place[index] ?? OFF) === OFF) continue
    const { s, t } = toFrame(frame, cellCentre(grid, index))
    if (s <= box.s0 || s >= box.s1 || t <= box.t0 || t >= box.t1) continue
    out.push(index)
  }
  return out
}

/**
 * The sides of a small room drawn at its target exactly: two grid lengths whose product is the
 * target to within a cell, nearest the proportion a small room is drawn at, within the room it
 * has to fit. `across` runs along `t`, `deep` along `s`.
 */
function smallSides(
  area: number,
  widest: number,
  deepest: number,
): { readonly across: number; readonly deep: number } | undefined {
  let best: { across: number; deep: number } | undefined
  let nearest = Infinity
  for (let across = JOG_M; across <= widest + 1e-9; across += GRID_M) {
    const deep = snapUp(area / across)
    if (deep < JOG_M - 1e-9 || deep > deepest + 1e-9) continue
    if (across * deep - area > GRID_M * GRID_M + 1e-9) continue
    const away = Math.abs(Math.min(across, deep) / Math.max(across, deep) - POCKET_ASPECT)
    if (away >= nearest) continue
    nearest = away
    best = { across, deep }
  }
  return best
}

/** A strip of a column reserved at one of its edges over a run of `s`: the bays or a pocket. */
type Reserved = {
  readonly s0: number
  readonly s1: number
  readonly wide: number
  /** At the spine's edge, or at the boundary. */
  readonly spine: boolean
}

/** One side of the spine: its extent across, and what already stands in it. */
type Column = {
  /** -1 for the column at lower `t`, +1 for the other. */
  readonly side: -1 | 1
  /** The column's extent across, from the spine's edge outward. */
  readonly tNear: number
  readonly tFar: number
  readonly reserved: Reserved[]
  /** Where the next band starts. */
  s: number
  rooms: number[]
}

function widthOf(column: Column): number {
  return Math.abs(column.tFar - column.tNear)
}

/** The free stretch across a column at a given `s`: what the reserved strips leave, as a `t` range. */
function freeAcross(column: Column, s: number): readonly [number, number] {
  let near = column.tNear
  let far = column.tFar
  for (const strip of column.reserved) {
    if (s < strip.s0 - 1e-9 || s >= strip.s1 - 1e-9) continue
    if (strip.spine) near = near + column.side * strip.wide
    else far = far - column.side * strip.wide
  }
  return column.side > 0 ? [near, far] : [far, near]
}

/** A box across a column from `near` outward by `deep`, over a run of `s`. */
function fromSpine(column: Column, s0: number, s1: number, near: number, deep: number): Box {
  const far = near + column.side * deep
  return { s0, s1, t0: Math.min(near, far), t1: Math.max(near, far) }
}

/**
 * A band of the given area laid from `s` up the column, taking the free width at every step. Where
 * the width widens part way, the band steps once and becomes an L; a second widening is left as
 * court, a narrowing ends the band, and the band ends on the grid step at which its area is
 * reached. `deep` caps how far from the spine the band reaches.
 */
function layBand(column: Column, from: number, area: number, sMax: number, deep = Infinity): Box[] {
  const boxes: Box[] = []
  let s = from
  let held = 0
  let open: { s0: number; t0: number; t1: number } | null = null
  const close = (at: number): void => {
    if (open && at > open.s0 + 1e-9) boxes.push({ s0: open.s0, s1: at, t0: open.t0, t1: open.t1 })
    open = null
  }
  while (held < area - 1e-9 && s < sMax - 1e-9) {
    let [t0, t1] = freeAcross(column, s + GRID_M / 2)
    if (column.side > 0) t1 = Math.min(t1, column.tNear + deep)
    else t0 = Math.max(t0, column.tNear - deep)
    if (open && boxes.length > 0) {
      if (t0 < open.t0 - 1e-9 || t1 > open.t1 + 1e-9) {
        t0 = open.t0
        t1 = open.t1
      } else if (t0 > open.t0 + 1e-9 || t1 < open.t1 - 1e-9) break
    }
    const wide = t1 - t0
    if (wide < JOG_M - 1e-9) break
    if (!open || open.t0 !== t0 || open.t1 !== t1) {
      close(s)
      open = { s0: s, t0, t1 }
    }
    held += wide * GRID_M
    s += GRID_M
  }
  close(s)
  // A last box shallower than a jog is cut, unless it is the one box on the spine, when it is
  // deepened to a jog instead and the room is a little over its target.
  const last = boxes[boxes.length - 1]
  if (boxes.length > 1 && last && last.s1 - last.s0 < JOG_M - 1e-9) {
    const onSpine = (box: Box): boolean =>
      Math.abs((column.side > 0 ? box.t0 : box.t1) - column.tNear) < 1e-9
    boxes.pop()
    if (!boxes.some(onSpine) && onSpine(last) && last.s0 + JOG_M <= sMax + 1e-9)
      boxes.push({ ...last, s1: last.s0 + JOG_M })
  }
  return boxes
}

/** The depth a band of an area needs at a width, on the grid, never shallower than a room. */
function depthFor(area: number, wide: number): number {
  return Math.max(LEAST_DEPTH_M, snapUp(area / Math.max(wide, GRID_M)))
}

/** Whether a room of an area at a column's width would be longer across than it is deep. */
function shallowAt(area: number, wide: number): boolean {
  return area / wide < wide / LONG
}

/** How far along the spine a room of an area takes at a column's width, as the bands draw it. */
function lengthAt(area: number, wide: number): number {
  return shallowAt(area, wide) ? Math.sqrt(area) : area / Math.max(wide, GRID_M)
}

/**
 * The frame. On the ground the spine runs in from the service street, because the entry and the
 * bays stand on it; on a floor above, and on a plot with no street, it runs the way the corridor
 * was turned.
 */
function frameOf(input: PartitionInput, spine: PartitionRoom | undefined, inward: boolean): Frame {
  const street = input.street
  if (street && inward) {
    const inward = nearestWay(street.inward)
    return { origin: street.from, es: inward, et: [-inward[1], inward[0]] }
  }
  const bounds = boundingBox(input.buildable.length >= 3 ? input.buildable : input.plot)
  const es = spine ? nearestWay([Math.cos(spine.angle), Math.sin(spine.angle)]) : ([0, 1] as Point)
  return { origin: [bounds.left, bounds.top], es, et: [-es[1], es[0]] }
}

/**
 * The whole laying. It writes the division's owners directly: a cell a room's box covers is that
 * room's, a cell no box covers stays nobody's, and a cell already fixed (a stair the floor below
 * placed) is never taken.
 */
export function layRooms(
  division: Division,
  rooms: readonly PartitionRoom[],
  input: PartitionInput,
): void {
  const grid = division.grid
  const at = new Map(rooms.map((room, index) => [room.id, index]))
  const corridor = rooms.findIndex((room) => room.half > 0)
  const spine = rooms[corridor]
  // The foot is the room the corridor starts from: the entry on the kerb, or a stair. Any other
  // first arrival — a hand-built case with no entry — is laid as a room like the rest.
  const first = rooms[at.get(input.arrivals[0] ?? '') ?? -1]
  const fromKerb = first?.type === ENTRY && input.street !== undefined
  const footIndex = first && (fromKerb || first.type === STAIR) ? (at.get(first.id) ?? -1) : -1
  const foot = rooms[footIndex]
  const onGround = rooms.some((room) => room.kerb !== undefined || room.type === BAY)
  const frame = frameOf(input, spine, fromKerb || onGround)
  // The floor's sides are the buildable line; its far end is the plot's, because a storey the
  // rooms at their proportions cannot fit behind the line runs past it, and that is the spill.
  const floor = extentOf(frame, input.buildable.length >= 3 ? input.buildable : input.plot)
  const sMin = snap(floor.s0)
  const sMax = snap(extentOf(frame, input.plot).s1)
  const tMin = snap(floor.t0)
  const tMax = snap(floor.t1)
  const laid = new Map<number, Box[]>()
  const take = (index: number, box: Box): void => {
    if (index < 0 || areaOf(box) < 1e-9) return
    laid.set(index, [...(laid.get(index) ?? []), box])
  }
  const links = input.links.map((link) => [at.get(link.a) ?? -1, at.get(link.b) ?? -1] as const)
  const linked = (one: number, other: number): boolean =>
    links.some(([a, b]) => (a === one && b === other) || (a === other && b === one))
  const sOf = (index: number): number => toFrame(frame, (rooms[index] as PartitionRoom).at).s
  const tOf = (index: number): number => {
    const room = rooms[index] as PartitionRoom
    return room.kerb
      ? (toFrame(frame, room.kerb.from).t + toFrame(frame, room.kerb.to).t) / 2
      : toFrame(frame, room.at).t
  }

  // Companions are cut from the room they are entered through, so that room is laid with both.
  const owners = new Map<number, number>()
  for (const [index, room] of rooms.entries()) {
    if (room.owner === undefined) continue
    const owner = at.get(room.owner)
    if (owner !== undefined && owner !== index) owners.set(index, owner)
  }
  const companionsOf = (index: number): number[] =>
    [...owners].filter(([, owner]) => owner === index).map(([aux]) => aux)
  const allotOf = (index: number): number =>
    (rooms[index]?.targetArea ?? 0) +
    companionsOf(index).reduce((total, aux) => total + (rooms[aux]?.targetArea ?? 0), 0)

  // The spine: its width on the grid, its middle where the bubble lay, snapped and kept on the
  // floor. On a floor above, where the corridor starts from the stair and not from a wall on the
  // kerb, a spine that leaves one side too narrow for a room while the other has room to spare is
  // moved in until both sides hold rooms, and a spine that would cut through the placed stair is
  // set flush against it instead.
  const wide = spine ? CORRIDOR_WIDE_M : 0
  const placedStair = rooms.findIndex((room) => room.placed !== undefined && room.type === STAIR)
  const standing = rooms[placedStair]?.placed
  const stairBox = standing ? extentOf(frame, standing) : undefined
  let tSpine = spine ? snap(toFrame(frame, spine.at).t) : tMin
  if (spine && !fromKerb) {
    /**
     * The floor a spine at `t` opens up: on each side, the width the bands can use (a room's
     * depth at most, and nothing under a column's least) over the corridor's run, which starts
     * at the stair's end where the spine runs through the stair and alongside it where it does
     * not, less the stair's own strip. A spine that would cut the stair opens nothing.
     */
    const line = snap(floor.s1)
    const roomDeep = (width: number): number =>
      width < COLUMN_LEAST_M - 1e-9 ? 0 : Math.min(width, COLUMN_LEAST_M + LEAST_DEPTH_M)
    const capacityAt = (t: number): number => {
      const t0 = t - wide / 2
      const t1 = t + wide / 2
      if (t0 < tMin - 1e-9 || t1 > tMax + 1e-9) return -Infinity
      const sides = [t0 - tMin, tMax - t1]
      if (!stairBox)
        return sides.reduce((total, width) => total + roomDeep(width) * (line - sMin), 0)
      const within = t0 >= stairBox.t0 - 1e-9 && t1 <= stairBox.t1 + 1e-9
      if (!within && t0 < stairBox.t1 - 1e-9 && t1 > stairBox.t0 + 1e-9) return -Infinity
      if (within)
        return sides.reduce((total, width) => total + roomDeep(width) * (line - stairBox.s1), 0)
      const run = line - stairBox.s0
      const flight = stairBox.s1 - stairBox.s0
      const lowerSide = stairBox.t1 <= t0 + 1e-9
      const strip = lowerSide
        ? stairBox.t1 - Math.max(tMin, stairBox.t0)
        : Math.min(tMax, stairBox.t1) - stairBox.t0
      return sides.reduce((total, width, side) => {
        const beside = (side === 0) === lowerSide ? width - strip : width
        return total + roomDeep(beside) * flight + roomDeep(width) * (run - flight)
      }, 0)
    }
    // With a placed stair the spine must touch it: through it where the bubble lies within it,
    // else flush against either side; without one, the bubble's line or a line a room's depth
    // in from either edge.
    const want = COLUMN_LEAST_M + LEAST_DEPTH_M
    const withinStair =
      stairBox !== undefined &&
      tSpine - wide / 2 >= stairBox.t0 - 1e-9 &&
      tSpine + wide / 2 <= stairBox.t1 + 1e-9
    const candidates = stairBox
      ? [
          ...(withinStair ? [tSpine] : []),
          snap(stairBox.t0) - wide / 2,
          snap(stairBox.t1) + wide / 2,
        ]
      : [tSpine, tMin + want + wide / 2, tMax - want - wide / 2]
    let best = tSpine
    let most = -Infinity
    for (const t of candidates) {
      const capacity = capacityAt(t)
      const better =
        capacity > most + 1e-9 ||
        (Math.abs(capacity - most) < 1e-9 && Math.abs(t - tSpine) < Math.abs(best - tSpine))
      if (!better) continue
      most = capacity
      best = t
    }
    tSpine = best
  }
  tSpine = Math.min(tMax - wide / 2, Math.max(tMin + wide / 2, tSpine))
  const spineBox = { t0: tSpine - wide / 2, t1: tSpine + wide / 2 }

  // The foot: the entry on the kerb, or the stair the corridor starts from — at its end where the
  // spine runs through it, and alongside it where the spine runs past it.
  let sStart = sMin
  if (fromKerb && foot) {
    const depth = depthFor(foot.targetArea, wide)
    take(footIndex, { s0: sMin, s1: sMin + depth, t0: spineBox.t0, t1: spineBox.t1 })
    sStart = sMin + depth
  } else if (stairBox) {
    const through = spineBox.t0 < stairBox.t1 - 1e-9 && spineBox.t1 > stairBox.t0 + 1e-9
    sStart = Math.min(sMax, Math.max(sMin, snap(through ? stairBox.s1 : stairBox.s0)))
  } else if (foot && foot.type === STAIR && spine) {
    const footWide = Math.min(STAIR_WIDE_M, Math.max(wide, tMax - tMin))
    const depth = depthFor(foot.targetArea, footWide)
    const near = Math.max(sMin + depth, snap(toFrame(frame, spine.at).s - spine.half))
    take(footIndex, {
      s0: near - depth,
      s1: near,
      t0: tSpine - footWide / 2,
      t1: tSpine + footWide / 2,
    })
    sStart = near
  }

  const columns: [Column, Column] = [
    {
      side: -1,
      tNear: spineBox.t0,
      tFar: tMin,
      reserved: [],
      s: fromKerb ? sMin : sStart,
      rooms: [],
    },
    {
      side: 1,
      tNear: spineBox.t1,
      tFar: tMax,
      reserved: [],
      s: fromKerb ? sMin : sStart,
      rooms: [],
    },
  ]
  // A stair the corridor starts beside, or a stair foot wider than the spine, stands in a column
  // as a strip the bands make way for: from the spine's edge, or from the boundary where it is
  // against that.
  const standingBox = stairBox ?? (fromKerb ? undefined : laid.get(footIndex)?.[0])
  if (standingBox)
    for (const column of columns) {
      const low = Math.max(standingBox.t0, Math.min(column.tNear, column.tFar))
      const high = Math.min(standingBox.t1, Math.max(column.tNear, column.tFar))
      if (high - low < 1e-9) continue
      const outerEdge = column.side > 0 ? standingBox.t1 : standingBox.t0
      const atBoundary = Math.abs(outerEdge - column.tFar) < 1e-9
      const reach = atBoundary
        ? high - low
        : Math.abs((column.side > 0 ? high : low) - column.tNear)
      column.reserved.push({
        s0: snap(standingBox.s0),
        s1: snap(standingBox.s1),
        wide: snap(reach),
        spine: !atBoundary,
      })
    }

  // Who stands where. The corridor, the foot, the companions and a placed stair are laid apart;
  // every other room is one of a group the links tie together, and a group takes one side by
  // where its bubbles stand, weighted by their areas, a street claim counting for its stretch.
  const skip = new Set<number>([corridor, footIndex, placedStair, ...owners.keys()])
  const placed = rooms.flatMap((_room, index) => (skip.has(index) ? [] : [index]))
  const parent = new Map(placed.map((index) => [index, index]))
  const rootOf = (index: number): number => {
    let root = index
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) as number
    return root
  }
  for (const [a, b] of links)
    if (parent.has(a) && parent.has(b) && rooms[a]?.type !== BAY && rooms[b]?.type !== BAY)
      parent.set(rootOf(a), rootOf(b))
  const groupOf = (index: number): number => (rooms[index]?.type === BAY ? -1 : rootOf(index))
  const groups = new Map<number, number[]>()
  for (const index of placed)
    groups.set(groupOf(index), [...(groups.get(groupOf(index)) ?? []), index])
  const sideOf = new Map<number, Column>()
  const columnFor = (t: number): Column => (t < tSpine ? columns[0] : columns[1])
  for (const [root, members] of groups) {
    if (root === -1) continue
    let moment = 0
    let weight = 0
    for (const index of members) {
      const area = allotOf(index)
      moment += tOf(index) * area
      weight += area
    }
    const column = columnFor(weight > 0 ? moment / weight : tOf(members[0] as number))
    for (const index of members) sideOf.set(index, column)
  }
  // The bays stand together, on the side the first of them claimed its stretch of street, in a
  // strip of their own stacked from the kerb in tandem: against the boundary, unless a bay is
  // entered from the house through the entry, when the strip stands by the spine.
  const bays = groups.get(-1) ?? []
  const bayColumn = bays.length > 0 ? columnFor(tOf(bays[0] as number)) : undefined
  if (bayColumn) {
    const bySpine = bays.some((index) => linked(index, footIndex))
    const stripWide = Math.min(BAY_WIDE_M, snap(widthOf(bayColumn)))
    let s = sMin
    for (const index of bays) {
      const depth = depthFor((rooms[index] as PartitionRoom).targetArea, stripWide)
      const near = bySpine ? bayColumn.tNear : bayColumn.tFar - bayColumn.side * stripWide
      take(index, fromSpine(bayColumn, s, s + depth, near, stripWide))
      s += depth
    }
    bayColumn.reserved.push({ s0: sMin, s1: s, wide: stripWide, spine: bySpine })
  }
  /** The rooms with a street door of their own, a diwaniya say, which the plan keeps at the kerb. */
  const streetDoors = new Set(
    input.arrivals.map((id) => at.get(id) ?? -1).filter((index) => index !== footIndex),
  )
  /**
   * Which rooms belong at the kerb: the ones the entry opens onto first, wherever their bubble
   * stands, because the entry is a wall and the room it opens onto stands beside it; then the
   * ones with a street door of their own or a door onto a garage bay, when their bubble stands
   * at the street; a room the bubbles left behind the street comes in its turn with the rest.
   */
  const nearKerb = (index: number): boolean =>
    sOf(index) - (rooms[index]?.radius ?? 0) <= sMin + KERB_NEAR_M
  const atKerb = (index: number): number =>
    fromKerb && linked(index, footIndex)
      ? 0
      : (streetDoors.has(index) || bays.some((bay) => linked(index, bay))) && nearKerb(index)
        ? 1
        : 2
  /** Where a column's first band can start: past any strip that leaves too little beside it. */
  const baseOf = (column: Column): number => {
    let s = column.s
    for (;;) {
      const [f0, f1] = freeAcross(column, s + GRID_M / 2)
      if (f1 - f0 >= BESIDE_LEAST_M - 1e-9 || s >= sMax - 1e-9) return s
      const ends = column.reserved
        .filter((strip) => strip.s0 <= s + 1e-9 && strip.s1 > s + 1e-9)
        .map((strip) => strip.s1)
      if (ends.length === 0) return s
      s = Math.min(...ends)
    }
  }
  // A room the entry opens onto stands beside the entry, so it takes a side with room at the kerb.
  if (fromKerb)
    for (const index of placed)
      if (linked(index, footIndex)) {
        const mine = sideOf.get(index) as Column
        const other = mine === columns[0] ? columns[1] : columns[0]
        if (baseOf(mine) > sMin + 1e-9 && baseOf(other) <= sMin + 1e-9)
          for (const member of groups.get(groupOf(index)) ?? []) sideOf.set(member, other)
      }
  // A column too narrow for a room takes none but the bays.
  const narrow = columns.map((column) => widthOf(column) < COLUMN_LEAST_M)
  if (narrow[0] !== narrow[1])
    for (const [root, members] of groups)
      if (root !== -1)
        for (const index of members) sideOf.set(index, narrow[0] ? columns[1] : columns[0])
  // Balance: a group crosses over only when its column would run past the buildable line and
  // the other side has the room; where both sides fit, every room stays on the side its bubble
  // took, however uneven the two, because the diagram is the person's to arrange.
  // A column's height is estimated group by group: a room alone takes the length its proportion
  // gives it, and a group the links tie together packs into the column's width, its outer rooms
  // behind its inner ones, so it takes what its whole area needs and no less than its longest.
  const heightOf = (column: Column): number => {
    const base = baseOf(column)
    const [f0, f1] = freeAcross(column, base + GRID_M / 2)
    const free = f1 - f0
    let height = base
    for (const [root, members] of groups) {
      const here = members.filter((index) => root !== -1 && sideOf.get(index) === column)
      if (here.length === 0) continue
      const along = (index: number): number =>
        rooms[index]?.type === STAIR
          ? depthFor(rooms[index]?.targetArea ?? 0, STAIR_WIDE_M)
          : lengthAt(allotOf(index), free)
      const longest = Math.max(...here.map(along))
      const packed =
        here.reduce((total, index) => total + allotOf(index), 0) / Math.max(free, GRID_M)
      height += here.length > 1 ? Math.max(longest, packed) : longest
    }
    return height
  }
  const tied = (members: readonly number[]): boolean => members.some((index) => atKerb(index) < 2)
  /** What the two columns run past the buildable line between them, in metres. */
  const line = snap(floor.s1)
  const costOf = (): number =>
    columns.reduce((total, column) => total + Math.max(0, heightOf(column) - line), 0)
  if (!narrow[0] && !narrow[1])
    for (let round = 0; round < 4; round++) {
      const cost = costOf()
      if (cost < 1e-9) break
      const from = heightOf(columns[0]) > heightOf(columns[1]) ? columns[0] : columns[1]
      const to = from === columns[0] ? columns[1] : columns[0]
      let best: number[] | undefined
      let bestCost = cost
      for (const [root, members] of groups) {
        if (root === -1 || tied(members) || members.some((index) => sideOf.get(index) !== from))
          continue
        for (const index of members) sideOf.set(index, to)
        const tried = costOf()
        for (const index of members) sideOf.set(index, from)
        if (tried < bestCost - 0.5) {
          bestCost = tried
          best = members
        }
      }
      if (best === undefined) break
      for (const index of best) sideOf.set(index, to)
    }
  for (const index of placed) if (rooms[index]?.type !== BAY) sideOf.get(index)?.rooms.push(index)

  // The order up each column: the rooms that belong at the kerb first — the ones the entry opens
  // onto, and the ones entered from a garage bay — then by where the bubble stood; a group's
  // rooms stay together after its first, the rooms the corridor serves ahead of the rest.
  const inner = (index: number): boolean =>
    (fromKerb && linked(index, footIndex)) || linked(index, corridor)
  const before = (a: number, b: number): number =>
    atKerb(a) - atKerb(b) || Number(!inner(a)) - Number(!inner(b)) || sOf(a) - sOf(b) || a - b
  for (const column of columns) {
    const firstOf = new Map<number, number>()
    for (const index of column.rooms) {
      const first = firstOf.get(groupOf(index))
      if (first === undefined || before(index, first) < 0) firstOf.set(groupOf(index), index)
    }
    const groupKey = (index: number): number => firstOf.get(groupOf(index)) ?? index
    const groupBefore = (a: number, b: number): number =>
      atKerb(a) - atKerb(b) || sOf(a) - sOf(b) || a - b
    column.rooms.sort((a, b) => groupBefore(groupKey(a), groupKey(b)) || before(a, b))
  }

  // A pocket on the spine: a small room or the stair at its own width from the spine's edge, the
  // strip beside it reserved so the room laid after it wraps round it.
  const pocketOn = (
    column: Column,
    index: number,
    across: number,
    deep: number,
    from: number,
  ): Box => {
    const [f0, f1] = freeAcross(column, from + GRID_M / 2)
    const box = fromSpine(column, from, from + deep, column.side > 0 ? f0 : f1, across)
    take(index, box)
    column.reserved.push({ s0: from, s1: from + deep, wide: across, spine: true })
    return box
  }

  /** A room a band can be built round: a big one, with no companion to keep it a rectangle. */
  const big = (index: number): boolean =>
    (rooms[index]?.targetArea ?? 0) >= POCKET_M2 && rooms[index]?.type !== STAIR
  const canWrap = (index: number): boolean => big(index) && companionsOf(index).length === 0

  // The entry's own companion — the guest WC — stands at the kerb beside the entry: cut from the
  // kerb corner of the room the entry opens onto where that room is a plain rectangle there, and
  // otherwise a pocket on the spine that the first room of the other side wraps round.
  const cornered = new Set<number>()
  if (fromKerb)
    for (const aux of companionsOf(footIndex)) {
      const room = rooms[aux] as PartitionRoom
      const clear = (column: Column): boolean =>
        column.rooms[0] !== undefined &&
        big(column.rooms[0]) &&
        !column.reserved.some((strip) => strip.s0 <= sMin + 1e-9 && strip.s1 > sMin + 1e-9)
      const byBubble = [...columns].sort(
        (a, b) => Math.abs(tOf(aux) - a.tNear) - Math.abs(tOf(aux) - b.tNear),
      )
      const corner = byBubble.find(
        (column) =>
          clear(column) &&
          canWrap(column.rooms[0] as number) &&
          atKerb(column.rooms[0] as number) === 0,
      )
      if (corner) {
        owners.set(aux, corner.rooms[0] as number)
        cornered.add(aux)
        continue
      }
      const column = byBubble.find(clear) ?? (byBubble[0] as Column)
      const [f0, f1] = freeAcross(column, sMin + GRID_M / 2)
      const sides = smallSides(room.targetArea, f1 - f0 - LEAST_DEPTH_M, sMax - sMin)
      if (!sides) continue
      pocketOn(column, aux, sides.across, sides.deep, sMin)
      owners.delete(aux)
    }

  // A companion cut from a corner of its owner's rectangle, at the corner nearest its own bubble;
  // where no corner leaves the owner a room's width and depth, it stands past the owner's end.
  const carve = (aux: number, box: Box, column: Column, pastEnd = false): Box | undefined => {
    const room = rooms[aux] as PartitionRoom
    const ownerWide = box.t1 - box.t0
    const ownerDeep = box.s1 - box.s0
    const sides = pastEnd
      ? undefined
      : smallSides(room.targetArea, ownerWide - LEAST_DEPTH_M, ownerDeep - LEAST_DEPTH_M)
    if (sides) {
      const bubble = toFrame(frame, room.at)
      const farEnd = cornered.has(aux) ? false : bubble.s > (box.s0 + box.s1) / 2
      const farSide = cornered.has(aux)
        ? column.side < 0
        : Math.abs(bubble.t - box.t1) < Math.abs(bubble.t - box.t0)
      return {
        s0: farEnd ? box.s1 - sides.deep : box.s0,
        s1: farEnd ? box.s1 : box.s0 + sides.deep,
        t0: farSide ? box.t1 - sides.across : box.t0,
        t1: farSide ? box.t1 : box.t0 + sides.across,
      }
    }
    const past = smallSides(room.targetArea, ownerWide, sMax - box.s1)
    if (!past) return undefined
    const outer = column.side > 0 ? box.t1 : box.t0
    return fromSpine(
      column,
      box.s1,
      box.s1 + past.deep,
      outer - column.side * past.across,
      past.across,
    )
  }
  /** The boxes cut out of each room for its companions, which its own walls no longer run along. */
  const cuts = new Map<number, Box[]>()
  const cutFrom = (owner: number, aux: number, cut: Box): void => {
    take(aux, cut)
    cuts.set(owner, [...(cuts.get(owner) ?? []), cut])
  }
  /** A room laid as a rectangle, with its companions cut from it; how far along the band reaches. */
  const layWhole = (index: number, box: Box, column: Column): number => {
    take(index, box)
    let end = box.s1
    for (const aux of companionsOf(index)) {
      const cut = carve(aux, box, column)
      if (!cut) continue
      cutFrom(index, aux, cut)
      end = Math.max(end, cut.s1)
    }
    return end
  }

  /** A band's end cut back to the line where it overruns it by no more than a trim. */
  const trimmed = (end: number): number =>
    end > line + 1e-9 && end <= line + TRIM_M + 1e-9 ? line : end
  const trimBand = (boxes: Box[]): Box[] => {
    const last = boxes[boxes.length - 1]
    if (!last || trimmed(last.s1) === last.s1) return boxes
    const cut = { ...last, s1: line }
    return cut.s1 - cut.s0 >= JOG_M - 1e-9 ? [...boxes.slice(0, -1), cut] : boxes.slice(0, -1)
  }
  // The bands, in order. A column whose rooms at their own proportion would run past the line
  // draws them shorter along the spine and deeper into the column, as far as the width allows;
  // a column with room to spare lets a room stand where its bubble stood, court before it.
  for (const column of columns) {
    const pending = [...column.rooms]
    /** What the rooms still to lay will take along the spine, at the column's free width. */
    const ahead = (from: number): number => {
      const [f0, f1] = freeAcross(column, from + GRID_M / 2)
      const free = f1 - f0
      return pending.reduce((total, index) => {
        if (!big(index))
          return (
            total +
            (rooms[index]?.type === STAIR
              ? depthFor(rooms[index]?.targetArea ?? 0, STAIR_WIDE_M)
              : 0)
          )
        const packs =
          !inner(index) &&
          pending.some((other) => other !== index && inner(other) && linked(other, index))
        return total + (packs ? 0 : lengthAt(allotOf(index), free))
      }, 0)
    }
    let squeeze = 1
    /** A room's length along the spine, and its depth, at a width, squeezed to what the column has. */
    const fitted = (
      allot: number,
      wide: number,
    ): { readonly deep: number; readonly length: number } => {
      const deep0 = shallowAt(allot, wide)
        ? Math.min(wide, snapUp(Math.sqrt(allot * DEEPER)))
        : wide
      const length0 = depthFor(allot, deep0)
      if (squeeze >= 1 - 1e-9) return { deep: deep0, length: length0 }
      const length = Math.max(LEGAL_WIDE_M, snap(length0 * squeeze))
      const deep = Math.min(wide, snapUp(allot / length))
      return { deep, length: depthFor(allot, deep) }
    }
    while (pending.length > 0) {
      const index = pending.shift() as number
      const room = rooms[index] as PartitionRoom
      if (big(index)) {
        column.s = baseOf(column)
        pending.unshift(index)
        const needed = ahead(column.s)
        const spare = line - column.s - needed
        const held = [...laid.keys()].some((other) => linked(index, other))
        const clear = !column.reserved.some(
          (strip) => strip.spine && strip.s0 <= column.s + 1e-9 && strip.s1 > column.s + 1e-9,
        )
        if (spare > 0 && atKerb(index) === 2 && !held && clear) {
          const wanted = snap(sOf(index) - Math.sqrt(allotOf(index)) / 2)
          const most = Math.floor((column.s + spare) / GRID_M) * GRID_M
          column.s = Math.max(column.s, Math.min(wanted, most))
        }
        squeeze = Math.min(1, Math.max(0.5, (line - column.s) / Math.max(1e-9, needed)))
        pending.shift()
      }
      const s0 = column.s
      if (s0 >= sMax - 1e-9) break
      const [f0, f1] = freeAcross(column, s0 + GRID_M / 2)
      const free = f1 - f0
      if (free < JOG_M) break
      const near = column.side > 0 ? f0 : f1

      // A pocket: the stair at a flight's width, a small room at its own; the room laid after it
      // wraps round it where one can, and the strip beside it is court where none can.
      if (!big(index)) {
        // A pocket on the spine does not stand level with a companion against the boundary,
        // because the room after it could wrap neither; it waits for a short strip to end.
        const wait = Math.max(
          s0,
          ...column.reserved
            .filter((strip) => !strip.spine && strip.s0 <= s0 + 1e-9 && strip.s1 > s0 + 1e-9)
            .map((strip) => strip.s1)
            .filter((end) => end <= s0 + POCKET_WAIT_M + 1e-9),
        )
        if (wait > s0 + 1e-9) {
          column.s = wait
          pending.unshift(index)
          continue
        }
        const small = smallSides(room.targetArea, free, sMax - s0)
        const across =
          room.type === STAIR
            ? Math.min(STAIR_WIDE_M, snap(free))
            : (small?.across ?? Math.min(free, POCKET_LEAST_M))
        const deep = Math.min(sMax - s0, small?.deep ?? depthFor(room.targetArea, across))
        const box = pocketOn(column, index, across, deep, s0)
        const wrapper = pending.find(canWrap)
        if (wrapper !== undefined && free - across >= COLUMN_LEAST_M - 1e-9) {
          pending.splice(pending.indexOf(wrapper), 1)
          pending.unshift(wrapper)
        } else column.s = box.s1
        continue
      }

      // A room is drawn with its companions inside it, so its box holds both.
      const area = allotOf(index)
      // A room after a pocket on the spine wraps round it: the strip beside the pocket, then the
      // column's width, and no deeper than its proportion wants; its companions, which a room
      // with an arm has no corner for, stand past its end.
      const pocket = column.reserved.find(
        (strip) => strip.spine && strip.s0 <= s0 + 1e-9 && strip.s1 > s0 + 1e-9,
      )
      if (pocket) {
        const own = room.targetArea
        const [w0, w1] = freeAcross(column, pocket.s1 + GRID_M / 2)
        const whole = w1 - w0
        const cap = shallowAt(own, whole) ? Math.min(whole, snapUp(Math.sqrt(own * DEEPER))) : whole
        const boxes = trimBand(layBand(column, s0, own, sMax, cap))
        if (boxes.length === 0) continue
        for (const box of boxes) take(index, box)
        const last = boxes[boxes.length - 1] as Box
        let end = last.s1
        for (const aux of companionsOf(index)) {
          const cut = carve(aux, last, column, boxes.length > 1)
          if (!cut) continue
          cutFrom(index, aux, cut)
          if (cut.s0 < last.s1 - 1e-9) {
            end = Math.max(end, cut.s1)
            continue
          }
          // A companion past the end stands against the boundary, and the next band wraps it.
          column.reserved.push({ s0: cut.s0, s1: cut.s1, wide: cut.t1 - cut.t0, spine: false })
        }
        column.s = end
        continue
      }
      // A room the corridor does not serve, and the entry does not open onto, is reached through
      // a room it is linked to: it stands behind that room, at the boundary, in the same band.
      // Where the room at the spine would be too shallow alone, the two share the band; where
      // a third is linked to the one behind, it stands behind too, further along.
      const behind: number[] = []
      if (!pocket && shallowAt(area, free)) {
        let last = index
        for (let depth = 0; depth < 2; depth++) {
          const next = pending.find((other) => big(other) && !inner(other) && linked(other, last))
          if (next === undefined) break
          behind.push(next)
          last = next
        }
      }
      // The band is shared only where that draws the rooms nearer their proportions than one
      // behind the other would: two long slivers side by side are no better than two shallow rooms.
      const ratioOf = (deep: number, length: number): number =>
        Math.max(deep, length) / Math.max(GRID_M, Math.min(deep, length))
      if (behind.length > 0) {
        const total = area + behind.reduce((sum, other) => sum + allotOf(other), 0)
        const length = fitted(total, free).length
        const mineDeep = Math.max(
          Math.min(free - LEAST_DEPTH_M, LEGAL_WIDE_M),
          Math.min(free - LEAST_DEPTH_M, snap(area / length)),
        )
        const shared = Math.max(
          ratioOf(mineDeep, length),
          ...behind.map((other) =>
            ratioOf(free - mineDeep, depthFor(allotOf(other), free - mineDeep)),
          ),
        )
        const stacked = Math.max(
          ratioOf(fitted(area, free).deep, fitted(area, free).length),
          ...behind.map((other) =>
            ratioOf(fitted(allotOf(other), free).deep, fitted(allotOf(other), free).length),
          ),
        )
        if (shared > stacked + 1e-9) behind.length = 0
      }
      if (behind.length > 0) {
        const total = area + behind.reduce((sum, other) => sum + allotOf(other), 0)
        const length = Math.min(sMax - s0, trimmed(s0 + fitted(total, free).length) - s0)
        const mineDeep = Math.max(
          Math.min(free - LEAST_DEPTH_M, LEGAL_WIDE_M),
          Math.min(free - LEAST_DEPTH_M, snap(area / length)),
        )
        const outerDeep = free - mineDeep
        const mine = fromSpine(column, s0, s0 + length, near, mineDeep)
        let end = layWhole(index, mine, column)
        let s = s0
        for (const [count, other] of behind.entries()) {
          const own = depthFor(allotOf(other), outerDeep)
          const rest = s0 + length - s
          // The last room behind takes what is left of the band, unless that is well over its
          // own need, when the corner past it is court.
          const run =
            count === behind.length - 1 && rest <= own * OVER + 1e-9 ? rest : Math.min(rest, own)
          if (run < LEAST_DEPTH_M - 1e-9) break
          const box = fromSpine(column, s, s + run, near + column.side * mineDeep, outerDeep)
          end = Math.max(end, layWhole(other, box, column))
          pending.splice(pending.indexOf(other), 1)
          s += run
        }
        column.s = end
        continue
      }
      // One room. A room the column would draw too shallow is only as deep as it needs, with the
      // court beyond it, and a room with a companion stays a rectangle: either starts where the
      // strip beside it ends when that gives it the better proportion, unless it belongs at the
      // kerb. Any other room takes the column's width, and steps once where the width changes.
      if (shallowAt(area, free) || companionsOf(index).length > 0) {
        const starts =
          atKerb(index) < 2
            ? [s0]
            : [
                s0,
                ...column.reserved
                  .map((strip) => strip.s1)
                  .filter((end) => end > s0 + 1e-9 && end < s0 + lengthAt(area, free)),
              ]
        let best: { start: number; deep: number; length: number } | undefined
        let squarest = Infinity
        for (const start of starts) {
          const [g0, g1] = freeAcross(column, start + GRID_M / 2)
          const wide = g1 - g0
          if (wide < LEGAL_WIDE_M - 1e-9) continue
          const { deep, length: wanted } = fitted(area, wide)
          const length = Math.min(sMax - start, trimmed(start + wanted) - start)
          const ratio = Math.max(deep, length) / Math.max(GRID_M, Math.min(deep, length))
          if (ratio >= squarest - 1e-9) continue
          squarest = ratio
          best = { start, deep, length }
        }
        if (!best) continue
        const [g0, g1] = freeAcross(column, best.start + GRID_M / 2)
        const box = fromSpine(
          column,
          best.start,
          best.start + best.length,
          column.side > 0 ? g0 : g1,
          best.deep,
        )
        column.s = layWhole(index, box, column)
        continue
      }
      const boxes = trimBand(layBand(column, s0, area, sMax))
      if (boxes.length === 0) continue
      for (const box of boxes) take(index, box)
      column.s = (boxes[boxes.length - 1] as Box).s1
    }
  }

  // The corridor: from the foot to a door's length into the last room it serves, and as far as
  // the bubbles' own length while rooms stand beside it, never off the floor.
  if (spine) {
    let sEnd = sStart + DOOR_M
    let beside = sStart
    for (const [index, boxes] of laid) {
      if (index === footIndex || index === corridor) continue
      for (const box of boxes) {
        beside = Math.max(beside, box.s1)
        const onSpine =
          Math.abs(box.t0 - spineBox.t1) < 1e-9 || Math.abs(box.t1 - spineBox.t0) < 1e-9
        if (!onSpine || !linked(index, corridor)) continue
        // The room's own wall on the spine starts past any companion cut from that corner.
        let from = box.s0
        for (const cut of cuts.get(index) ?? [])
          if (
            cut.s0 <= from + 1e-9 &&
            cut.s1 > from + 1e-9 &&
            (Math.abs(cut.t0 - box.t0) < 1e-9 || Math.abs(cut.t1 - box.t1) < 1e-9) &&
            (Math.abs(cut.t0 - spineBox.t1) < 1e-9 || Math.abs(cut.t1 - spineBox.t0) < 1e-9)
          )
            from = cut.s1
        sEnd = Math.max(sEnd, Math.min(box.s1, from + DOOR_M))
      }
    }
    sEnd = Math.max(sEnd, Math.min(beside, sStart + snap(2 * spine.half)))
    sEnd = Math.min(sMax, snap(sEnd))
    if (sEnd > sStart) take(corridor, { s0: sStart, s1: sEnd, t0: spineBox.t0, t1: spineBox.t1 })
  }

  // The cells. Companions are written after their owners so the carve holds, and a fixed cell (a
  // stair the floor below placed) is never taken.
  const order = [...laid.keys()].sort(
    (a, b) =>
      (rooms[a]?.owner !== undefined ? 1 : 0) - (rooms[b]?.owner !== undefined ? 1 : 0) || a - b,
  )
  for (const index of order)
    for (const box of laid.get(index) ?? [])
      for (const cell of cellsInBox(grid, frame, box)) {
        if (division.fixed[cell]) continue
        const place = grid.place[cell] ?? OFF
        if (place !== INSIDE && place !== PAST) continue
        division.owner[cell] = index
      }
  if (placedStair >= 0)
    for (const cell of placedCells(division, rooms[placedStair] as PartitionRoom))
      division.owner[cell] = placedStair
}
