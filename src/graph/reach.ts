import { EXTERIOR } from '../model'
import type { CheckEdge } from './types'

/**
 * The rooms reached from outside over the edges, with one room taken out when asked. Every edge to
 * the outside is an entrance, the front door and a room's own street door alike, so a diwaniya or a
 * garage with a door of its own is reached through it.
 */
export function reachedFromOutside(
  edges: readonly CheckEdge[],
  without?: string,
): ReadonlySet<string> {
  const next = new Map<string, string[]>()
  const join = (from: string, to: string): void => {
    next.set(from, [...(next.get(from) ?? []), to])
  }
  for (const edge of edges) {
    if (edge.a === without || edge.b === without) continue
    join(edge.a, edge.b)
    join(edge.b, edge.a)
  }
  const reached = new Set<string>([EXTERIOR])
  const queue = [EXTERIOR]
  while (queue.length > 0) {
    const at = queue.pop()!
    for (const to of next.get(at) ?? [])
      if (!reached.has(to)) {
        reached.add(to)
        queue.push(to)
      }
  }
  reached.delete(EXTERIOR)
  return reached
}
