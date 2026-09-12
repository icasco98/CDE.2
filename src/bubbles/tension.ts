import { forcesOn } from '../rulebook'
import { gapBetween, nearestOnSegment, type Placed } from './capsule'
import { restBetween, shareAStorey, TOUCHING, type Body, type SimulationState } from './simulation'

/** What a link is doing: closed and touching, or open with a reason it has not closed. */
export type LinkReading = { readonly realized: boolean; readonly reason?: string }

function placedOf(body: Body): Placed {
  return { x: body.x, y: body.y, angle: body.angle, half: body.half }
}

/** Whether two bodies are touching, measured as everything else is: between their segments. */
export function touching(a: Body, b: Body): boolean {
  return gapBetween(placedOf(a), placedOf(b), 0).distance <= a.radius + b.radius + TOUCHING
}

/**
 * The body standing between two others: the one whose own shape the line between them runs
 * through. It is the usual reason a wanted link has not closed, and on a villa's ground floor it
 * is usually the corridor.
 */
function inTheWay(state: SimulationState, a: Body, b: Body): Body | undefined {
  let found: Body | undefined
  let deepest = 0
  for (const other of state.bodies) {
    if (other === a || other === b || !shareAStorey(other, a)) continue
    const dx = Math.cos(other.angle) * other.half
    const dy = Math.sin(other.angle) * other.half
    // The body's own segment against the line joining the two, at both ends of that segment.
    for (const end of [
      [other.x - dx, other.y - dy],
      [other.x + dx, other.y + dy],
    ] as const) {
      const near = nearestOnSegment([a.x, a.y], [b.x, b.y], end[0], end[1])
      const across = other.radius - Math.hypot(near[0] - end[0], near[1] - end[1])
      if (across <= deepest) continue
      deepest = across
      found = other
    }
  }
  return found
}

/**
 * The row that is holding a room away from what it is linked to: the strongest force acting on
 * either of them whose pull runs against the way the link wants to go.
 */
function heldBy(state: SimulationState, a: Body, b: Body): string | undefined {
  const field = state.ground
  let strongest: { readonly id: string; readonly strength: number } | undefined
  for (const [one, other] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!one.kind) continue
    const toward = Math.hypot(other.x - one.x, other.y - one.y) || 1
    const wx = (other.x - one.x) / toward
    const wy = (other.y - one.y) / toward
    for (const force of forcesOn({ kind: one.kind, ...(one.tier ? { tier: one.tier } : {}) })) {
      const [ux, uy] = force.pull(
        { kind: one.kind, ...(one.tier ? { tier: one.tier } : {}) },
        [one.x, one.y],
        {
          sides: field.sides,
          site: field.site,
          where: (kinds) => {
            const found = state.bodies.filter((body) => body.kind && kinds.includes(body.kind))
            if (found.length === 0) return undefined
            return [
              found.reduce((total, body) => total + body.x, 0) / found.length,
              found.reduce((total, body) => total + body.y, 0) / found.length,
            ]
          },
        },
      )
      if (ux * wx + uy * wy >= -0.3) continue
      if (strongest && strongest.strength >= force.strength) continue
      strongest = { id: force.id, strength: force.strength }
    }
  }
  return strongest?.id
}

/**
 * What a link is doing and, when it has not closed, the one thing standing in its way. Every link
 * is in one of three states; the third, impossible, is the brief's to say before a bubble moves,
 * so this reads only the two the picture can see.
 */
export function readLink(
  state: SimulationState,
  a: string,
  b: string,
  nameFor: (id: string) => string = (id) => id,
): LinkReading | null {
  const one = state.bodies.find((body) => body.id === a)
  const other = state.bodies.find((body) => body.id === b)
  if (!one || !other) return null
  if (touching(one, other)) return { realized: true }
  const between = inTheWay(state, one, other)
  if (between)
    return {
      realized: false,
      reason: `${nameFor(one.id)} cannot reach ${nameFor(other.id)}: ${nameFor(between.id)} is between them.`,
    }
  const row = heldBy(state, one, other)
  if (row)
    return {
      realized: false,
      reason: `${nameFor(one.id)} cannot reach ${nameFor(other.id)}: ${row} is holding one of them.`,
    }
  return {
    realized: false,
    reason: `${nameFor(one.id)} and ${nameFor(other.id)} have not come together; there is no room between them for the door.`,
  }
}

/** How far a linked pair still has to come to touch, for the correction to know what to work on. */
export function shortBy(a: Body, b: Body): number {
  return gapBetween(placedOf(a), placedOf(b), 0).distance - restBetween(a, b)
}
