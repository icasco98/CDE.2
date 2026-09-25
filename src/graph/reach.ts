import { EXTERIOR } from '../model'
import type { CheckEdge } from './types'

/**
 * The rooms reached from the front door over the edges, with one room taken out when asked. Only
 * the main door leads in from the outside: a room with a street door of its own is not thereby
 * reached from the entrance.
 */
export function reachedFromFrontDoor(
  edges: readonly CheckEdge[],
  without?: string,
): ReadonlySet<string> {
  const next = new Map<string, string[]>()
  const join = (from: string, to: string): void => {
    next.set(from, [...(next.get(from) ?? []), to])
  }
  for (const edge of edges) {
    if (edge.a === without || edge.b === without) continue
    const outside = edge.a === EXTERIOR || edge.b === EXTERIOR
    if (outside && edge.kind !== 'main-door') continue
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
