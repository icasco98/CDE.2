import { EXTERIOR } from '../model'
import type { Check, CheckEdge, CheckRoom } from './types'

const rule =
  'The privacy gradient: a door only between adjacent tiers, so a private room never opens straight onto the street or a public room.'
const source = 'rulebook/forces.md U2; the tiers of rulebook/room-types.md.'

/** Every edge that joins a private room to the outside or to a public room; exempt kinds are never checked. */
export function tierSkips(
  rooms: readonly CheckRoom[],
  edges: readonly CheckEdge[],
): readonly Check[] {
  const byId = new Map(rooms.map((room) => [room.id, room]))
  const found: Check[] = []
  for (const edge of edges) {
    for (const [near, far] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ] as const) {
      const room = byId.get(near)
      if (room?.tier !== 'private') continue
      const other = far === EXTERIOR ? null : byId.get(far)
      if (far !== EXTERIOR && other?.tier !== 'public') continue
      found.push({
        code: 'tier-skip',
        rooms: other ? [room.id, other.id] : [room.id],
        sentence: other
          ? `${room.name}, a private room, is joined to ${other.name}, a public one.`
          : `${room.name}, a private room, opens straight onto the outside.`,
        rule,
        source,
      })
    }
  }
  return found
}
