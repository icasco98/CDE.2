import { EXTERIOR } from '../model'
import { listedNames } from '../rulebook/words'
import { reachedFromOutside } from './reach'
import type { Check, CheckConnection, CheckZone } from './types'

const rule =
  'Every zone is reached from outside through the connections of the house, by the front door or by a zone’s own door to the outside.'
const source = 'MODEL.md, findings from the graph: reachability from the entrances.'

/** The zones no entrance leads to, and a house with no front door said once. */
export function unreached(
  zones: readonly CheckZone[],
  connections: readonly CheckConnection[],
): readonly Check[] {
  if (zones.length === 0) return []
  if (!connections.some((connection) => connection.a === EXTERIOR || connection.b === EXTERIOR))
    return [
      {
        code: 'unreached',
        zones: [],
        sentence: 'No zone has a door to the outside, so no zone is reached.',
        rule,
        source,
      },
    ]
  const found: Check[] = []
  if (!connections.some((connection) => connection.kind === 'main-door'))
    found.push({
      code: 'unreached',
      zones: [],
      sentence: 'There is no front door.',
      rule: 'A house has one main door, from the outside.',
      source: 'MODEL.md, Connection: main-door, exactly one per project, from EXTERIOR.',
    })
  const reached = reachedFromOutside(connections)
  const left = zones.filter((zone) => !reached.has(zone.id))
  if (left.length === 0) return found
  const names = left.map((zone) => zone.name)
  found.push({
    code: 'unreached',
    zones: left.map((zone) => zone.id),
    sentence: `${listedNames(names)} ${names.length === 1 ? 'is' : 'are'} not reached from any entrance.`,
    rule,
    source,
  })
  return found
}
