import type { Point } from '../geometry'
import { gapBetween, nearestOnSegment } from './capsule'
import { putInside } from './ground'
import {
  closestBetween,
  TOUCHING,
  restBetween,
  settle,
  shareAStorey,
  type Body,
  type LayoutConfig,
  type SimulationState,
} from './simulation'
import { touching } from './tension'

/*
 * The correction of decision 21: when the picture rests, a link that has not closed is not shrugged
 * at. The bubbles never touched, so the movable one is walked round the other to the nearest free
 * spot and the picture is let settle again. It is discrete, because a force that could have closed
 * the link would have closed it already.
 *
 * A room left lying too deep inside another is corrected the same way, and for the same reason. The
 * overlap wall is projected every frame, but a room the buildable line has backed into a corner has
 * nowhere to be pushed to, and a room held to a kerb or an owner's perimeter has only its line: the
 * push across it is lost and the room stays where it is, inside its neighbour. Walking it round to
 * a free spot is the move the projection cannot make.
 */

/** How many goes the correction has before the picture is called rested anyway. */
const ROUNDS = 10

/** Places round a body the walk tries, which is one every ten degrees. */
const STATIONS = 36

function withBody(state: SimulationState, index: number, at: Point): SimulationState {
  return {
    ...state,
    bodies: state.bodies.map((body, other) =>
      other === index ? { ...body, x: at[0], y: at[1], vx: 0, vy: 0 } : body,
    ),
  }
}

/** Whether a body may be walked at all: the hand, a kerb, an anchor and a tandem bay all say no. */
function movable(state: SimulationState, index: number): boolean {
  const body = state.bodies[index]
  if (!body || body.pinned || body.kerb || body.half > 0 || body.anchored) return false
  return !state.companions.some((companion) => companion.body === index)
}

/** Which side of a corridor's line a point falls on; nought when there is no corridor to speak of. */
function sideOf(corridor: Body, x: number, y: number): number {
  const ux = Math.cos(corridor.angle)
  const uy = Math.sin(corridor.angle)
  const across = (x - corridor.x) * uy - (y - corridor.y) * ux
  return Math.abs(across) < corridor.radius ? 0 : Math.sign(across)
}

/** The corridor standing between two bodies on their own floor, where one does. */
function corridorBetween(state: SimulationState, a: Body, b: Body): Body | undefined {
  for (const corridor of state.corridors) {
    const body = state.bodies[corridor.body]
    if (!body || !shareAStorey(body, a)) continue
    const near = nearestOnSegment([a.x, a.y], [b.x, b.y], body.x, body.y)
    if (Math.hypot(near[0] - body.x, near[1] - body.y) > body.radius + body.half) continue
    if (sideOf(body, a.x, a.y) * sideOf(body, b.x, b.y) < 0) return body
  }
  return undefined
}

/** How crowded a side of the corridor is, so the member on the busier side is the one that crosses. */
function crowdOn(state: SimulationState, corridor: Body, side: number): number {
  return state.bodies.filter(
    (body) => shareAStorey(body, corridor) && sideOf(corridor, body.x, body.y) === side,
  ).length
}

/**
 * The nearest free spot on a body's perimeter for the room that wants to touch it: every station
 * round it in turn, scored by how far it would lie over the rooms already there and how far the
 * room has to go to reach it. Where a corridor stands between the pair, only the stations on the
 * other room's side are tried, which is the crossing the corridor asks for.
 */
function walkRound(
  state: SimulationState,
  mover: number,
  anchorIndex: number,
  onlySide: { readonly corridor: Body; readonly side: number } | null,
): Point | null {
  const body = state.bodies[mover]
  const anchor = state.bodies[anchorIndex]
  if (!body || !anchor) return null
  const reach = restBetween(anchor, body)
  const was = Math.atan2(body.y - anchor.y, body.x - anchor.x)
  let best: Point | null = null
  let bestCost = Infinity
  for (let station = 0; station < STATIONS; station++) {
    const turn = (station * 2 * Math.PI) / STATIONS
    const angle = was + (station % 2 === 0 ? turn : -turn)
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    // A corridor is touched along its sides, so the spot is measured from the end of its segment
    // that lies this way rather than from its middle.
    const along = Math.sign(ux * Math.cos(anchor.angle) + uy * Math.sin(anchor.angle)) * anchor.half
    const wanted: Point = [
      anchor.x + Math.cos(anchor.angle) * along + ux * reach,
      anchor.y + Math.sin(anchor.angle) * along + uy * reach,
    ]
    const at = putInside(state.ground.inside, wanted, body.radius)
    if (onlySide && sideOf(onlySide.corridor, at[0], at[1]) !== onlySide.side) continue
    // A spot the line pushed the room off is not that spot at all.
    const cost =
      Math.hypot(at[0] - wanted[0], at[1] - wanted[1]) * 4 +
      costOf(state, mover, at, anchorIndex) +
      Math.abs(((angle - was + Math.PI) % (2 * Math.PI)) - Math.PI) * 0.05
    if (cost >= bestCost) continue
    bestCost = cost
    best = at
  }
  return best
}

