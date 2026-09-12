import { boundingBox, type Point } from '../geometry'
import type { Family, Weights } from '../model'
import {
  BAND_RADII,
  bandFor,
  companionOwners,
  forces,
  kerbFor,
  type ForceField,
  type ForceRoom,
} from '../rulebook'
import {
  CORRIDOR_R,
  corridorHalf,
  endsOf,
  gapBetween,
  nearestOnSegment,
  type Placed,
} from './capsule'
import { frontageOf, kerbWithin, type Stretch } from './frontage'
import { canonicalStart } from './start'
import { alongTheLine, CLEARED, holdInside, putInside, type Buildable, type Ground } from './ground'

export type Position = { readonly x: number; readonly y: number }

/** Where a tandem bay stands: the bay it is behind, and how far in behind it that puts it. */
export type Tandem = { readonly behind: number; readonly by: Point }

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
  /** Air added to a link's rest length; nought, except for the second a Spread blows. */
  readonly linkAir: number
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
  linkAir: 0,
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

/**
 * How long a Spread holds before the cloud is let settle again, in seconds of simulation time.
 * Three, because the rows of the rulebook gather a villa's rooms back as fast as a breeze opens
 * them, and a gesture nobody sees is a gesture nobody believes.
 */
export const SPREAD_SECONDS = 3

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
    spread: base.spread * 6,
    restGap: base.restGap * 3,
    // The air a linked pair keeps goes with it, or a cloud held together by its links could not
    // open at all: a link rests at touching, and nothing but this ever lets it stretch.
    linkAir: base.restGap * 3,
    // The gather onto the middle of the floor and the rulebook's own rows are what a breeze has to
    // open the cloud against, so both are let go for the second it blows and taken up again after.
    centrePull: base.centrePull / 5,
    pull: 0,
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
  /** The street a room is held in a band of, and how far from it its middle may ever stand. */
  readonly band?: readonly [Point, Point]
  readonly bandReach?: number
  /** A bay the frontage would not hold, and where behind the bay in front of it it stands. */
  readonly tandem?: Tandem
  /** A body a wall places outright — a corridor on its anchor, a bay in tandem — not the pairs'. */
  readonly anchored?: true
  /** The room whose perimeter this one rides, where it is that room's companion. */
  readonly rides?: number
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

/**
 * The kerb line a walled kind stands against: its own boundary, moved in by the bubble's radius,
 * and cut to the stretch of the frontage the room claimed. The bubble stands against the kerb and
 * not astride it, and inside its own claim and not along the whole street.
 */
