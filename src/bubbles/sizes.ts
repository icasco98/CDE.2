/**
 * How big the bubble diagram draws a room: a circle's area is in proportion to the room's target
 * area, the largest room in the program setting the scale so its circle fills its cell.
 */

/** The largest circle's radius, in the diagram's units: its cell is 120 wide, less a gap and the ring. */
export const LARGEST_RADIUS = 52

/** The smallest radius drawn, so a WC or a store can still be pressed and its ring reached. */
export const SMALLEST_RADIUS = 13

/** The areas the legend's key may stand for, in m²; the key takes a round one the program uses. */
const KEY_AREAS = [5, 10, 20, 50, 100, 200] as const

/** Radius per square root of a square metre, set by the largest target area in the program. */
export function scaleFor(areas: readonly number[]): number {
  const largest = Math.max(0, ...areas)
  return largest > 0 ? LARGEST_RADIUS / Math.sqrt(largest) : 0
}

export function radiusFor(targetArea: number, scale: number): number {
  return Math.max(SMALLEST_RADIUS, scale * Math.sqrt(Math.max(0, targetArea)))
}

/** The legend's reference circle: the largest round area no bigger than half the largest room. */
export function keyFor(scale: number): { readonly area: number; readonly r: number } {
  if (scale <= 0) return { area: KEY_AREAS[0], r: SMALLEST_RADIUS }
  const largest = (LARGEST_RADIUS / scale) ** 2
  const area = [...KEY_AREAS].reverse().find((each) => each <= largest / 2) ?? KEY_AREAS[0]
  return { area, r: scale * Math.sqrt(area) }
}
