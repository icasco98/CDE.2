import { apartBroken } from './apart'
import { crossings } from './crossings'
import { noStair } from './stairs'
import { tierSkips } from './tierSkips'
import type { Check, CheckConnection, CheckPair, CheckRoom } from './types'
import { unreached } from './unreached'

/** Every warning the graph carries, read again on every edit; none of them changes the graph. */
export function graphChecks(input: {
  readonly rooms: readonly CheckRoom[]
  readonly connections: readonly CheckConnection[]
  readonly apart: readonly CheckPair[]
  readonly storeys: number
}): readonly Check[] {
  return [
    ...noStair(input.rooms, input.storeys),
    ...unreached(input.rooms, input.connections),
    ...tierSkips(input.rooms, input.connections),
    ...crossings(input.rooms, input.connections, input.storeys),
    ...apartBroken(input.rooms, input.connections, input.apart),
  ]
}
