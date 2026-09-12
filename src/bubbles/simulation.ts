import { boundingBox, type Point } from '../geometry'
import type { Family, Weights } from '../model'
import { companionOwners, forces, kerbFor, type ForceField, type ForceRoom } from '../rulebook'
import { CORRIDOR_R, corridorHalf, gapBetween, type Placed } from './capsule'
import { canonicalStart } from './start'
import { CLEARED, holdInside, type Ground } from './ground'

export type Position = { readonly x: number; readonly y: number }

/** A room as the bubble solver needs it: the model's room without the parts the picture ignores. */
export type SimulationRoom = {
  readonly id: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
  /** The room-type table's key, which the forces and the walls read; without it no row acts. */
  readonly kind?: string
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
  readonly spread: number
  readonly centrePull: number
  /** What a force of full strength at full weight moves a room at, in metres per second squared. */
  readonly pull: number
  readonly damping: number
  readonly timeStep: number
  readonly energyThreshold: number
  readonly maxIterations: number
  /** The person's weight on each family of forces; a family it does not name counts as a half. */
  readonly weights: Weights
}

export const defaultLayout: LayoutConfig = {
  /** A wanted link pulls hard enough to gather a household and softly enough to lose to a collision. */
  springStiffness: 6,
  /** The air two bubbles with nothing between them keep; a linked pair keeps none, it touches. */
  restGap: 1.5,
  /**
   * Soft, because the overlap the model allows is a wall the projection holds outright and this is
   * only the air two strangers keep between them. A push much stiffer than the springs kicks a
   * bubble pressed between its neighbours across the sheet and the picture never comes to rest.
   */
  repulsion: 8,
  /** A breeze, not a force: enough to open the cloud out, too weak to undo a link. */
  spread: 2,
  /**
   * Barely there beside the rulebook's rows, which now say where a room belongs: enough to gather
   * a room no row acts on onto the floor, and light enough that a row of full strength wins.
   */
  centrePull: 0.4,
  /** A strong row at full weight walks a room the depth of a villa against the gather above. */
  pull: 8,
  /** Near critical for a link on a room-sized mass: settles in a couple of seconds without ringing. */
  damping: 0.9,
  /** Short enough that the stiffest force, collision, stays stable in a semi-implicit step. */
  timeStep: 0.1,
  /** The mean energy of movement per room; below it nothing moves far enough to see. */
  energyThreshold: 3e-4,
  /** A villa's program settles in about a hundred; the rest is headroom before a run is cut off. */
  maxIterations: 1200,
  weights: {},
}

/** How far past contact two bubbles still feel each other, as a multiple of the air they keep. */
const BREEZE_REACH = 3

/** A second of simulation time: how long a Spread holds before the cloud is let settle again. */
export const SPREAD_SECONDS = 1

/**
 * How many steps running the picture must read still before it is called at rest: a contact takes
 * all the speed out of a bubble for the one frame it is corrected in, while the forces behind it
 * are still pressing, so a single quiet frame is not enough to stop on.
 */
export const STILL_FRAMES = 3

/** How much stiller a picture must get over a spell of frames to count as still settling. */
const IMPROVED = 0.8

/**
 * The spell a picture is given to get stiller in: a little over half a second at sixty frames a
 * second, which reads as the cloud having stopped rather than as a cut. A storey with more rooms
 * than its floor will hold has no arrangement that satisfies everything, and the last of the
 * movement never quite goes; the picture is at rest when it stops getting stiller, as much as when
 * it is still.
 */
const STUCK_FRAMES = 40

