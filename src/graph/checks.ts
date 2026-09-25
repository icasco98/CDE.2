import { apartBroken } from './apart'
import { crossings } from './crossings'
import { tierSkips } from './tierSkips'
import type { Check, CheckEdge, CheckPair, CheckRoom } from './types'
import { unreached } from './unreached'

/** Every warning the graph carries, read again on every edit; none of them changes the graph. */
export function graphChecks(input: {
  readonly rooms: readonly CheckRoom[]
  readonly edges: readonly CheckEdge[]
  readonly apart: readonly CheckPair[]
  readonly storeys: number
}): readonly Check[] {
  return [
    ...unreached(input.rooms, input.edges),
    ...tierSkips(input.rooms, input.edges),
    ...crossings(input.rooms, input.edges, input.storeys),
    ...apartBroken(input.rooms, input.edges, input.apart),
  ]
}
