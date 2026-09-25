import { EXTERIOR } from '../model'
import { listedNames } from '../rulebook/words'
import { reachedFromOutside } from './reach'
import type { Check, CheckEdge, CheckRoom } from './types'

const rule =
  'Every room is reached from outside through the edges of the house, by the front door or by a room’s own door to the outside.'
const source = 'MODEL.md, findings from the graph: reachability from the entrances.'

/** The rooms no entrance leads to, and a house with no front door said once. */
export function unreached(
  rooms: readonly CheckRoom[],
  edges: readonly CheckEdge[],
): readonly Check[] {
  if (rooms.length === 0) return []
  if (!edges.some((edge) => edge.a === EXTERIOR || edge.b === EXTERIOR))
    return [
      {
        code: 'unreached',
        rooms: [],
        sentence: 'No room has a door to the outside, so no room is reached.',
        rule,
        source,
      },
    ]
  const found: Check[] = []
  if (!edges.some((edge) => edge.kind === 'main-door'))
    found.push({
      code: 'unreached',
      rooms: [],
      sentence: 'There is no front door.',
      rule: 'A house has one main door, from the outside.',
      source: 'MODEL.md, Edge: main-door, exactly one per project, from EXTERIOR.',
    })
  const reached = reachedFromOutside(edges)
  const left = rooms.filter((room) => !reached.has(room.id))
  if (left.length === 0) return found
  const names = left.map((room) => room.name)
  found.push({
    code: 'unreached',
    rooms: left.map((room) => room.id),
    sentence: `${listedNames(names)} ${names.length === 1 ? 'is' : 'are'} not reached from any entrance.`,
    rule,
    source,
  })
  return found
}
