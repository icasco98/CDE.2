import {
  boundingBox,
  centroid,
  pointInPolygon,
  signedArea,
  type Point,
  type Polygon,
} from '../geometry'

export type Position = { readonly x: number; readonly y: number }

/** A room as the bubble solver needs it: the model's room without the parts the picture ignores. */
export type SimulationRoom = {
  readonly id: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
  /** The room-type table's privacy tier, where the program has one; without it the room is unaffected. */
  readonly tier?: string
}

/**
 * An edge reduced to the pair it joins and the storey it is on; ids that name no room, EXTERIOR
 * among them, are dropped, because the outside has no bubble to pull on.
 */
export type SimulationEdge = { readonly a: string; readonly b: string; readonly storey: number }

export type LayoutConfig = {
  readonly springStiffness: number
  readonly restGap: number
  readonly repulsion: number
  /** What the repulsion between two rooms of different privacy tiers is multiplied by. */
  readonly tierRepulsion: number
  readonly spread: number
  readonly centrePull: number
  readonly damping: number
  readonly timeStep: number
  readonly energyThreshold: number
  readonly maxIterations: number
}

export const defaultLayout: LayoutConfig = {
  /** A wanted link pulls hard enough to gather a household and softly enough to lose to a collision. */
  springStiffness: 6,
  /** The air a bubble keeps around itself: both a link's rest length and how far collision parts two circles. */
  restGap: 1.5,
  /**
   * Ten times the springs: hard enough that a wanted link never buys itself an overlap, and soft
   * enough to stay steady on a full storey. Above about eighty, a small bubble pressed between its
   * neighbours and the buildable line rings from one to the other and the picture never rests; the
   * overlap the model allows is held by the correction, not by this push.
   */
  repulsion: 60,
  /** One: the tiers part no harder than anything else until the user-requirements weight says so. */
  tierRepulsion: 1,
  /** A breeze, not a force: enough to open the cloud out, too weak to undo a link. */
  spread: 2,
  /** Holds the cloud on the middle of the buildable area without bunching it. */
  centrePull: 1.5,
  /** Near critical for a link on a room-sized mass: settles in a couple of seconds without ringing. */
  damping: 0.9,
  /** Short enough that the stiffest force, collision, stays stable in a semi-implicit step. */
  timeStep: 0.1,
  /** The mean energy of movement per room; below it nothing moves far enough to see. */
  energyThreshold: 1e-3,
  /** Thirty rooms settle in about a hundred and sixty; the rest is headroom before the animation is cut off. */
  maxIterations: 600,
}

/** A second of simulation time: how long a Spread holds before the cloud is let settle again. */
export const SPREAD_SECONDS = 1

/**
 * How many steps running the picture must read still before it is called at rest: a contact takes
 * all the speed out of a bubble for the one frame it is corrected in, while the forces behind it
 * are still pressing, so a single quiet frame is not enough to stop on.
 */
export const STILL_FRAMES = 3

/**
 * The user-requirements weight on the simulation: a house whose owner's own wishes count for more
 * gathers what belongs together harder and parts the public rooms from the private ones harder.
 * The range is wide, a quarter of the pull to nearly twice it and a tier gap of one to three, so
 * that moving the slider is felt on the sheet rather than looked for.
 */
export function layoutFor(weight: number): LayoutConfig {
  const w = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0.5
  return {
    ...defaultLayout,
    springStiffness: defaultLayout.springStiffness * (0.25 + 1.5 * w),
    tierRepulsion: 1 + 2 * w,
  }
}

/**
 * Spread is the same layout with the repulsion tripled. Repulsion here is two things, the push and
 * the air two bubbles keep, and tripling only the push would move nothing in a cloud already packed
 * rim to rim, so the gap goes with it and the cloud opens out before it is let settle again.
 */
export function spreadLayout(base: LayoutConfig): LayoutConfig {
  return {
    ...base,
    repulsion: base.repulsion * 3,
    spread: base.spread * 3,
    restGap: base.restGap * 3,
  }
}

export type Body = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly radius: number
  readonly storey: number
  readonly storeysSpanned: number
  readonly pinned: boolean
  readonly tier?: string
}

/** A link between two bodies. Both stand on the one plot, so its storey changes no arithmetic. */
export type Link = { readonly a: number; readonly b: number }