/** One reading of whether a picture has come to rest, used by the whole run and by one settle. */
export function restWatch() {
  let still = 0
  let stillest = Infinity
  let since = 0
  let smooth = Infinity
  return {
    /** Forget what the picture has done so far: something has changed and it must prove itself again. */
    wake(): void {
      still = 0
      stillest = Infinity
      since = 0
      smooth = Infinity
    },
    /**
     * Whether the picture is at rest after a frame of this much movement, read off a smoothed
     * measure rather than the frame's own: a storey too full for its floor never quite stops, and
     * the last of its movement is a shuffle between two arrangements whose frames are loud one
     * after the other and quiet the next. What matters is whether the shuffle is getting smaller.
     */
    read(energy: number, threshold: number): boolean {
      smooth = smooth === Infinity ? energy : smooth * (1 - SMOOTHING) + energy * SMOOTHING
      still = smooth < threshold ? still + 1 : 0
      since += 1
      let stuck = false
      if (since >= STUCK_FRAMES) {
        stuck = smooth > stillest * IMPROVED
        stillest = smooth
        since = 0
      }
      return still >= STILL_FRAMES || stuck
    },
    /** Whether the last frame was quiet in itself, which is what a preview is recorded on. */
    quiet: (): boolean => still > 0,
  }
}

/** How much of a frame's own movement a smoothed reading takes: a fifth, which is a few frames. */
const SMOOTHING = 0.2

/** A weight nobody has set sits in the middle, so an untouched project pulls no way in particular. */
const MIDDLE_WEIGHT = 0.5

export function weightOf(weights: Weights, family: Family): number {
  const set = weights[family]
  return typeof set === 'number' && Number.isFinite(set)
    ? Math.min(1, Math.max(0, set))
    : MIDDLE_WEIGHT
}

/**
 * The weights on the simulation. The user-requirements weight also gathers what belongs together
 * harder, because a house whose owner's own wishes count for more holds its links tighter; beyond
 * that each family's weight multiplies the strength of its own rows in `rulebook/forces.ts`.
 */
export function layoutFor(weights: Weights): LayoutConfig {
  const user = weightOf(weights, 'userRequirements')
  return {
    ...defaultLayout,
    springStiffness: defaultLayout.springStiffness * (0.25 + 1.5 * user),
    weights,
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
    // The gather onto the middle of the floor and the rulebook's own rows are what a breeze has to
    // open the cloud against, so both are let out for the second it blows and put back after it.
    centrePull: base.centrePull / 3,
    pull: base.pull / 3,
  }
}

export type Body = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly radius: number
  /** How far the body's segment reaches from its middle: nought for a disc, a length for a corridor. */
  readonly half: number
  /** The way that segment lies, in radians; it says nothing while the half is nought. */
  readonly angle: number
  readonly storey: number
  readonly storeysSpanned: number
  readonly pinned: boolean
  readonly kind?: string
  readonly tier?: string
  /** The kerb this body stands against and slides along, where its kind is one of the walled three. */
  readonly kerb?: readonly [Point, Point]
  /** A corridor whose near end is held on a room: where it lies is not the pairs' to say. */
  readonly anchored?: true
}

/** A link between two bodies. Both stand on the one plot, so its storey changes no arithmetic. */
export type Link = { readonly a: number; readonly b: number }

/** A corridor, the room it starts from, and the rooms it turns toward. */
export type Corridor = {
  readonly body: number
  readonly anchor?: number
  readonly served: readonly number[]
}

/** An auxiliary room and the room it is entered through, whose perimeter it rides. */
export type Companion = { readonly body: number; readonly owner: number }

export type SimulationState = {
  readonly bodies: readonly Body[]
  readonly links: readonly Link[]
  readonly corridors: readonly Corridor[]
  readonly companions: readonly Companion[]
  readonly ground: Ground
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

/**
 * How far one bubble may lie over another, as a share of the smaller one's radius. The model
 * allows an overlap of up to a quarter of the smaller one's area and never more: six tenths of the
 * smaller radius comes to 0.59 r² between two circles of a size, against the 0.79 r² a quarter of
 * the area is, and less than that for a small circle against a large one. The wall stands there
 * rather than at touching because a storey whose rooms come to more circles than its floor has
 * room for has no arrangement without an overlap, and the picture must still come to rest.
 */
const LIE_OVER = 0.6

/** How far apart two bubbles may stand and still be read as touching, in metres. */
export const TOUCHING = 0.1

/**
 * Where a link rests: touching, rim to rim. The overlap wall stands a little inside it, so the two
 * are never both pressing on the same pair at once and the picture can come to rest between them.
 */
export function restBetween(
  a: { readonly radius: number },
  b: { readonly radius: number },
): number {
  return a.radius + b.radius
}

/** How close the overlap wall lets two bubbles come: touching, less the overlap the model allows. */
export function closestBetween(
  a: { readonly radius: number },
  b: { readonly radius: number },
): number {
  return a.radius + b.radius - LIE_OVER * Math.min(a.radius, b.radius)
}

const FALLBACK_PLOT: Point[] = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
]