function kerbLineFor(
  kind: string | undefined,
  radius: number,
  ground: Ground,
  claim: Stretch | undefined,
): readonly [Point, Point] | undefined {
  const side = kind === undefined ? undefined : kerbFor(kind, ground.sides)
  if (!side) return undefined
  return kerbWithin(side, radius, side === ground.sides.service ? claim : undefined)
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
  const frontage = frontageOf(
    rooms.map((room) => ({
      id: room.id,
      storey: room.storey,
      targetArea: room.targetArea,
      ...(room.kind === undefined ? {} : { kind: room.kind }),
      ...(room.bubble === undefined ? {} : { at: room.bubble }),
    })),
    ground,
  )
  const bodies: Body[] = rooms.map((room) => {
    const corridor = room.kind === 'hallway'
    const radius = corridor ? CORRIDOR_R : radiusOf(room.targetArea)
    const opening = room.bubble ?? opened.get(room.id) ?? middle
    const kerb = corridor
      ? undefined
      : kerbLineFor(room.kind, radius, ground, frontage.claims.get(room.id))
    const band = room.kind === undefined ? undefined : bandFor(room.kind, ground.sides)
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
      ...(band === undefined
        ? {}
        : { band: [band.from, band.to] as const, bandReach: radius * BAND_RADII }),
    }
  })
  // A bay the frontage would not hold stands in tandem behind the bay in front of it: one
  // bay-depth further in, on the same stretch of street. It is not a kerb room then; where it
  // stands is the bay in front's to say, the way a corridor's near end is its anchor's.
  const inward = ground.sides.service?.inward
  const tandem = new Map<number, Tandem>()
  for (const [index, body] of bodies.entries()) {
    const ahead = frontage.behind.get(body.id)
    const front = ahead === undefined ? undefined : bodies.findIndex((each) => each.id === ahead)
    if (front === undefined || front < 0 || !inward) continue
    tandem.set(index, {
      behind: front,
      by: [inward[0] * 2 * body.radius, inward[1] * 2 * body.radius],
    })
  }
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
  // Which way a corridor lies is not stored: it is read off where the room it starts from and the
  // rooms it serves are standing, so a picture drawn from the store lies the way it settled.
  const turned = turnedFrom(bodies, corridors, ground.inside)
  const companions = companionsIn(rooms, edges, at)
  const rides = new Map(companions.map((companion) => [companion.body, companion.owner]))
  return {
    bodies: turned.map((body, index) => ({
      ...body,
      ...(anchored.has(index) || tandem.has(index) ? { anchored: true as const } : {}),
      ...(rides.has(index) ? { rides: rides.get(index) as number } : {}),
      ...(tandem.has(index) ? { tandem: tandem.get(index) as Tandem } : {}),
      ...(tandem.has(index) ? { kerb: undefined } : {}),
    })),
    links,
    corridors,
    companions,
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

/** Every corridor set down by the one rule, from where the bodies are standing now. */
function turnedFrom(
  bodies: readonly Body[],
  corridors: readonly Corridor[],
  inside: Buildable,
): readonly Body[] {
  const lies = new Map<number, { readonly x: number; readonly y: number; readonly angle: number }>()
  for (const corridor of corridors) {
    const body = bodies[corridor.body]
    if (!body) continue
    const anchor = corridor.anchor === undefined ? undefined : bodies[corridor.anchor]
    lies.set(
      corridor.body,
      corridorLies(
        body,
        anchor ? { x: anchor.x, y: anchor.y, radius: anchor.radius } : undefined,
        aimOf(bodies, corridor.served, inside.middle),
        inside,
      ),
    )
  }
  return bodies.map((body, index) => {
    const lie = lies.get(index)
    return lie === undefined ? body : { ...body, ...lie }
  })
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

/**
 * How much of a correction the first body takes. A body that goes nowhere at a pair's asking takes
 * none of it and the other takes the whole — the person's hand holds a bubble outright, and so does
 * a corridor's anchor — and where both may move the smaller moves further, as the lighter thing
 * does. A body a wall leaves one line to move along is not held outright: it takes its share along
 * that line, and the room left lying in it is walked out by the correction when the picture rests,
 * which is a move no projection could make.
 */
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
  // A claim no wider than the room itself leaves one place to stand, and the room stands in it.
  if (run < 1e-12) {
    w.x = from[0]
    w.y = from[1]
    return
  }
  const along = Math.min(1, Math.max(0, ((w.x - from[0]) * dx + (w.y - from[1]) * dy) / run))
  w.x = from[0] + dx * along
  w.y = from[1] + dy * along
}

/** A bay in tandem set down behind the bay in front of it: one bay-depth in, on its stretch. */
function inTandem(work: readonly Work[], w: Work): void {
  const tandem = w.body.tandem
  const front = tandem === undefined ? undefined : work[tandem.behind]
  if (!tandem || !front) return
  w.x = front.x + tandem.by[0]
  w.y = front.y + tandem.by[1]
}

/**
 * A room the band holds set back inside it. The owner's ruling on S1 is a wall, not only a pull: a
 * diwaniya may stand at most one room's depth back from its street, so where the frame has left it
 * further off than that it comes straight back to the edge of the band. Held every round, which is
 * how a wall is held, and never traded. It is a bound on depth and nothing else: a room inside the
 * band may still have the garage between it and the kerb, which is a frontage the plot has not got
 * rather than a depth the ruling forbids.
 */
function inTheBand(w: Work): void {
  const band = w.body.band
  const reach = w.body.bandReach
  if (!band || reach === undefined) return
  const on = nearestOnSegment(band[0], band[1], w.x, w.y)
  const dx = w.x - on[0]
  const dy = w.y - on[1]
  const away = Math.hypot(dx, dy)
  if (away <= reach || away < 1e-9) return
  w.x = on[0] + (dx / away) * reach
  w.y = on[1] + (dy / away) * reach
}

/**
 * Where a corridor lies: its near end on the room it starts from, touching it, and its length
 * along the rooms it serves. The near end is a wall, not a pull — it sits on the anchor by
 * construction and the rooms round it make way — so where the way it wants to lie would take an
 * end off the floor, it is turned, a step at a time either way, until it lies along ground it has.
 * This is the one rule: the picture drawn from the store and the picture the forces run both
 * read it, so a corridor is never drawn lying one way and settled lying another.
 */
export function corridorLies(
  body: {
    readonly x: number
    readonly y: number
    readonly angle: number
    readonly radius: number
    readonly half: number
  },
  anchor: { readonly x: number; readonly y: number; readonly radius: number } | undefined,
  aim: Point,
  inside: Buildable,
): { readonly x: number; readonly y: number; readonly angle: number } {
  const from: Point = anchor ? [anchor.x, anchor.y] : [body.x, body.y]
  const ux = aim[0] - from[0]
  const uy = aim[1] - from[1]
  const run = Math.hypot(ux, uy)
  if (run < 1e-9) return { x: body.x, y: body.y, angle: body.angle }
  const wanted = Math.atan2(uy, ux)
  if (!anchor) return { x: body.x, y: body.y, angle: wanted }
  const reach = restBetween(anchor, body) + body.half
  const lying = (angle: number) => ({
    x: from[0] + Math.cos(angle) * reach,
    y: from[1] + Math.sin(angle) * reach,
    angle,
  })
  const fits = (at: { readonly x: number; readonly y: number; readonly angle: number }): boolean =>
    endsOf({ x: at.x, y: at.y, angle: at.angle, half: body.half }).every((end) => {
      const put = putInside(inside, end, body.radius)
      return Math.hypot(put[0] - end[0], put[1] - end[1]) < 1e-6
    })
  const straight = lying(wanted)
  if (inside.sides.length < 3 || fits(straight)) return straight
  for (let turn = 1; turn <= TURNS; turn++)
    for (const way of [1, -1]) {
      const tried = lying(wanted + way * turn * A_TURN)
      if (fits(tried)) return tried
    }
  return straight
}

/** Where the rooms a corridor serves stand, as one point; the middle of the floor when it has none. */
function aimOf(
  places: readonly { readonly x: number; readonly y: number }[],
  served: readonly number[],
  middle: Point,
): Point {
  let x = 0
  let y = 0
  let counted = 0
  for (const other of served) {
    const at = places[other]
    if (!at) continue
    x += at.x
    y += at.y
    counted += 1
  }
  return counted === 0 ? middle : [x / counted, y / counted]
}

/** The corridor set down where `corridorLies` says, on the places the frame has reached so far. */
function alongTheRooms(work: readonly Work[], corridor: Corridor, inside: Buildable): void {
  const w = work[corridor.body]
  if (!w) return
  const anchor = corridor.anchor === undefined ? undefined : work[corridor.anchor]
  const lie = corridorLies(
    { x: w.x, y: w.y, angle: w.angle, radius: w.body.radius, half: w.body.half },
    anchor ? { x: anchor.x, y: anchor.y, radius: anchor.body.radius } : undefined,
    aimOf(work, corridor.served, inside.middle),
    inside,
  )
  w.x = lie.x
  w.y = lie.y
  w.angle = lie.angle
}

/** A step of the turn a corridor takes when the line will not have it lying the way it wants. */
const A_TURN = Math.PI / 12

/** Half a turn each way: every way round a corridor could be asked to lie instead. */
const TURNS = 12

/**
 * A companion set back on its owner's perimeter, free to slide round it and never to leave it. It
 * is set down on the nearest part of that perimeter the buildable line will have, so a WC on the
 * street side of a diwaniya standing on the kerb comes round rather than hanging over the line.
 */
function onOwner(
  work: readonly Work[],
  companion: Companion,
  inside: Buildable,
  holds: boolean,
): void {
  const w = work[companion.body]
  const owner = work[companion.owner]
  if (!w || !owner || w.body.pinned) return
  const reach = restBetween(owner.body, w.body)
  const dx = w.x - owner.x
  const dy = w.y - owner.y
  const run = Math.hypot(dx, dy)
  const was = run < 1e-9 ? 0 : Math.atan2(dy, dx)
  const at = (angle: number): Point => [
    owner.x + Math.cos(angle) * reach,
    owner.y + Math.sin(angle) * reach,
  ]
  const put = (angle: number): void => {
    const [x, y] = at(angle)
    w.x = x
    w.y = y
  }
  if (!holds) {
    put(was)
    return
  }
  /** Whether the perimeter is free here: inside the line, and clear of the rooms already there. */
  const free = (angle: number): boolean => {
    const [x, y] = at(angle)
    const inLine = putInside(inside, [x, y], w.body.radius)
    if (Math.hypot(inLine[0] - x, inLine[1] - y) > 1e-6) return false
    const put: Placed = { x, y, angle: 0, half: 0 }
    return !work.some((other, index) => {
      if (other === w || other === owner || !shareAStorey(other.body, w.body)) return false
      const closest = closestBetween(other.body, w.body)
      // A disc is measured from its middle; only a corridor needs its whole segment looked at.
      if (other.body.half === 0) return Math.hypot(other.x - x, other.y - y) < closest
      return gapBetween(placedOf(other), put, index).distance < closest
    })
  }
  // The nearest free part of the owner's perimeter, so a companion slides round rather than
  // hanging over the line or standing in another room — and a corridor counts among the rooms in
  // the way, which is what takes a WC out from behind the cluster at the entry. Where none of the
  // perimeter is free it keeps its place, and the overlap wall has its say instead.
  for (let turn = 0; turn <= TURNS; turn++)
    for (const way of turn === 0 ? [1] : [1, -1]) {
      const angle = was + way * turn * A_TURN
      if (turn === TURNS || free(angle)) {
        put(turn === TURNS ? was : angle)
        return
      }
    }
}

/** A move with the part of it that runs across a line taken out, leaving what runs along it. */
function along(by: Point, ux: number, uy: number): Point {
  const on = by[0] * ux + by[1] * uy
  return [ux * on, uy * on]
}

/**
 * The one line a wall leaves a body free to move along, where it leaves it only one: the kerb a
 * walled room stands on, or the tangent of the perimeter a companion rides. A body no such wall
 * holds is free of the plane and has no line.
 */
function lineOf(w: Work, work: readonly Work[]): Point | undefined {
  const kerb = w.body.kerb
  if (kerb) {
    const run = Math.hypot(kerb[1][0] - kerb[0][0], kerb[1][1] - kerb[0][1])
    if (run > 1e-9) return [(kerb[1][0] - kerb[0][0]) / run, (kerb[1][1] - kerb[0][1]) / run]
  }
  const owner = w.body.rides === undefined ? undefined : work[w.body.rides]
  if (owner) {
    const away = Math.hypot(w.x - owner.x, w.y - owner.y)
    if (away > 1e-9) return [-(w.y - owner.y) / away, (w.x - owner.x) / away]
  }
  return undefined
}

/**
 * What a bubble really does when a pair asks it to move: the part of its wall leaves it free to
 * do. A room on a kerb moves along the kerb, a companion round its owner, and anything standing
 * against the buildable line along the line — so a push that a wall would undo is never taken.
 */
function move(w: Work, by: Point, work: readonly Work[], inside: Buildable, holds: boolean): Point {
  if (by[0] === 0 && by[1] === 0) return by
  const line = lineOf(w, work)
  const wanted = line ? along(by, line[0], line[1]) : by
  return holds ? alongTheLine(inside, [w.x, w.y], w.body.radius, wanted) : wanted
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
function project(work: readonly Work[], state: SimulationState, air: number): void {
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
  const take = (all: readonly Work[], line: Buildable, holds: boolean): boolean => {
    let asked = false
    for (const [index, w] of work.entries()) {
      const want = wants[index]
      if (!want || fixed(w.body) || want.asked === 0) continue
      asked = true
      const by = move(
        w,
        [(want.dx / want.asked) * RELAXATION, (want.dy / want.asked) * RELAXATION],
        all,
        line,
        holds,
      )
      w.x += by[0]
      w.y += by[1]
    }
    for (const want of wants) {
      want.dx = 0
      want.dy = 0
      want.asked = 0
    }
    return asked
  }

  /** Every overlapping pair pushed apart, one pair at a time; whether any of them was. */
  const part = (all: readonly Work[], line: Buildable, held: boolean): boolean => {
    let pushed = false
    for (let i = 0; i < all.length; i++) {
      const a = all[i]
      if (!a) continue
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]
        if (!b || (fixed(a.body) && fixed(b.body))) continue
        if (!shareAStorey(a.body, b.body)) continue
        const gap = gapBetween(placedOf(a), placedOf(b), i + j)
        const overlap = closestBetween(a.body, b.body) - gap.distance
        if (overlap <= CLEARED) continue
        pushed = true
        const share = shareOf(a.body, b.body)
        const away = move(
          a,
          [-gap.ux * overlap * share, -gap.uy * overlap * share],
          all,
          line,
          held,
        )
        const toward = move(
          b,
          [gap.ux * overlap * (1 - share), gap.uy * overlap * (1 - share)],
          all,
          line,
          held,
        )
        a.x += away[0]
        a.y += away[1]
        b.x += toward[0]
        b.y += toward[1]
      }
    }
    return pushed
  }

  for (let pass = 0; pass < PROJECTION_ROUNDS; pass++) {
    // The walls in full first — the kerb the walled rooms stand on, the corridor's anchor, the
    // companions on their owners' perimeters and the buildable line — and the pairs after them,
    // so what a round leaves is a picture with no overlap past the quarter the model allows. The
    // pairs can never undo a wall, because a bubble a wall holds moves only the way it lets it.
    for (const w of work) onKerb(w)
    for (const w of work) inTandem(work, w)
    for (const w of work) inTheBand(w)
    for (const corridor of state.corridors) alongTheRooms(work, corridor, inside)
    if (holds)
      for (const w of work) {
        const held = holdInside(inside, placedOf(w), w.body.radius)
        w.x = held.at[0]
        w.y = held.at[1]
        w.angle = held.angle
      }

    for (const link of state.links) {
      const a = work[link.a]
      const b = work[link.b]
      if (!a || !b || (fixed(a.body) && fixed(b.body))) continue
      const gap = gapBetween(placedOf(a), placedOf(b), link.a + link.b)
      const rest = restBetween(a.body, b.body) + air
      // Only closing, and only a link that is really open: a pair the springs hold a hair's
      // breadth apart is touching, and pulling it closed every frame would leave the picture
      // shuffling for ever between the spring and the projection.
      if (gap.distance <= rest + TOUCHING) continue
      ask(link.a, link.b, rest + TOUCHING / 2 - gap.distance, gap.ux, gap.uy)
    }
    const pulled = take(work, inside, holds)
    // The companions after the links: an auxiliary room rides its owner's perimeter and has the
    // whole of it to choose from, so it is the one to give way to a room that has only this one
    // wall to reach its neighbour by.
    for (const companion of state.companions) onOwner(work, companion, inside, holds)
    // The overlap wall is stronger than the links, so it has the last word in every round: it is
    // answered after them, on the places their pull has just left the bubbles in, and one pair at
    // a time rather than as a mean, because a small room wedged between two large ones must come
    // out somewhere and a mean of two opposite demands would leave it where it is.
    const pushed = part(work, inside, holds)
    if (!pulled && !pushed) break
  }
  // The two walls that are never traded have the last word, whatever the pairs have just asked.
  // The buildable line holds every bubble inside it; and a corridor's near end sits on the room it
  // starts from by construction, so it is set back there — turned, if need be, to lie on ground the
  // line has — and the rooms round it make way.
  if (holds)
    for (const w of work) {
      const held = holdInside(inside, placedOf(w), w.body.radius)
      w.x = held.at[0]
      w.y = held.at[1]
      w.angle = held.angle
    }
  for (const w of work) onKerb(w)
  for (const w of work) inTandem(work, w)
  for (const w of work) inTheBand(w)
  for (const corridor of state.corridors) alongTheRooms(work, corridor, inside)
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
    const pull =
      config.springStiffness * (gap.distance - restBetween(a.body, b.body) - config.linkAir)
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

  project(work, state, config.linkAir)

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