/** One side of the buildable line, with the way into the floor from it. */
export type Side = { readonly from: Point; readonly to: Point; readonly inward: Point }

/**
 * The buildable line as a frame reads it: its sides one at a time with the way in from each, the
 * middle of the floor, and how deep the floor is at that middle, all worked out once when the
 * picture is built so that no frame ever measures the polygon again.
 */
export type Buildable = {
  readonly polygon: Polygon
  readonly sides: readonly Side[]
  readonly middle: Point
  /** The largest bubble the floor holds at its middle; a bigger one rests there rather than jam. */
  readonly deepest: number
}

export type SimulationState = {
  readonly bodies: readonly Body[]
  readonly links: readonly Link[]
  readonly inside: Buildable
  /**
   * How much the picture moved in the last step, as a mean energy per room taken from how far each
   * bubble really went; Infinity before the first step.
   */
  readonly energy: number
}

export type Settlement = {
  readonly state: SimulationState
  readonly iterations: number
  readonly settled: boolean
}

export function radiusOf(area: number): number {
  return Math.sqrt(Math.max(area, 0) / Math.PI)
}

function spanOf(storeysSpanned: number): number {
  return Math.max(1, Math.trunc(storeysSpanned))
}

/** What the twins are read from: where a room stands and how many storeys it reaches. */
type Standing = { readonly storey: number; readonly storeysSpanned: number }

/** The storeys a room is drawn on, lowest first: one, or one for each storey a stair spans. */
export function twinsOf(room: Standing): readonly number[] {
  const span = spanOf(room.storeysSpanned)
  return Array.from({ length: span }, (_unused, above) => room.storey + above)
}

/** Whether two rooms stand on a floor in common, the only way either is ever in the other's way. */
export function shareAStorey(a: Standing, b: Standing): boolean {
  const top = (room: Standing): number => room.storey + spanOf(room.storeysSpanned) - 1
  return a.storey <= top(b) && b.storey <= top(a)
}

function nearestOnSide(x: number, y: number, from: Point, to: Point): Point {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const run = dx * dx + dy * dy
  if (run < 1e-12) return from
  const along = Math.min(1, Math.max(0, ((x - from[0]) * dx + (y - from[1]) * dy) / run))
  return [from[0] + dx * along, from[1] + dy * along]
}

/** How far the nearest side of the buildable line is from a point, and where on it. */
function nearestSide(
  sides: readonly Side[],
  fallback: Point,
  x: number,
  y: number,
): { readonly at: Point; readonly away: number } {
  let at = fallback
  let away = Infinity
  for (const side of sides) {
    const q = nearestOnSide(x, y, side.from, side.to)
    const distance = Math.hypot(q[0] - x, q[1] - y)
    if (distance < away) {
      away = distance
      at = q
    }
  }
  return { at, away }
}

/**
 * The buildable line read once for the whole run. The setbacks are the Municipality's, so the line
 * holds the bubbles in whatever the plot's own boundary is set to do with footprints; a polygon of
 * fewer than three corners is a plot the setbacks swallowed whole, and holds nothing in.
 */
export function buildableOf(polygon: Polygon): Buildable {
  const sides: Side[] = []
  const outward = signedArea(polygon) >= 0 ? 1 : -1
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]
    const to = polygon[(i + 1) % polygon.length]
    if (!from || !to) continue
    const run = Math.hypot(to[0] - from[0], to[1] - from[1])
    if (run < 1e-12) continue
    // The way in, read from the ring's own winding, as the geometry reads a wall's outward normal.
    const inward: Point = [
      (-outward * (to[1] - from[1])) / run,
      (outward * (to[0] - from[0])) / run,
    ]
    sides.push({ from, to, inward })
  }
  const enough = polygon.length >= 3
  const middle: Point = enough ? centroid(polygon) : [0, 0]
  if (!enough) return { polygon, sides: [], middle, deepest: 0 }
  return {
    polygon,
    sides,
    middle,
    deepest: nearestSide(sides, middle, middle[0], middle[1]).away,
  }
}

/** FNV-1a over the room id: a fixed starting place per room, and never Math.random. */
function hash01(id: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) % 100000) / 100000
}

const FALLBACK_PLOT: Polygon = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
]

