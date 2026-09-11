/**
 * A stair is on every floor between the two it names, so its row asks for both ends rather than one
 * storey. What the model stores is unchanged: the lower end is the room's storey and the span is
 * the count of floors up to the higher one.
 */

/** The storeys a stair may start on: with more than one storey it must leave room to reach one above. */
export function startsFor(storeys: number): readonly number[] {
  const levels = Math.max(1, Math.trunc(storeys))
  return Array.from({ length: Math.max(1, levels - 1) }, (_unused, storey) => storey)
}

/** The storeys it may reach: at least one above where it starts, as far up as the house goes. */
export function topsFor(from: number, storeys: number): readonly number[] {
  const levels = Math.max(1, Math.trunc(storeys))
  if (levels < 2) return [0]
  const lowest = Math.min(from + 1, levels - 1)
  return Array.from({ length: levels - lowest }, (_unused, above) => lowest + above)
}

/** The span the two ends come to, counting both of them. */
export function spanBetween(from: number, to: number): number {
  return Math.max(1, to - from + 1)
}

/** The top storey a room reaches, which is the far end of what it stores. */
export function topOf(room: { readonly storey: number; readonly storeysSpanned: number }): number {
  return room.storey + Math.max(1, Math.trunc(room.storeysSpanned)) - 1
}

/** Where a stair reaches after its lower end moves: where it did, unless the move has passed it. */
export function topAfterStart(from: number, top: number, storeys: number): number {
  const tops = topsFor(from, storeys)
  return tops.includes(top) ? top : (tops[0] ?? from)
}
