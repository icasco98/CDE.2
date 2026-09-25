import { listedNames } from '../rulebook/words'
import { reachedFromFrontDoor } from './reach'
import type { Check, CheckEdge, CheckRoom } from './types'

const rule = 'Every room is reached from the front door through the edges of the house.'
const source = 'MODEL.md, findings from the graph: reachability from the front door.'

/** The rooms the front door does not lead to; with no front door at all, that one fact. */
export function unreached(
  rooms: readonly CheckRoom[],
  edges: readonly CheckEdge[],
): readonly Check[] {
  if (rooms.length === 0) return []
  if (!edges.some((edge) => edge.kind === 'main-door'))
    return [
      {
        code: 'unreached',
        rooms: [],
        sentence: 'There is no front door, so no room is reached from one.',
        rule,
        source,
      },
    ]
  const reached = reachedFromFrontDoor(edges)
  const left = rooms.filter((room) => !reached.has(room.id))
  if (left.length === 0) return []
  const names = left.map((room) => room.name)
  return [
    {
      code: 'unreached',
      rooms: left.map((room) => room.id),
      sentence: `${listedNames(names)} ${names.length === 1 ? 'is' : 'are'} not reached from the front door.`,
      rule,
      source,
    },
  ]
}
