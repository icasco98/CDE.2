import { reachedFromOutside } from './reach'
import type { Check, CheckEdge, CheckPair, CheckRoom } from './types'

const source = 'The keep-apart pairs of this project (decision 26).'

/**
 * The room of a pair that stands on every route from outside to the other, if either does:
 * take it out of the graph and the other is no longer reached. A room not reached at all has no
 * route to stand on, so it says nothing here.
 */
export function onlyThrough(
  pair: CheckPair,
  edges: readonly CheckEdge[],
  reached: ReadonlySet<string> = reachedFromOutside(edges),
): { readonly room: string; readonly through: string } | null {
  for (const [room, through] of [
    [pair.a, pair.b],
    [pair.b, pair.a],
  ] as const) {
    if (!reached.has(room) || !reached.has(through)) continue
    if (!reachedFromOutside(edges, through).has(room)) return { room, through }
  }
  return null
}

const joined = (pair: CheckPair, edges: readonly CheckEdge[]): boolean =>
  edges.some(
    (edge) => (edge.a === pair.a && edge.b === pair.b) || (edge.a === pair.b && edge.b === pair.a),
  )

/** Both ways a keep-apart pair is broken: an edge between the two, and one reached only through the other. */
export function apartBroken(
  rooms: readonly CheckRoom[],
  edges: readonly CheckEdge[],
  pairs: readonly CheckPair[],
): readonly Check[] {
  const name = new Map(rooms.map((room) => [room.id, room.name]))
  const reached = reachedFromOutside(edges)
  const found: Check[] = []
  for (const pair of pairs) {
    const [a, b] = [name.get(pair.a) ?? pair.a, name.get(pair.b) ?? pair.b]
    if (joined(pair, edges))
      found.push({
        code: 'apart-joined',
        rooms: [pair.a, pair.b],
        sentence: `${a} and ${b} are kept apart, and an edge joins them.`,
        rule: 'Two rooms kept apart have no edge between them.',
        source,
      })
    const through = onlyThrough(pair, edges, reached)
    if (through)
      found.push({
        code: 'apart-through',
        rooms: [through.room, through.through],
        sentence: `${name.get(through.room)} is reached only through ${name.get(through.through)}, and the two are kept apart.`,
        rule: 'Of two rooms kept apart, neither stands on every route from outside to the other.',
        source,
      })
  }
  return found
}