export function createState(
  rooms: readonly SimulationRoom[],
  edges: readonly SimulationEdge[],
  inside: Buildable,
): SimulationState {
  // A room the diagram has never placed opens inside the buildable area, at a place its own id
  // fixes: the same program opens the same way twice, and never at random.
  const box = boundingBox(inside.polygon.length >= 3 ? inside.polygon : FALLBACK_PLOT)
  const bodies = rooms.map((room) => ({
    id: room.id,
    x: room.bubble ? room.bubble.x : box.left + box.width * (0.2 + hash01(room.id, 1) * 0.6),
    y: room.bubble ? room.bubble.y : box.top + box.depth * (0.2 + hash01(room.id, 2) * 0.6),
    vx: 0,
    vy: 0,
    radius: radiusOf(room.targetArea),
    storey: room.storey,
    storeysSpanned: spanOf(room.storeysSpanned),
    pinned: room.pinned,
    ...(room.tier === undefined ? {} : { tier: room.tier }),
  }))
  const at = new Map(bodies.map((body, index) => [body.id, index]))
  const links: Link[] = []
  for (const edge of edges) {
    const a = at.get(edge.a)
    const b = at.get(edge.b)
    if (a === undefined || b === undefined || a === b) continue
    links.push({ a, b })
  }
  return { bodies, links, inside, energy: Infinity }
}

type Work = {
  readonly body: Body
  x: number
  y: number
  vx: number
  vy: number
  fx: number
  fy: number
}

/** Two circles exactly on top of each other need a direction to part along; their indices fix one. */
function apart(dx: number, dy: number, seed: number): readonly [number, number, number] {
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance > 1e-9) return [dx / distance, dy / distance, distance]
  return [Math.cos(seed), Math.sin(seed), 0]
}

function massOf(body: Body): number {
  return Math.max(body.radius, 0.5)
}

/**
 * A pair at a time, so a bubble wedged between two others is only cleared of both after a few goes
 * round; eight is past the worst a villa's program reaches and bounds the frame either way.
 */
const CORRECTION_PASSES = 8

/** An overlap this small is a rounding error, not a bubble resting on another. */
const CLEARED = 1e-9

/**
 * How far one bubble may lie over another, as a share of the smaller one's radius. The model
 * allows an overlap of up to a quarter of the smaller one's area and never more: six tenths of the
 * smaller radius comes to 0.59 r² between two circles of a size, against the 0.79 r² a quarter of
 * the area is, and less than that for a small circle against a large one. The wall stands there
 * rather than at touching because a storey whose rooms come to more circles than its floor has
 * room for has no arrangement without an overlap, and the picture must still come to rest.
 */
const LIE_OVER = 0.6

/** The share of a correction is by area, and π cancels in the ratio, so the radius squared stands for it. */
function areaOf(body: Body): number {
  return body.radius * body.radius
}

/** How much of a correction the first body takes: none when it is pinned, all when the other is. */
function shareOf(a: Body, b: Body): number {
  return a.pinned ? 0 : b.pinned ? 1 : areaOf(b) / (areaOf(a) + areaOf(b))
}

/** A room with no tier, or an exempt one such as a bathroom, stands outside the privacy gradient. */
function tiersApart(a: Body, b: Body): boolean {
  if (!a.tier || !b.tier || a.tier === 'exempt' || b.tier === 'exempt') return false
  return a.tier !== b.tier
}

/**
 * How far apart two bubbles are kept: their radii and the rest gap, and between two different
 * privacy tiers the gap as well as the push is scaled, because in a cloud packed rim to rim a
 * stronger push alone moves nothing and only the air kept shows on the sheet.
 */
function clearOf(a: Body, b: Body, config: LayoutConfig): number {
  const factor = tiersApart(a, b) ? config.tierRepulsion : 1
  return a.radius + b.radius + config.restGap * factor
}

/**
 * What one bubble is asked to do by the bubbles in its way: how far it should move, and how many
 * asked it. A bubble pressed on from several sides at once takes the mean of what they ask, so
 * that demands which cannot all be met balance instead of taking turns.
 */
type Demand = { dx: number; dy: number; asked: number }

/**
 * The bubble put back inside the buildable line, its whole circle within it and clear of every
 * side rather than of the nearest one, or a bubble in a corner would be pushed off one side into
 * the other. The line is a wall and is never traded: whatever the bubbles ask of each other, this
 * is done last and in full. A room too big for the floor comes to rest at the middle instead,
 * which is the one place a bubble wider than the ground it stands on can settle.
 */
