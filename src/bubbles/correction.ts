import type { Point } from '../geometry'
import { nearestOnSegment } from './capsule'
import { putInside } from './ground'
import {
  closestBetween,
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
 */

/** How many goes the correction has before the picture is called rested anyway. */
const ROUNDS = 3

/** Places round a body the walk tries, which is one every ten degrees. */
const STATIONS = 36

/** A short run after a walk: long enough for the neighbours to answer, short enough to feel at once. */
const AFTER_WALK = 120

function withBody(state: SimulationState, index: number, at: Point): SimulationState {
  return {
    ...state,
    bodies: state.bodies.map((body, other) =>
      other === index ? { ...body, x: at[0], y: at[1], vx: 0, vy: 0 } : body,
    ),
  }
}

/** Whether a body may be walked at all: the hand, a kerb and a corridor's anchor all say no. */
function movable(state: SimulationState, index: number): boolean {
  const body = state.bodies[index]
  if (!body || body.pinned || body.kerb || body.half > 0) return false
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
    const wanted: Point = [anchor.x + Math.cos(angle) * reach, anchor.y + Math.sin(angle) * reach]
    const at = putInside(state.ground.inside, wanted, body.radius)
    // A spot the line pushed the room off is not that spot at all.
    let cost = Math.hypot(at[0] - wanted[0], at[1] - wanted[1]) * 4
    if (onlySide && sideOf(onlySide.corridor, at[0], at[1]) !== onlySide.side) continue
    for (const [other, each] of state.bodies.entries()) {
      if (other === mover || other === anchorIndex || !shareAStorey(each, body)) continue
      const over = closestBetween(each, body) - Math.hypot(at[0] - each.x, at[1] - each.y)
      if (over > 0) cost += over
    }
    cost += Math.abs(((angle - was + Math.PI) % (2 * Math.PI)) - Math.PI) * 0.05
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
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false
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
      if (!spot) continue
      current = withBody(current, mover, spot)
      moved = true
      corrected += 1
    }
    if (!moved) break
    current = settle(current, { ...config, maxIterations: AFTER_WALK }).state
  }
  return { state: current, corrected }
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
