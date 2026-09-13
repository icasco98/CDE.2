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
import { CORRIDOR_R, corridorHalf, gapBetween, nearestOnSegment, type Placed } from './capsule'
import { frontageOf, kerbWithin, type Stretch } from './frontage'
import { canonicalStart } from './start'
import { alongTheLine, CLEARED, holdInside, putInside, type Buildable, type Ground } from './ground'

/*
 * The settle (Z7). A picture is not a spring-mass system any more: a round is one ranked pass in
 * which everything the model asks for is answered in order of how strictly it asks. The pulls of
 * the rulebook's rows go first and softest, each a step of fixed length that fades to nothing over
 * the run; the overlap wall and the links are projected next, an overlap pushed back past the
 * quarter and a link pulled to touching, a link across the corridor taking the freer room to the
 * other side; and the walls go last and in full — a companion on its owner, a bay in tandem, the
 * diwaniya in its band, a walled room on its kerb, the corridor on its anchor along its own stored
 * lie, and every bubble inside the buildable line — so a pull never undoes a link and a link never
 * crosses a wall. A settle is a fixed number of rounds, the same every time, and the hand bounds
 * one: a settle after a drag moves only the rooms the drag touched and the rooms linked to them,
 * and none of them further than the drag itself went.
 */

/** Where a bubble stands, in plot metres, and for a corridor the way it lies. */
export type Position = { readonly x: number; readonly y: number; readonly angle?: number }

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
  /** How far a row of full strength at full weight moves a room in one round, in metres. */
  readonly pull: number
  /** The air two bubbles with nothing between them keep, in metres; a linked pair keeps none. */
  readonly air: number
  /** Air added to a link's rest, in metres: nought, except for the rounds a Spread blows. */
  readonly linkAir: number
  /** The rounds a settle takes: the pulls fade over them, and the last of them hold only the walls. */
  readonly rounds: number
  /** The person's weight on each family of forces; a family it does not name counts as a half. */
  readonly weights: Weights
}

export const defaultLayout: LayoutConfig = {
  /** A strong row at full weight walks a room a villa's depth over a run, and no further. */
  pull: 0.25,
  /** Half a metre: enough to read two rooms apart, and not the wall between them. */
  air: 0.5,
  linkAir: 0,
  /** Ninety rounds: a second and a half of frames, which is how long a settle is watched for. */
  rounds: 90,
  weights: {},
}

/** How much of the air two strangers keep is taken up in one round: a nudge, never a shove. */
const AIR_GIVE = 0.3

/** The rounds a Spread blows for before the cloud is let settle again. */
export const SPREAD_ROUNDS = 30

/** The rounds a picture is asked to hold still for, with the pulls off, to be called at rest. */
export const STILL_FRAMES = 3

/** A weight nobody has set sits in the middle, so an untouched project pulls no way in particular. */
const MIDDLE_WEIGHT = 0.5

export function weightOf(weights: Weights, family: Family): number {
  const set = weights[family]
  return typeof set === 'number' && Number.isFinite(set)
    ? Math.min(1, Math.max(0, set))
    : MIDDLE_WEIGHT
}

/** The weights on the settle: each family's weight multiplies the strength of its own rows. */
export function layoutFor(weights: Weights): LayoutConfig {
  return { ...defaultLayout, weights }
}

/**
 * Spread is the same layout with the air two bubbles keep opened wide, the links let out by as
 * much, and the rows let go, so a cloud packed rim to rim opens out before it is let settle again.
 */
export function spreadLayout(base: LayoutConfig): LayoutConfig {
  return { ...base, air: base.air * 12, linkAir: base.air * 6, pull: 0 }
}

export type Body = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly radius: number
  /** How far the body's segment reaches from its middle: nought for a disc, a length for a corridor. */
  readonly half: number
  /** The way that segment lies, in radians: a corridor's own, stored on its bubble and kept. */
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

/** A corridor, the room it starts from, and the rooms it turns toward when it has no lie yet. */
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
  /** How many rounds the picture has taken since it was last woken; the pulls fade over them. */
  readonly round: number
  /** How much the picture moved in the last round, as a mean square of metres per room. */
  readonly energy: number
}