/** The kinds a corridor joins rather than leads to, which is what it may start from. */
const anchorKinds: readonly string[] = ['entry-foyer', 'stair']

/** The kerb line a walled kind stands against: its own boundary, moved in by the bubble's radius. */
function kerbLineFor(
  kind: string | undefined,
  radius: number,
  ground: Ground,
): readonly [Point, Point] | undefined {
  const side = kind === undefined ? undefined : kerbFor(kind, ground.sides)
  if (!side) return undefined
  // The bubble stands against the kerb, not astride it: its whole circle stays inside the line.
  return [
    [side.from[0] + side.inward[0] * radius, side.from[1] + side.inward[1] * radius],
    [side.to[0] + side.inward[0] * radius, side.to[1] + side.inward[1] * radius],
  ]
}

export function createState(
  rooms: readonly SimulationRoom[],
  edges: readonly SimulationEdge[],
  ground: Ground,
): SimulationState {
  // A room the diagram has already placed opens where it was left; the first arrangement is only
  // worked out when there is a room with nowhere to open, which is a program just rebuilt.
  const opened = rooms.every((room) => room.bubble)
    ? new Map<string, Position>()
    : canonicalStart(rooms, edges, ground)
  const box = boundingBox(ground.inside.polygon.length >= 3 ? ground.inside.polygon : FALLBACK_PLOT)
  const middle = { x: box.left + box.width / 2, y: box.top + box.depth / 2 }
  const bodies: Body[] = rooms.map((room) => {
    const corridor = room.kind === 'hallway'
    const radius = corridor ? CORRIDOR_R : radiusOf(room.targetArea)
    const opening = room.bubble ?? opened.get(room.id) ?? middle
    const kerb = corridor ? undefined : kerbLineFor(room.kind, radius, ground)
    return {
      id: room.id,
      x: opening.x,
      y: opening.y,
      vx: 0,
      vy: 0,
      radius,
      half: corridor ? corridorHalf(room.targetArea) : 0,
      angle: 0,
      storey: room.storey,
      storeysSpanned: spanOf(room.storeysSpanned),
      pinned: room.pinned,
      ...(room.kind === undefined ? {} : { kind: room.kind }),
      ...(room.tier === undefined ? {} : { tier: room.tier }),
      ...(kerb === undefined ? {} : { kerb }),
    }
  })
  const at = new Map(bodies.map((body, index) => [body.id, index]))
  const links: Link[] = []
  for (const edge of edges) {
    const a = at.get(edge.a)
    const b = at.get(edge.b)
    if (a === undefined || b === undefined || a === b) continue
    links.push({ a, b })
  }
  const corridors = corridorsOf(bodies, links)
  const anchored = new Set(
    corridors.filter((corridor) => corridor.anchor !== undefined).map((corridor) => corridor.body),
  )
  return {
    bodies: bodies.map((body, index) => (anchored.has(index) ? { ...body, anchored: true } : body)),
    links,
    corridors,
    companions: companionsIn(rooms, edges, at),
    ground,
    energy: Infinity,
  }
}