/**
 * What a spot costs the room that would stand there: how far it would lie over the rooms already
 * about, and how far short it would leave every other room it is joined to. A spot that takes a
 * room out of its neighbour by leaving the room it is linked to behind has corrected nothing, it
 * has moved the fault.
 */
function costOf(state: SimulationState, mover: number, at: Point, anchorIndex: number): number {
  const body = state.bodies[mover]
  if (!body) return Infinity
  let cost = 0
  for (const [other, each] of state.bodies.entries()) {
    if (other === mover || other === anchorIndex || !shareAStorey(each, body)) continue
    const over = closestBetween(each, body) - Math.hypot(at[0] - each.x, at[1] - each.y)
    if (over > 0) cost += over
  }
  for (const link of state.links) {
    const other = link.a === mover ? link.b : link.b === mover ? link.a : undefined
    if (other === undefined || other === anchorIndex) continue
    const each = state.bodies[other]
    if (!each) continue
    const short = Math.hypot(at[0] - each.x, at[1] - each.y) - restBetween(each, body)
    if (short > 0) cost += short
  }
  return cost
}

/**
 * A walled room does not walk round anything: it slides along its kerb, which is the one move its
 * wall leaves it. Where the room it is joined to cannot come to it — the entry with a garage on one
 * side and a diwaniya on the other has no perimeter left to give — the entry itself goes along the
 * street until there is room, which is what a designer does with a plan that will not close.
 */
function slideAlongKerb(state: SimulationState, mover: number, anchorIndex: number): Point | null {
  const body = state.bodies[mover]
  const anchor = state.bodies[anchorIndex]
  if (!body || !anchor || !body.kerb || body.pinned) return null
  const [from, to] = body.kerb
  const run = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (run < 1e-9) return null
  let best: Point | null = null
  let bestCost = Infinity
  for (let station = 0; station <= STATIONS; station++) {
    const part = station / STATIONS
    const at: Point = [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part]
    const short = Math.hypot(at[0] - anchor.x, at[1] - anchor.y) - restBetween(anchor, body)
    const cost =
      (short > 0 ? short : 0) +
      costOf(state, mover, at, anchorIndex) +
      (Math.hypot(at[0] - body.x, at[1] - body.y) / run) * 0.05
    if (cost >= bestCost) continue
    bestCost = cost
    best = at
  }
  return best
}

/**
 * Every linked pair that has not touched, walked to a free spot and let settle again, up to three
 * rounds. Only then is the picture at rest.
 */
export function correctContacts(
  state: SimulationState,
  config: LayoutConfig,
): { readonly state: SimulationState; readonly corrected: number } {
  let current = state
  let corrected = 0
  // The arrangement with the fewest links left open, which is what the person is shown: a walk
  // that closed one and a settle that opened another again is not an improvement to keep.
  let best = current
  let fewest = unmet(current)
  for (let round = 0; round < ROUNDS && !settled(fewest); round++) {
    let moved = false
    // The deepest overlap first: a room standing in another is a wall broken, and walking it out
    // is what the projection could not do. The room that may move walks; where neither may, the
    // picture is honest about it and the pair stays for the diagnosis to report.
    for (const [one, other] of tooDeep(current, A_HAIR)) {
      const order = movableFirst(current, one, other, undefined)
      if (!order) continue
      const [mover, into] = order
      const spot = walkRound(current, mover, into, null)
      if (!spot) continue
      current = withBody(current, mover, spot)
      moved = true
      corrected += 1
    }
    for (const link of current.links) {
      const a = current.bodies[link.a]
      const b = current.bodies[link.b]
      if (!a || !b || touching(a, b)) continue
      const corridor = corridorBetween(current, a, b)
      const order = movableFirst(current, link.a, link.b, corridor)
      if (!order) continue
      const [mover, anchor] = order
      const other = current.bodies[anchor]
      const side = corridor && other ? { corridor, side: sideOf(corridor, other.x, other.y) } : null
      const spot = walkRound(current, mover, anchor, side)
      if (spot) {
        current = withBody(current, mover, spot)
        moved = true
        corrected += 1
      }
      // And where the room that walked still cannot reach, the walled one slides along its kerb
      // to meet it, because a wall that may be kept and a link that may be closed are both walls.
      const walked = current.bodies[mover]
      const held = current.bodies[anchor]
      if (!walked || !held || touching(walked, held)) continue
      const slid = slideAlongKerb(current, anchor, mover)
      if (!slid || Math.hypot(slid[0] - held.x, slid[1] - held.y) < TOUCHING) continue
      current = withBody(current, anchor, slid)
      moved = true
      corrected += 1
    }
    if (!moved) break
    current = settle(current, { ...config, maxIterations: AFTER_WALK }).state
    const left = unmet(current)
    if (!better(left, fewest)) continue
    fewest = left
    best = current
  }
  // A picture handed back still moving goes on moving when the tab is opened again, so every walk
  // is run to rest before it is weighed, and what is handed back is the arrangement that rested
  // best. A link the run opens again is one the walk could not hold, and the picture says so with
  // a line of tension rather than by never standing still.
  const rested = settle(best, config).state
  return { state: rested, corrected: best === state ? 0 : corrected }
}

