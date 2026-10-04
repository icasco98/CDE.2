import { apartBroken } from './apart'
import { crossings } from './crossings'
import { noStair } from './stairs'
import { tierSkips } from './tierSkips'
import type { Check, CheckConnection, CheckPair, CheckZone } from './types'
import { unreached } from './unreached'

/** Every warning the graph carries, read again on every edit; none of them changes the graph. */
export function graphChecks(input: {
  readonly zones: readonly CheckZone[]
  readonly connections: readonly CheckConnection[]
  readonly apart: readonly CheckPair[]
  readonly storeys: number
}): readonly Check[] {
  return [
    ...noStair(input.zones, input.storeys),
    ...unreached(input.zones, input.connections),
    ...tierSkips(input.zones, input.connections),
    ...crossings(input.zones, input.connections, input.storeys),
    ...apartBroken(input.zones, input.connections, input.apart),
  ]
}