/** Each corridor with the room it starts from and the rooms it turns toward. */
function corridorsOf(bodies: readonly Body[], links: readonly Link[]): readonly Corridor[] {
  const out: Corridor[] = []
  for (const [index, body] of bodies.entries()) {
    if (body.kind !== 'hallway') continue
    const joined = links
      .filter((link) => link.a === index || link.b === index)
      .map((link) => (link.a === index ? link.b : link.a))
    const onThisFloor = (other: number): boolean => {
      const each = bodies[other]
      return each !== undefined && shareAStorey(each, body)
    }
    const anchor =
      joined.find(
        (other) => anchorKinds.includes(bodies[other]?.kind ?? '') && onThisFloor(other),
      ) ??
      bodies.findIndex((each, other) => anchorKinds.includes(each.kind ?? '') && onThisFloor(other))
    const started = anchor >= 0 ? anchor : undefined
    const served = joined.filter((other) => other !== started)
    // With nothing linked to it yet a corridor still has to lie somewhere, so it turns toward the
    // rooms standing on its own floor until the links say otherwise.
    const turnsTo =
      served.length > 0
        ? served
        : bodies
            .map((_each, other) => other)
            .filter((other) => other !== index && other !== started && onThisFloor(other))
    out.push({
      body: index,
      ...(started === undefined ? {} : { anchor: started }),
      served: turnsTo,
    })
  }
  return out
}

/** The auxiliary rooms each room owns, as pairs of bodies, read by the rulebook's companion rule. */
function companionsIn(
  rooms: readonly SimulationRoom[],
  edges: readonly SimulationEdge[],
  at: ReadonlyMap<string, number>,
): readonly Companion[] {
  const out: Companion[] = []
  const withTypes = rooms.map((room) => ({ id: room.id, type: room.kind ?? '' }))
  for (const [companion, ownerId] of companionOwners(withTypes, edges)) {
    const body = at.get(companion)
    const owner = at.get(ownerId)
    if (body !== undefined && owner !== undefined) out.push({ body, owner })
  }
  return out
}

type Work = {
  readonly body: Body
  x: number
  y: number
  angle: number
  vx: number
  vy: number
  fx: number
  fy: number
}

function massOf(body: Body): number {
  return Math.max(body.radius, 0.5)
}

/** The share of a correction is by area, and π cancels in the ratio, so the radius squared stands for it. */
function areaOf(body: Body): number {
  return body.radius * body.radius
}

/** Whether a body goes nowhere at a pair's asking: the person's hand, or a corridor's own anchor. */
function fixed(body: Body): boolean {
  return body.pinned || body.anchored === true
}

/** How much of a correction the first body takes: none when it is held, all when the other is. */
function shareOf(a: Body, b: Body): number {
  if (fixed(a)) return 0
  if (fixed(b)) return 1
  return areaOf(b) / (areaOf(a) + areaOf(b))
}

/**
 * What one bubble is asked to do by the bubbles around it: how far it should move, and how many
 * asked it. A bubble pressed on from several sides at once takes the mean of what they ask, so
 * that demands which cannot all be met balance instead of taking turns.
 */
type Demand = { dx: number; dy: number; asked: number }

/**
 * The rounds of projection a frame takes. Three settles a linked pair against the bubbles round it
 * without the picture ringing from one round to the next.
 */
const PROJECTION_ROUNDS = 3

/**
 * How much of what the pairs ask for is taken in one round. Short of the whole, because a bubble
 * pressed by a link on one side and an overlap on the other is asked for two things at once and
 * taking both in full leaves it shuffling between them for ever; three rounds of seven tenths
 * still put a deep overlap right inside one frame.
 */
const RELAXATION = 0.7

function placedOf(w: Work): Placed {
  return { x: w.x, y: w.y, angle: w.angle, half: w.body.half }
}

/** A body put back on the kerb it stands against: along the line and nowhere off it. */
function onKerb(w: Work): void {
  const kerb = w.body.kerb
  if (!kerb) return
  const [from, to] = kerb
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const run = dx * dx + dy * dy
  if (run < 1e-12) return
  const along = Math.min(1, Math.max(0, ((w.x - from[0]) * dx + (w.y - from[1]) * dy) / run))
  w.x = from[0] + dx * along
  w.y = from[1] + dy * along
}

/**
 * The corridor turned and set down: its near end on the room it starts from, its length pointing
 * at the middle of the rooms it serves. A corridor is the one bubble whose direction is not the
 * forces' to choose, because what a corridor is for is reaching the doors off it.
 */