/** How many of a picture's links have not closed. */
function stillOpen(state: SimulationState): number {
  return state.links.filter((link) => {
    const a = state.bodies[link.a]
    const b = state.bodies[link.b]
    return a !== undefined && b !== undefined && !touching(a, b)
  }).length
}

/**
 * How deep two bodies lie in one another past the quarter the model allows; nought where they are
 * clear of each other or stand on floors that never meet.
 */
function pastTheQuarter(a: Body, b: Body): number {
  if (!shareAStorey(a, b)) return 0
  const gap = gapBetween(
    { x: a.x, y: a.y, angle: a.angle, half: a.half },
    { x: b.x, y: b.y, angle: b.angle, half: b.half },
    0,
  )
  return Math.max(0, closestBetween(a, b) - gap.distance)
}

/** A hair, so that a pair the projection leaves a rounding's width inside is not called an overlap. */
const A_HAIR = 0.01

/** A short run after a walk: long enough for the neighbours to answer, short enough to hold it. */
const AFTER_WALK = 120

/** Every pair of a picture's rooms lying at least this far past the quarter, deepest first. */
function tooDeep(state: SimulationState, least: number): readonly (readonly [number, number])[] {
  const out: { readonly pair: readonly [number, number]; readonly by: number }[] = []
  for (const [index, a] of state.bodies.entries())
    for (let other = index + 1; other < state.bodies.length; other++) {
      const b = state.bodies[other]
      if (!b) continue
      const by = pastTheQuarter(a, b)
      if (by > least) out.push({ pair: [index, other], by })
    }
  return out.sort((one, two) => two.by - one.by).map((each) => each.pair)
}

/**
 * What a picture has left unmet: the links that never closed, and the rooms left lying too deep in
 * one another. A link is the brief's own word and an overlap is the model's allowance, so a picture
 * is only better when it leaves no more links open, and better again when fewer rooms rest too deep.
 */
type Unmet = { readonly open: number; readonly deep: number }

function unmet(state: SimulationState): Unmet {
  return { open: stillOpen(state), deep: tooDeep(state, A_HAIR).length }
}

function better(one: Unmet, than: Unmet): boolean {
  return one.open === than.open ? one.deep < than.deep : one.open < than.open
}

function settled(each: Unmet): boolean {
  return each.open === 0 && each.deep === 0
}

/**
 * Which of the pair walks: the one that may move at all, and where both may, the one on the busier
 * side of the corridor or else the smaller room, because a small room finds a free wall sooner.
 */
function movableFirst(
  state: SimulationState,
  a: number,
  b: number,
  corridor: Body | undefined,
): readonly [number, number] | null {
  const canA = movable(state, a)
  const canB = movable(state, b)
  if (!canA && !canB) return null
  if (!canB) return [a, b]
  if (!canA) return [b, a]
  const bodyA = state.bodies[a]
  const bodyB = state.bodies[b]
  if (!bodyA || !bodyB) return null
  if (corridor) {
    const crowdA = crowdOn(state, corridor, sideOf(corridor, bodyA.x, bodyA.y))
    const crowdB = crowdOn(state, corridor, sideOf(corridor, bodyB.x, bodyB.y))
    if (crowdA !== crowdB) return crowdA > crowdB ? [a, b] : [b, a]
  }
  return bodyA.radius <= bodyB.radius ? [a, b] : [b, a]
}
