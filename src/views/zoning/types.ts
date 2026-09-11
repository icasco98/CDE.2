import type { Footprint } from '../../geometry'
import type { Commit, Edge, EdgeKind, Endpoint, Plot, Room } from '../../model'
import type { RoomSizes } from './defaults'

/** A room and the footprint one gesture leaves it with. */
export type Placement = { readonly id: string; readonly footprint: Footprint }

export type ZoningViewProps = {
  /** The project in hand: what a room was before its last carve is forgotten when another opens. */
  readonly projectId: string
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly storeys: number
  /** The storey being drawn. The Plan tab holds it, so the sheet and the massing show the same one. */
  readonly storey: number
  readonly plot: Plot
  /** The sizes each room type is drawn and judged against, keyed by type id. */
  readonly sizes: ReadonlyMap<string, RoomSizes>
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  readonly onPlace: (id: string, footprint: Footprint, commit: Commit) => void
  /** Several rooms as one step to undo: a carve, or a wall moved between two rooms. */
  readonly onPlaceAll: (placements: readonly Placement[]) => void
  readonly onUnplace: (id: string) => void
  readonly onPin: (id: string, pinned: boolean) => void
  readonly onConnect: (a: Endpoint, b: Endpoint, storey: number) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSelect: (id: string | null) => void
  readonly onStorey: (storey: number) => void
  /** Changes a connection between a door and an opening in place; the edge keeps its identity. */
  readonly onSetEdgeKind: (edgeId: string, kind: EdgeKind) => void
  readonly onRefuse: (reason: string) => void
}