function alongTheRooms(work: readonly Work[], corridor: Corridor, middle: Point): void {
  const w = work[corridor.body]
  if (!w) return
  let toX = 0
  let toY = 0
  let counted = 0
  for (const other of corridor.served) {
    const served = work[other]
    if (!served) continue
    toX += served.x
    toY += served.y
    counted += 1
  }
  const aim: Point = counted > 0 ? [toX / counted, toY / counted] : middle
  const anchor = corridor.anchor === undefined ? undefined : work[corridor.anchor]
  const from: Point = anchor ? [anchor.x, anchor.y] : [w.x, w.y]
  const ux = aim[0] - from[0]
  const uy = aim[1] - from[1]
  const run = Math.hypot(ux, uy)
  if (run < 1e-9) return
  w.angle = Math.atan2(uy, ux)
  if (!anchor) return
  const reach = restBetween(anchor.body, w.body) + w.body.half
  w.x = from[0] + (ux / run) * reach
  w.y = from[1] + (uy / run) * reach
}

/** A companion set back on its owner's perimeter, free to slide round it and never to leave it. */
function onOwner(work: readonly Work[], companion: Companion): void {
  const w = work[companion.body]
  const owner = work[companion.owner]
  if (!w || !owner || w.body.pinned) return
  const dx = w.x - owner.x
  const dy = w.y - owner.y
  const run = Math.hypot(dx, dy)
  const reach = restBetween(owner.body, w.body)
  if (run < 1e-9) {
    w.x = owner.x + reach
    return
  }
  w.x = owner.x + (dx / run) * reach
  w.y = owner.y + (dy / run) * reach
}

function pairKey(a: number, b: number): number {
  return a < b ? a * 100000 + b : b * 100000 + a
}

/**
 * The constraints projected straight onto the picture after the forces have moved it: every linked
 * pair pulled to touching, every overlap past the quarter pushed back, and then the walls in full —
 * the kerb the walled rooms stand on, the corridor's anchor, the companions on their owners'
 * perimeters, and the buildable line, which is never traded.
 */
