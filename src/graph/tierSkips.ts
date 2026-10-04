import { EXTERIOR } from '../model'
import type { Check, CheckConnection, CheckZone } from './types'

const rule =
  'The privacy gradient: a door only between adjacent tiers, so a private-tier zone never opens straight onto the street or a public-tier zone.'
const source = 'rulebook/forces.md U2; the tiers of rulebook/zone-types.md.'

/**
 * Every connection that joins a private-tier zone to the outside or to a public-tier zone; exempt
 * kinds are never checked. The sentence names the tier, since a zone's colour is its category and
 * the two differ (a kitchen is shared in colour and private in tier).
 */
export function tierSkips(
  zones: readonly CheckZone[],
  connections: readonly CheckConnection[],
): readonly Check[] {
  const byId = new Map(zones.map((zone) => [zone.id, zone]))
  const found: Check[] = []
  for (const connection of connections) {
    for (const [near, far] of [
      [connection.a, connection.b],
      [connection.b, connection.a],
    ] as const) {
      const zone = byId.get(near)
      if (zone?.tier !== 'private') continue
      const other = far === EXTERIOR ? null : byId.get(far)
      if (far !== EXTERIOR && other?.tier !== 'public') continue
      found.push({
        code: 'tier-skip',
        zones: other ? [zone.id, other.id] : [zone.id],
        sentence: other
          ? `${zone.name}, a private-tier zone, is joined to ${other.name}, a public-tier one.`
          : `${zone.name}, a private-tier zone, opens straight onto the outside.`,
        rule,
        source,
      })
    }
  }
  return found
}