function holdInside(w: Work, inside: Buildable): void {
  const radius = Math.min(w.body.radius, inside.deepest)
  if (!pointInPolygon(inside.polygon, [w.x, w.y])) {
    // Off the floor altogether: back to the nearest line and a radius in towards the middle.
    const { at } = nearestSide(inside.sides, inside.middle, w.x, w.y)
    const toX = inside.middle[0] - at[0]
    const toY = inside.middle[1] - at[1]
    const length = Math.hypot(toX, toY) || 1
    w.x = at[0] + (toX / length) * radius
    w.y = at[1] + (toY / length) * radius
  }
  for (let pass = 0; pass < SIDE_PASSES; pass++) {
    let clear = true
    for (const side of inside.sides) {
      const q = nearestOnSide(w.x, w.y, side.from, side.to)
      const dx = w.x - q[0]
      const dy = w.y - q[1]
      const away = Math.hypot(dx, dy)
      if (away >= radius - CLEARED) continue
      clear = false
      // Standing on the line itself there is no direction to come back along; the side's own way
      // in gives one, and past the end of a side it is the corner that pushes the bubble off.
      const ux = away < 1e-9 ? side.inward[0] : dx / away
      const uy = away < 1e-9 ? side.inward[1] : dy / away
      w.x = q[0] + ux * radius
      w.y = q[1] + uy * radius
    }
    if (clear) break
  }
}

/** Twice round the sides squares a bubble up in a corner; a third go is the margin. */
const SIDE_PASSES = 3

/**
 * The positional correction, after the forces have moved everything. Two bodies sharing a floor
 * and lying over each other by more than the model allows are parted along the line between their
 * centres, the move split by inverse area so the larger room gives way less, and every bubble is
 * asked to keep its whole circle inside the buildable line. Every demand on a bubble is gathered
 * before any of it is acted on and it moves by the mean of them, so that demands which cannot all
 * be met balance instead of taking turns and a storey too full for its floor still comes to rest.
 * A pinned body takes none of it, because pinned is the person's hand; two pinned bodies left on
 * each other stay.
 */
function correct(work: readonly Work[], inside: Buildable): void {
  const from = work.map((w) => ({ x: w.x, y: w.y }))
  const holds = inside.sides.length >= 3
  const wants: Demand[] = work.map(() => ({ dx: 0, dy: 0, asked: 0 }))
  for (let pass = 0; pass < CORRECTION_PASSES; pass++) {
    for (const want of wants) {
      want.dx = 0
      want.dy = 0
      want.asked = 0
    }
    for (let i = 0; i < work.length; i++) {
      const a = work[i]
      const wantA = wants[i]
      if (!a || !wantA) continue
      for (let j = i + 1; j < work.length; j++) {
        const b = work[j]
        const wantB = wants[j]
        if (!b || !wantB || (a.body.pinned && b.body.pinned)) continue
        if (!shareAStorey(a.body, b.body)) continue
        const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, i + j)
        // The wall is the overlap the model allows, not the air a link wants around a bubble: a
        // correction that took that air as well would fight the spring holding the pair at exactly
        // that distance, and the two would push each other about for ever instead of resting.
        const closest =
          a.body.radius + b.body.radius - LIE_OVER * Math.min(a.body.radius, b.body.radius)
        const overlap = closest - distance
        if (overlap <= CLEARED) continue
        const share = shareOf(a.body, b.body)
        wantA.dx -= ux * overlap * share
        wantA.dy -= uy * overlap * share
        wantA.asked += 1
        wantB.dx += ux * overlap * (1 - share)
        wantB.dy += uy * overlap * (1 - share)
        wantB.asked += 1
      }
    }
    let clear = true
    for (const [index, w] of work.entries()) {
      const want = wants[index]
      if (!want || w.body.pinned) continue
      if (want.asked > 0) {
        clear = false
        w.x += want.dx / want.asked
        w.y += want.dy / want.asked
      }
      if (holds) holdInside(w, inside)
    }
    if (clear) break
  }
  // A bubble the forces drove into its neighbour and the correction put back has not moved, so the
  // correction takes that speed off it: exactly the part of it that pressed against the correction
  // and nothing else. It never hands any back, or a bubble let go inside another would be thrown
  // across the sheet instead of set down beside it.
  for (const [index, w] of work.entries()) {
    const was = from[index]
    if (!was || w.body.pinned) continue
    const bx = w.x - was.x
    const by = w.y - was.y
    const back = Math.hypot(bx, by)
    if (back < 1e-12) continue
    const into = (w.vx * bx + w.vy * by) / back
    if (into >= 0) continue
    w.vx -= (into * bx) / back
    w.vy -= (into * by) / back
  }
}