function project(work: readonly Work[], state: SimulationState): void {
  const from = work.map((w) => ({ x: w.x, y: w.y }))
  const inside = state.ground.inside
  const holds = inside.sides.length >= 3
  const wants: Demand[] = work.map(() => ({ dx: 0, dy: 0, asked: 0 }))

  const ask = (i: number, j: number, closer: number, ux: number, uy: number): void => {
    const a = work[i]
    const b = work[j]
    const wantA = wants[i]
    const wantB = wants[j]
    if (!a || !b || !wantA || !wantB) return
    const share = shareOf(a.body, b.body)
    wantA.dx -= ux * closer * share
    wantA.dy -= uy * closer * share
    wantA.asked += 1
    wantB.dx += ux * closer * (1 - share)
    wantB.dy += uy * closer * (1 - share)
    wantB.asked += 1
  }

  /** What the pairs asked for, taken as a mean and short of the whole, and whether any asked. */
  const take = (): boolean => {
    let asked = false
    for (const [index, w] of work.entries()) {
      const want = wants[index]
      if (!want || w.body.pinned || want.asked === 0) continue
      asked = true
      w.x += (want.dx / want.asked) * RELAXATION
      w.y += (want.dy / want.asked) * RELAXATION
    }
    for (const want of wants) {
      want.dx = 0
      want.dy = 0
      want.asked = 0
    }
    return asked
  }

  for (let pass = 0; pass < PROJECTION_ROUNDS; pass++) {
    for (const link of state.links) {
      const a = work[link.a]
      const b = work[link.b]
      if (!a || !b || (a.body.pinned && b.body.pinned)) continue
      const gap = gapBetween(placedOf(a), placedOf(b), link.a + link.b)
      const rest = restBetween(a.body, b.body)
      // Only closing, and only a link that is really open: a pair the springs hold a hair's
      // breadth apart is touching, and pulling it closed every frame would leave the picture
      // shuffling for ever between the spring and the projection.
      if (gap.distance <= rest + TOUCHING) continue
      // Closed to the edge of that breadth rather than through it, so the springs have nothing to
      // push back out against and the pair settles instead of being closed again every frame.
      ask(link.a, link.b, rest + TOUCHING / 2 - gap.distance, gap.ux, gap.uy)
    }
    const pulled = take()
    // The overlap wall is stronger than the links, so it has the last word in every round: it is
    // answered after them, on the places their pull has just left the bubbles in, and one pair at
    // a time rather than as a mean, because a small room wedged between two large ones must come
    // out somewhere and a mean of two opposite demands would leave it where it is.
    let pushed = false
    for (let i = 0; i < work.length; i++) {
      const a = work[i]
      if (!a) continue
      for (let j = i + 1; j < work.length; j++) {
        const b = work[j]
        if (!b || (a.body.pinned && b.body.pinned)) continue
        if (!shareAStorey(a.body, b.body)) continue
        const gap = gapBetween(placedOf(a), placedOf(b), i + j)
        const overlap = closestBetween(a.body, b.body) - gap.distance
        if (overlap <= CLEARED) continue
        pushed = true
        const share = shareOf(a.body, b.body)
        a.x -= gap.ux * overlap * share
        a.y -= gap.uy * overlap * share
        b.x += gap.ux * overlap * (1 - share)
        b.y += gap.uy * overlap * (1 - share)
      }
    }
    for (const w of work) onKerb(w)
    for (const corridor of state.corridors) alongTheRooms(work, corridor, inside.middle)
    for (const companion of state.companions) onOwner(work, companion)
    if (holds)
      for (const w of work) {
        const [x, y] = holdInside(inside, placedOf(w), w.body.radius)
        w.x = x
        w.y = y
      }
    if (!pulled && !pushed) break
  }
  // A bubble the forces drove into its neighbour and the projection put back has not moved, so the
  // projection takes that speed off it: exactly the part of it that pressed against the wall and
  // nothing else. It never hands any back, or a bubble let go inside another would be thrown
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

/** Where the rooms of a kind stand on one floor, as one point, taken afresh every frame. */
function fieldFor(work: readonly Work[], storey: number, ground: Ground): ForceField {
  const known = new Map<string, Point | undefined>()
  return {
    sides: ground.sides,
    site: ground.site,
    where(kinds) {
      const key = kinds.join(',')
      if (known.has(key)) return known.get(key)
      let x = 0
      let y = 0
      let counted = 0
      for (const w of work) {
        if (!w.body.kind || !kinds.includes(w.body.kind)) continue
        if (!twinsOf(w.body).includes(storey)) continue
        x += w.x
        y += w.y
        counted += 1
      }
      const found: Point | undefined = counted === 0 ? undefined : [x / counted, y / counted]
      known.set(key, found)
      return found
    },
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
    angle: body.angle,
    vx: body.vx,
    vy: body.vy,
    fx: 0,
    fy: 0,
  }))
  const linked = new Set(state.links.map((link) => pairKey(link.a, link.b)))

  for (const link of state.links) {
    const a = work[link.a]
    const b = work[link.b]
    if (!a || !b) continue
    const gap = gapBetween(placedOf(a), placedOf(b), link.a + link.b)
    const pull = config.springStiffness * (gap.distance - restBetween(a.body, b.body))
    a.fx += pull * gap.ux
    a.fy += pull * gap.uy
    b.fx -= pull * gap.ux
    b.fy -= pull * gap.uy
  }

  for (let i = 0; i < count; i++) {
    const a = work[i]
    if (!a) continue
    for (let j = i + 1; j < count; j++) {
      const b = work[j]
      if (!b || !shareAStorey(a.body, b.body)) continue
      // A link says these two want to touch, so nothing pushes them apart but the overlap wall.
      if (linked.has(pairKey(i, j))) continue
      const clear = a.body.radius + b.body.radius + config.restGap
      const gap = gapBetween(placedOf(a), placedOf(b), i + j)
      const overlap = clear - gap.distance
      // A soft collision below contact, and a bounded inverse-square breeze above it that spreads
      // the cloud. The projection puts a deep overlap right in one frame, so the collision is only
      // asked for the last gap of it; unasked, it flings a bubble let go inside another off the sheet.
      // A breeze between neighbours, not between strangers across the sheet: it fades to nothing
      // a few times contact away, and it fades rather than stopping, because a pair crossing a
      // line where a push switched off would be handed a little energy on every crossing.
      const reach = Math.max(0, 1 - gap.distance / (clear * BREEZE_REACH))
      const push =
        (overlap > 0 ? config.repulsion * Math.min(overlap, config.restGap) : 0) +
        (config.spread * clear * clear * reach * reach) / Math.max(gap.distance, clear) ** 2
      a.fx -= push * gap.ux
      a.fy -= push * gap.uy
      b.fx += push * gap.ux
      b.fy += push * gap.uy
    }
  }

  // The rulebook's rows, each on the rooms its own table names. A row is a preference, not a weight
  // of stone, so it is scaled by the body's mass: every room answers a pull at the same rate,
  // whatever its area, and a large room is not left behind by a small one.
  const fields = new Map<number, ForceField>()
  for (const w of work) {
    if (w.body.pinned || !w.body.kind) continue
    const room: ForceRoom = {
      kind: w.body.kind,
      ...(w.body.tier === undefined ? {} : { tier: w.body.tier }),
    }
    let field = fields.get(w.body.storey)
    if (!field) {
      field = fieldFor(work, w.body.storey, state.ground)
      fields.set(w.body.storey, field)
    }
    for (const force of forces) {
      if (!force.acts(room)) continue
      const [ux, uy] = force.pull(room, [w.x, w.y], field)
      if (ux === 0 && uy === 0) continue
      const size =
        config.pull * force.strength * weightOf(config.weights, force.family) * massOf(w.body)
      w.fx += ux * size
      w.fy += uy * size
    }
  }

  const interval = config.timeStep
  const middle = state.ground.inside.middle
  for (const w of work) {
    if (w.body.pinned) continue
    const mass = massOf(w.body)
    // The cloud is held on the middle of the floor it is being laid out on, not on the sheet's,
    // and by its mass like the rows, so a large room is drawn in at the same rate as a small one.
    w.fx += config.centrePull * (middle[0] - w.x) * mass
    w.fy += config.centrePull * (middle[1] - w.y) * mass
    w.vx = (w.vx + (w.fx / mass) * interval) * config.damping
    w.vy = (w.vy + (w.fy / mass) * interval) * config.damping
  }

  for (const w of work) {
    if (w.body.pinned) continue
    w.x += w.vx * interval
    w.y += w.vy * interval
  }

  project(work, state)

  // What a bubble did is where it ended up: one held still between its neighbours has speed and
  // goes nowhere, and the picture is at rest when nothing goes anywhere.
  let energy = 0
  for (const w of work) {
    const dx = (w.x - w.body.x) / interval
    const dy = (w.y - w.body.y) / interval
    energy += 0.5 * massOf(w.body) * (dx * dx + dy * dy)
  }

  // A pinned body is the person's hand or their hold, and no force moves it; a wall still does,
  // so what is written back is whatever the projection left, and a body it never touched is
  // handed back as it came.
  const bodies = work.map((w) =>
    w.x === w.body.x && w.y === w.body.y && w.angle === w.body.angle && w.body.pinned
      ? w.body
      : { ...w.body, x: w.x, y: w.y, angle: w.angle, vx: w.vx, vy: w.vy },
  )
  return { ...state, bodies, energy: energy / count }
}

export function settle(state: SimulationState, config: LayoutConfig = defaultLayout): Settlement {
  let current = state
  const watch = restWatch()
  for (let i = 1; i <= config.maxIterations; i++) {
    current = step(current, config)
    if (watch.read(current.energy, config.energyThreshold))
      return { state: current, iterations: i, settled: true }
  }
  return { state: current, iterations: config.maxIterations, settled: false }
}
