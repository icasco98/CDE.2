import { EXTERIOR } from '../model'
import type { CheckConnection } from './types'

/**
 * The zones reached from outside over the connections, with one zone taken out when asked. Every connection to
 * the outside is an entrance, the front door and a zone's own street door alike, so a diwaniya or a
 * garage with a door of its own is reached through it.
 */
export function reachedFromOutside(
  connections: readonly CheckConnection[],
  without?: string,
): ReadonlySet<string> {
  const next = new Map<string, string[]>()
  const join = (from: string, to: string): void => {
    next.set(from, [...(next.get(from) ?? []), to])
  }
  for (const connection of connections) {
    if (connection.a === without || connection.b === without) continue
    join(connection.a, connection.b)
    join(connection.b, connection.a)
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
