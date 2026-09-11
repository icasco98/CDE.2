import type { Footprint } from '../../geometry'
import type { Commit, Edge, Endpoint, Plot, Room } from '../../model'
import type { RoomSizes } from './defaults'

/** A room and the footprint one gesture leaves it with. */
export type Placement = { readonly id: string; readonly footprint: Footprint }

export type ZoningViewProps = {
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly storeys: number
  readonly plot: Plot
  /** The sizes each room type is drawn and judged against, keyed by type id. */
  readonly sizes: ReadonlyMap<string, RoomSizes>
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  readonly onPlace: (id: string, footprint: Footprint, commit: Commit) => void
  /** A carve: the cutter and every room it cut, as one step. */
  readonly onCarve: (placements: readonly Placement[]) => void
  readonly onUnplace: (id: string) => void
  readonly onPin: (id: string, pinned: boolean) => void
  readonly onConnect: (a: Endpoint, b: Endpoint, storey: number) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSelect: (id: string | null) => void
  readonly onRefuse: (reason: string) => void
}
