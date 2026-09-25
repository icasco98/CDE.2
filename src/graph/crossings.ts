import { EXTERIOR } from '../model'
import { storeyLabel } from '../rulebook/fit'
import { isPlanar, type Pair } from '../rulebook/planarity'
import type { Check, CheckEdge, CheckRoom } from './types'

const rule =
  "A storey's edges can be drawn without one crossing another, or some pair can never share a wall."
const source = "Planarity by Demoucron's test, as the brief check reads it (decision 21)."

function standsOn(room: CheckRoom, storey: number): boolean {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return storey >= room.storey && storey < room.storey + span
}

/**
 * Every storey whose edges cannot be drawn without crossing. The outside is one more node, because
 * every room with a door to it must lie on the plan's outer edge.
 */
export function crossings(
  rooms: readonly CheckRoom[],
  edges: readonly CheckEdge[],
  storeys: number,
): readonly Check[] {
  const found: Check[] = []
  for (let storey = 0; storey < Math.max(1, Math.trunc(storeys)); storey++) {
    const here = rooms.filter((room) => standsOn(room, storey)).map((room) => room.id)
    const known = new Set([...here, EXTERIOR])
    const pairs: Pair[] = edges
      .filter((edge) => edge.storey === storey && known.has(edge.a) && known.has(edge.b))
      .map((edge) => [edge.a, edge.b])
    if (here.length === 0 || isPlanar([...here, EXTERIOR], pairs)) continue
    found.push({
      code: 'crossing',
      rooms: [],
      sentence: `${storeyLabel(storey)}: its edges cannot all be drawn without one crossing another.`,
      rule,
      source,
    })
  }
  return found
}