/**
 * One frame. Every storey is drawn on the one plot, so a stair spanning storeys is one body at one
 * point and needs no arithmetic of its own; two rooms are in each other's way only where they
 * share a floor, which is what leaves a bedroom upstairs free to stand over the kitchen below.
 */
export function step(
  state: SimulationState,
  config: LayoutConfig = defaultLayout,
): SimulationState {
  const count = state.bodies.length
  if (count === 0) return { ...state, energy: 0 }
  const work: Work[] = state.bodies.map((body) => ({
    body,
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    fx: 0,
    fy: 0,
  }))

  for (const link of state.links) {
    const a = work[link.a]
    const b = work[link.b]
    if (!a || !b) continue
    const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, link.a + link.b)
    const rest = a.body.radius + b.body.radius + config.restGap
    const pull = config.springStiffness * (distance - rest)
    a.fx += pull * ux
    a.fy += pull * uy
    b.fx -= pull * ux
    b.fy -= pull * uy
  }

  for (let i = 0; i < count; i++) {
    const a = work[i]
    if (!a) continue
    for (let j = i + 1; j < count; j++) {
      const b = work[j]
      if (!b || !shareAStorey(a.body, b.body)) continue
      const clear = clearOf(a.body, b.body, config)
      const [ux, uy, distance] = apart(b.x - a.x, b.y - a.y, i + j)
      const overlap = clear - distance
      // A soft collision below contact, and a bounded inverse-square breeze above it that spreads
      // the cloud. The correction puts a deep overlap right in one frame, so the collision is only
      // asked for the last gap of it; unasked, it flings a bubble let go inside another off the sheet.
      const push =
        (tiersApart(a.body, b.body) ? config.tierRepulsion : 1) *
        ((overlap > 0 ? config.repulsion * Math.min(overlap, config.restGap) : 0) +
          (config.spread * clear * clear) / Math.max(distance, clear) ** 2)
      a.fx -= push * ux
      a.fy -= push * uy
      b.fx += push * ux
      b.fy += push * uy
    }
  }

  const interval = config.timeStep
  const middle = state.inside.middle
  for (const w of work) {
    if (w.body.pinned) continue
    const mass = massOf(w.body)
    // The cloud is held on the middle of the floor it is being laid out on, not on the sheet's.
    w.fx += config.centrePull * (middle[0] - w.x)
    w.fy += config.centrePull * (middle[1] - w.y)
    w.vx = (w.vx + (w.fx / mass) * interval) * config.damping
    w.vy = (w.vy + (w.fy / mass) * interval) * config.damping
  }

  for (const w of work) {
    if (w.body.pinned) continue
    w.x += w.vx * interval
    w.y += w.vy * interval
  }

  correct(work, state.inside)

  // What a bubble did is where it ended up: one held still between its neighbours has speed and
  // goes nowhere, and the picture is at rest when nothing goes anywhere.
  let energy = 0
  for (const w of work) {
    const dx = (w.x - w.body.x) / interval
    const dy = (w.y - w.body.y) / interval
    energy += 0.5 * massOf(w.body) * (dx * dx + dy * dy)
  }

  const bodies = work.map((w) =>
    w.body.pinned ? w.body : { ...w.body, x: w.x, y: w.y, vx: w.vx, vy: w.vy },
  )
  return { ...state, bodies, energy: energy / count }
}

export function settle(state: SimulationState, config: LayoutConfig = defaultLayout): Settlement {
  let current = state
  let still = 0
  for (let i = 1; i <= config.maxIterations; i++) {
    current = step(current, config)
    still = current.energy < config.energyThreshold ? still + 1 : 0
    if (still >= STILL_FRAMES) return { state: current, iterations: i, settled: true }
  }
  return { state: current, iterations: config.maxIterations, settled: false }
}