export type Settlement = {
  readonly state: SimulationState
  readonly iterations: number
  readonly settled: boolean
}

/**
 * What the hand allows a settle: the bubble it moved, how far it moved it, and where everything
 * stood when the drag began. Only that bubble, the rooms linked to it, their companions and the
 * rooms it has come to lie over may move, and none of them further than the drag itself went.
 */
export type Bound = {
  readonly id: string
  readonly moved: number
  readonly from: readonly Position[]
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
      radius,
      half: corridor ? corridorHalf(room.targetArea) : 0,
      angle: room.bubble?.angle ?? Number.NaN,
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
  const companions = companionsIn(rooms, edges, at)
  const rides = new Map(companions.map((companion) => [companion.body, companion.owner]))
  // A corridor with no lie stored yet is given one, once: in from the street on the ground, and
  // toward the rooms it serves on a floor above, on one of the plot's two ways. From then on it
  // is the bubble's own, turned by the hand or by the line and by nothing else.
  const lying = bodies.map((body, index) => {
    const angle = Number.isNaN(body.angle)
      ? body.half > 0
        ? firstLie(
            bodies,
            corridors.find((corridor) => corridor.body === index),
            ground,
          )
        : 0
      : body.angle
    return { ...body, angle }
  })
  return {
    bodies: lying.map((body, index) => ({
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
    round: 0,
    energy: Infinity,
  }
}

/** The two ways the plot runs: along its service street and in from it, or the sheet's own. */
function waysOf(ground: Ground): readonly Point[] {
  const street = ground.sides.service
  const along: Point = street
    ? [
        (street.to[0] - street.from[0]) / Math.max(street.length, 1e-9),
        (street.to[1] - street.from[1]) / Math.max(street.length, 1e-9),
      ]
    : [1, 0]
  return [along, [-along[0], -along[1]], [-along[1], along[0]], [along[1], -along[0]]]
}

/** The way of the plot nearest a direction, as an angle: what a corridor's lie is turned onto. */
export function squaredLie(ground: Ground, angle: number): number {
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  let best = angle
  let closest = -Infinity
  for (const way of waysOf(ground)) {
    const with_ = ux * way[0] + uy * way[1]
    if (with_ <= closest) continue
    closest = with_
    best = Math.atan2(way[1], way[0])
  }
  return best
}

/**
 * The lie a corridor is first given: in from the service street where it starts from the entry,
 * and otherwise toward the rooms it serves, turned onto the nearer of the plot's two ways.
 */
function firstLie(bodies: readonly Body[], corridor: Corridor | undefined, ground: Ground): number {
  const street = ground.sides.service
  const anchor = corridor?.anchor === undefined ? undefined : bodies[corridor.anchor]
  if (street && anchor?.kind === 'entry-foyer')
    return Math.atan2(street.inward[1], street.inward[0])
  const body = corridor ? bodies[corridor.body] : undefined
  const from: Point = anchor ? [anchor.x, anchor.y] : body ? [body.x, body.y] : [0, 0]
  const aim = aimOf(bodies, corridor?.served ?? [], ground.inside.middle)
  const dx = aim[0] - from[0]
  const dy = aim[1] - from[1]
  if (Math.hypot(dx, dy) < 1e-9)
    return street ? Math.atan2(street.inward[1], street.inward[0]) : Math.PI / 2
  return squaredLie(ground, Math.atan2(dy, dx))
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

type Work = {
  readonly body: Body
  x: number
  y: number
  angle: number
  /** Whether the round may move this body at all: the hand and the bound both say no. */
  held: boolean
}

/** The share of a correction is by area, and π cancels in the ratio, so the radius squared stands for it. */
function areaOf(body: Body): number {
  return body.radius * body.radius
}

/** Whether a body goes nowhere at a pair's asking: the hand, the bound, or a corridor's own anchor. */
function fixed(w: Work): boolean {
  return w.held || w.body.anchored === true
}

/**
 * How much of a correction the first body takes. A body that goes nowhere at a pair's asking takes
 * none of it and the other takes the whole, and where both may move the smaller moves further, as
 * the lighter thing does. A body a wall leaves one line to move along is not held outright: it
 * takes its share along that line.
 */
function shareOf(a: Work, b: Work): number {
  if (fixed(a)) return 0
  if (fixed(b)) return 1
  return areaOf(b.body) / (areaOf(a.body) + areaOf(b.body))
}

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
 * further off than that it comes straight back to the edge of the band. It is a bound on depth and
 * nothing else: a room inside the band may still have the garage between it and the kerb, which is
 * a frontage the plot has not got rather than a depth the ruling forbids.
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
 * The corridor set down on the room it starts from, along its own lie: its near end touching the
 * anchor, its length the way its stored angle says. The near end is a wall, not a pull, and the
 * lie is the bubble's own; only the buildable line may turn it, when the way it lies would take
 * an end off the floor, and the turn it takes is then its lie from that round on.
 */
function onAnchor(work: readonly Work[], corridor: Corridor, inside: Buildable): void {
  const w = work[corridor.body]
  if (!w) return
  const anchor = corridor.anchor === undefined ? undefined : work[corridor.anchor]
  const lieOn = (): void => {
    if (!anchor) return
    const reach = restBetween(anchor.body, w.body) + w.body.half
    w.x = anchor.x + Math.cos(w.angle) * reach
    w.y = anchor.y + Math.sin(w.angle) * reach
  }
  lieOn()
  if (inside.sides.length < 3) return
  const held = holdInside(inside, placedOf(w), w.body.radius)
  if (held.angle !== w.angle) {
    // Turned: back onto the anchor along the new lie, which the line has already said fits.
    w.angle = held.angle
    lieOn()
    if (anchor) return
  }
  w.x = held.at[0]
  w.y = held.at[1]
}

/** A step of the turn a companion takes round its owner looking for a free part of the perimeter. */
const A_TURN = Math.PI / 12

/** Half a turn each way: every way round a companion could be asked to stand instead. */
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
  // the way. Where none of the perimeter is free it keeps its place, and the overlap wall has its
  // say instead.
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
 * What a bubble really does when asked to move: the part of it its wall leaves it free to do. A
 * room on a kerb moves along the kerb, a companion round its owner, and anything standing against
 * the buildable line along the line — so a push that a wall would undo is never taken.
 */
function move(w: Work, by: Point, work: readonly Work[], inside: Buildable, holds: boolean): Point {
  if (by[0] === 0 && by[1] === 0) return by
  const line = lineOf(w, work)
  const wanted = line ? along(by, line[0], line[1]) : by
  return holds ? alongTheLine(inside, [w.x, w.y], w.body.radius, wanted) : wanted
}

/**
 * A pair moved apart or together by a whole correction: each takes its share, and what one of
 * them cannot take — held by a wall or by the line it stands against — the other takes instead,
 * so the pair is answered in full whenever either of them can answer it at all. A body the hand
 * holds takes nothing at all. A corridor on its anchor or a bay in tandem takes the shortfall for
 * the pass only: its wall sets it back at the end of the round, and the rooms beside it have by
 * then made way for where it stood, which is how a pair with one of them in it comes to rest.
 */
function moveApart(
  a: Work,
  b: Work,
  ux: number,
  uy: number,
  by: number,
  work: readonly Work[],
  inside: Buildable,
  holds: boolean,
): void {
  const share = shareOf(a, b)
  const still: Point = [0, 0]
  const first = a.held ? still : move(a, [-ux * by * share, -uy * by * share], work, inside, holds)
  const tookA = -(first[0] * ux + first[1] * uy)
  const second = b.held
    ? still
    : move(b, [ux * (by - tookA), uy * (by - tookA)], work, inside, holds)
  const tookB = second[0] * ux + second[1] * uy
  const left = by - tookA - tookB
  const more =
    left > 1e-9 && !a.held ? move(a, [-ux * left, -uy * left], work, inside, holds) : still
  a.x += first[0] + more[0]
  a.y += first[1] + more[1]
  b.x += second[0]
  b.y += second[1]
}

function pairKey(a: number, b: number): number {
  return a < b ? a * 100000 + b : b * 100000 + a
}

/** Which side of a corridor's line a point falls on; nought inside the corridor's own width. */
function sideOf(corridor: Work, x: number, y: number): number {
  const ux = Math.cos(corridor.angle)
  const uy = Math.sin(corridor.angle)
  const across = (x - corridor.x) * uy - (y - corridor.y) * ux
  return Math.abs(across) < corridor.body.radius ? 0 : Math.sign(across)
}

/** The corridor standing between two bodies on their own floor, where one does. */
function corridorBetween(
  work: readonly Work[],
  corridors: readonly Corridor[],
  a: Work,
  b: Work,
): Work | undefined {
  for (const corridor of corridors) {
    const body = work[corridor.body]
    if (!body || body === a || body === b || !shareAStorey(body.body, a.body)) continue
    const near = nearestOnSegment([a.x, a.y], [b.x, b.y], body.x, body.y)
    if (Math.hypot(near[0] - body.x, near[1] - body.y) > body.body.radius + body.body.half) continue
    if (sideOf(body, a.x, a.y) * sideOf(body, b.x, b.y) < 0) return body
  }
  return undefined
}

/** A point mirrored across a corridor's line, which is the crossing a link across it asks for. */
function acrossCorridor(corridor: Work, x: number, y: number): Point {
  const ux = Math.cos(corridor.angle)
  const uy = Math.sin(corridor.angle)
  const across = (x - corridor.x) * uy - (y - corridor.y) * ux
  return [x - 2 * across * uy, y + 2 * across * ux]
}

/** Whether a body may be taken across the corridor: not held, not walled, not a corridor. */
function crossable(w: Work): boolean {
  return (
    !fixed(w) && !w.body.kerb && !w.body.tandem && w.body.half === 0 && w.body.rides === undefined
  )
}

/** Where the rooms of a kind stand on one floor, as one point, taken afresh every round. */
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
 * The bodies a bound lets move: the bubble the hand moved, the rooms linked to it, the companions
 * of all of those, and the rooms any of them lie over, which is what a bubble dragged through the
 * cloud parts. Everything else is held for the settle.
 */
function freedBy(state: SimulationState, bound: Bound): ReadonlySet<number> {
  const held = state.bodies.findIndex((body) => body.id === bound.id)
  const free = new Set<number>()
  if (held < 0) return free
  free.add(held)
  for (const link of state.links) {
    if (link.a === held) free.add(link.b)
    if (link.b === held) free.add(link.a)
  }
  for (const companion of state.companions) if (free.has(companion.owner)) free.add(companion.body)
  for (const index of [...free]) {
    const a = state.bodies[index]
    if (!a) continue
    for (const [other, b] of state.bodies.entries()) {
      if (free.has(other) || !shareAStorey(a, b)) continue
      const gap = gapBetween(
        { x: a.x, y: a.y, angle: a.angle, half: a.half },
        { x: b.x, y: b.y, angle: b.angle, half: b.half },
        index + other,
      )
      if (gap.distance < closestBetween(a, b) - CLEARED) free.add(other)
    }
  }
  for (const companion of state.companions) if (free.has(companion.owner)) free.add(companion.body)
  return free
}

/**
 * One round. Every storey is drawn on the one plot, so a stair spanning storeys is one body at one
 * point and needs no arithmetic of its own; two rooms are in each other's way only where they
 * share a floor, which is what leaves a bedroom upstairs free to stand over the kitchen below.
 */
export function step(
  state: SimulationState,
  config: LayoutConfig = defaultLayout,
  bound?: Bound,
): SimulationState {
  const count = state.bodies.length
  if (count === 0) return { ...state, energy: 0, round: state.round + 1 }
  const free = bound ? freedBy(state, bound) : undefined
  const work: Work[] = state.bodies.map((body, index) => ({
    body,
    x: body.x,
    y: body.y,
    angle: body.angle,
    held: body.pinned || (free !== undefined && !free.has(index)),
  }))
  const inside = state.ground.inside
  const holds = inside.sides.length >= 3
  const linked = new Set(state.links.map((link) => pairKey(link.a, link.b)))
  const riding = new Set(state.companions.map((each) => pairKey(each.body, each.owner)))
  /** How far the pulls reach this round: the whole at the start, nothing by the end. */
  const fade = Math.max(0, 1 - state.round / Math.max(1, config.rounds))

  // The rows of the rulebook, softest first: each pulls a room a step of fixed length, scaled by
  // its strength and the person's weight on its family, and the step fades over the run so that
  // what the walls and the links leave at the end is a picture nothing is still pushing.
  if (config.pull > 0 && fade > 0) {
    const fields = new Map<number, ForceField>()
    for (const w of work) {
      if (fixed(w) || w.body.rides !== undefined || !w.body.kind) continue
      const room: ForceRoom = {
        kind: w.body.kind,
        ...(w.body.tier === undefined ? {} : { tier: w.body.tier }),
      }
      let field = fields.get(w.body.storey)
      if (!field) {
        field = fieldFor(work, w.body.storey, state.ground)
        fields.set(w.body.storey, field)
      }
      let px = 0
      let py = 0
      for (const force of forces) {
        if (!force.acts(room)) continue
        const [ux, uy] = force.pull(room, [w.x, w.y], field)
        const size = force.strength * weightOf(config.weights, force.family)
        px += ux * size
        py += uy * size
      }
      const run = Math.hypot(px, py)
      if (run < 1e-9) continue
      const by = config.pull * fade * Math.min(1, run)
      const taken = move(w, [(px / run) * by, (py / run) * by], work, inside, holds)
      w.x += taken[0]
      w.y += taken[1]
    }
  }

  // The air two strangers keep, taken up a little at a time: a nudge apart, never a shove, and
  // a pull like the rows, fading with them so the last rounds hold nothing but walls and links.
  if (config.air > 0 && fade > 0)
    for (let i = 0; i < count; i++) {
      const a = work[i]
      if (!a || a.body.half > 0) continue
      for (let j = i + 1; j < count; j++) {
        const b = work[j]
        if (!b || b.body.half > 0 || !shareAStorey(a.body, b.body)) continue
        if (riding.has(pairKey(i, j))) continue
        if (fixed(a) && fixed(b)) continue
        // A linked pair keeps no air, except for the rounds a Spread lets its links out.
        const air = linked.has(pairKey(i, j)) ? config.linkAir : config.air
        if (air <= 0) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy)
        const short = restBetween(a.body, b.body) + air - distance
        if (short <= 0) continue
        const ux = distance < 1e-9 ? Math.cos(i + j) : dx / distance
        const uy = distance < 1e-9 ? Math.sin(i + j) : dy / distance
        moveApart(a, b, ux, uy, short * AIR_GIVE * fade, work, inside, holds)
      }
    }

  /** Every overlapping pair pushed apart, one pair at a time, past the quarter the model allows. */
  const part = (): void => {
    for (let i = 0; i < count; i++) {
      const a = work[i]
      if (!a) continue
      for (let j = i + 1; j < count; j++) {
        const b = work[j]
        if (!b || (fixed(a) && fixed(b)) || !shareAStorey(a.body, b.body)) continue
        const gap = gapBetween(placedOf(a), placedOf(b), i + j)
        const overlap = closestBetween(a.body, b.body) - gap.distance
        if (overlap <= CLEARED) continue
        moveApart(a, b, gap.ux, gap.uy, overlap, work, inside, holds)
      }
    }
  }

  /**
   * Every open link pulled closed, one pair at a time; a link the corridor stands across first
   * takes the freer of the two to the other side of it, because a link never crosses a wall.
   */
  const join = (): void => {
    for (const link of state.links) {
      const a = work[link.a]
      const b = work[link.b]
      if (!a || !b || (fixed(a) && fixed(b))) continue
      if (riding.has(pairKey(link.a, link.b))) continue
      const between = corridorBetween(work, state.corridors, a, b)
      if (between) {
        const mover =
          crossable(a) && (!crossable(b) || a.body.radius <= b.body.radius)
            ? a
            : crossable(b)
              ? b
              : undefined
        if (mover) {
          const [x, y] = acrossCorridor(between, mover.x, mover.y)
          const put = putInside(inside, [x, y], mover.body.radius)
          mover.x = put[0]
          mover.y = put[1]
        }
      }
      const gap = gapBetween(placedOf(a), placedOf(b), link.a + link.b)
      const rest = restBetween(a.body, b.body) + config.linkAir
      if (gap.distance <= rest + TOUCHING) continue
      moveApart(a, b, -gap.ux, -gap.uy, gap.distance - rest - TOUCHING / 2, work, inside, holds)
    }
  }

  /** The walls, in full and last: what a round leaves is a picture every wall holds. */
  const walls = (): void => {
    for (const w of work) onKerb(w)
    for (const w of work) inTandem(work, w)
    for (const w of work) inTheBand(w)
    for (const corridor of state.corridors) onAnchor(work, corridor, inside)
    for (const companion of state.companions) onOwner(work, companion, inside, holds)
    if (holds)
      for (const w of work) {
        if (w.body.half > 0) continue
        // A room wider than the floor has one place to stand, its middle, and stands there.
        const at =
          w.body.radius >= inside.deepest
            ? inside.middle
            : putInside(inside, [w.x, w.y], w.body.radius)
        w.x = at[0]
        w.y = at[1]
      }
  }

  // The walls first in every pass, so the links and the overlaps are answered on the places the
  // walls allow; the overlap wall last, because a room a wall has just put down is the one the
  // rooms round it make way for; and the walls once more at the end, in full.
  for (let pass = 0; pass < PASSES; pass++) {
    walls()
    join()
    part()
  }
  // The overlap wall once more on the places the walls have just settled, and the walls again
  // after it, so what a round leaves is a picture every wall holds and no pair lies too deep in.
  part()
  walls()

  // The bound: what the hand moved sets how far anything else may go this settle.
  if (bound) {
    for (const [index, w] of work.entries()) {
      const from = bound.from[index]
      if (!from || w.held || w.body.anchored) continue
      const dx = w.x - from.x
      const dy = w.y - from.y
      const went = Math.hypot(dx, dy)
      if (went <= bound.moved || went < 1e-9) continue
      w.x = from.x + (dx / went) * bound.moved
      w.y = from.y + (dy / went) * bound.moved
    }
    walls()
  }

  let energy = 0
  for (const w of work) {
    const dx = w.x - w.body.x
    const dy = w.y - w.body.y
    energy += dx * dx + dy * dy
  }

  const bodies = work.map((w) =>
    w.x === w.body.x && w.y === w.body.y && w.angle === w.body.angle
      ? w.body
      : { ...w.body, x: w.x, y: w.y, angle: w.angle },
  )
  return { ...state, bodies, round: state.round + 1, energy: energy / count }
}

/**
 * The passes a round takes over the walls, the links and the overlaps. Three, because a wall put
 * back after a link has pulled a room off it leaves that link a little open, and the passes
 * after close most of it inside the same round.
 */
const PASSES = 3

/**
 * A settle: the fixed number of rounds, from the first, whatever state the picture is in. The
 * same picture settles the same way every time, and a settle is never cut off early or run on.
 */
export function settle(
  state: SimulationState,
  config: LayoutConfig = defaultLayout,
  bound?: Bound,
): Settlement {
  let current: SimulationState = { ...state, round: 0 }
  for (let i = 0; i < config.rounds; i++) current = step(current, config, bound)
  return { state: current, iterations: config.rounds, settled: true }
}

/** How far a bubble may shift between two rounds and still be called still, in metres. */
const A_HAIR = 1e-3

/**
 * Whether a picture is at rest: it holds still for the quiet rounds to within a hair. A picture
 * left at rest and opened again is asked this with the pulls off, as they were when it rested,
 * and moves nothing; a picture whose weights have changed is asked with the pulls on, and moves
 * only if the rows now ask it to.
 */
export function atRest(
  state: SimulationState,
  config: LayoutConfig = defaultLayout,
  pulling = false,
): boolean {
  let current: SimulationState = { ...state, round: pulling ? 0 : config.rounds }
  for (let i = 0; i < STILL_FRAMES; i++) {
    current = step({ ...current, round: pulling ? 0 : config.rounds }, config)
    if (current.energy > A_HAIR * A_HAIR) return false
  }
  return true
}
