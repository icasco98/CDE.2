import type { Point } from '../geometry'

/*
 * A corridor is a capsule, not a disc: a straight segment with a half-width, so rooms touch it
 * along its sides the way they stand along a corridor in a plan. Every other room is a disc, which
 * is the same arithmetic with a segment of no length.
 */

/**
 * Half of a corridor's width in the physics. The Municipality's minimum room sizes give a corridor
 * inside the unit 1.20 m clear, and the room-type table carries that as the hallway's legal floor,
 * so the capsule is 1.20 m across and its segment carries the rest of the area as length.
 */
export const CORRIDOR_R = 0.6

/**
 * How far a corridor of this area reaches from its middle to one end. A capsule of radius r and
 * segment 2h has an area of πr² + 4rh, so the straight part carries whatever the two round ends
 * leave; a corridor smaller than its own ends is a landing and has no length at all.
 */
export function corridorHalf(area: number): number {
  const straight = Math.max(0, area - Math.PI * CORRIDOR_R * CORRIDOR_R)
  return straight / (4 * CORRIDOR_R)
}

/** Where a body's segment lies: its middle, the way it lies, and how far it reaches each way. */
export type Placed = {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly half: number
}

export function endsOf(placed: Placed): readonly [Point, Point] {
  const dx = Math.cos(placed.angle) * placed.half
  const dy = Math.sin(placed.angle) * placed.half
  return [
    [placed.x - dx, placed.y - dy],
    [placed.x + dx, placed.y + dy],
  ]
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** The point of a segment nearest somewhere else, and how far along the segment it sits. */
export function nearestOnSegment(from: Point, to: Point, x: number, y: number): Point {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const run = dx * dx + dy * dy
  if (run < 1e-12) return from
  const along = clamp01(((x - from[0]) * dx + (y - from[1]) * dy) / run)
  return [from[0] + dx * along, from[1] + dy * along]
}

/** How far apart two bodies are and which way, measured between the nearest points of their segments. */
export type Gap = { readonly ux: number; readonly uy: number; readonly distance: number }

/**
 * The nearest points of two segments, walked to by taking each segment's nearest point to the
 * other's middle in turn. Two passes settle a pair of segments of any length, and a disc against
 * anything is right on the first, because its segment is one point.
 */
function nearestPair(a: Placed, b: Placed): readonly [Point, Point] {
  const [a0, a1] = endsOf(a)
  const [b0, b1] = endsOf(b)
  if (a.half < 1e-9 && b.half < 1e-9) return [a0, b0]
  let onA: Point = a0
  let onB: Point = [b.x, b.y]
  for (let pass = 0; pass < 3; pass++) {
    onA = nearestOnSegment(a0, a1, onB[0], onB[1])
    onB = nearestOnSegment(b0, b1, onA[0], onA[1])
  }
  return [onA, onB]
}

/** Two bodies exactly on top of each other need a direction to part along; their indices fix one. */
export function gapBetween(a: Placed, b: Placed, seed: number): Gap {
  const [onA, onB] = nearestPair(a, b)
  const dx = onB[0] - onA[0]
  const dy = onB[1] - onA[1]
  const distance = Math.hypot(dx, dy)
  if (distance > 1e-9) return { ux: dx / distance, uy: dy / distance, distance }
  return { ux: Math.cos(seed), uy: Math.sin(seed), distance: 0 }
}
