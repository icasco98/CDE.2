import type { Footprint } from '../../geometry'
import type { Commit, Plot, Room } from '../../model'
import type { RoomSizes } from '../zoning/defaults'

export type MassingViewProps = {
  readonly rooms: readonly Room[]
  readonly storeys: number
  readonly heights: readonly number[]
  readonly plot: Plot
  /** The sizes each room type is drawn and judged against, keyed by type id. */
  readonly sizes: ReadonlyMap<string, RoomSizes>
  /** The storey the Plan tab is showing: its prisms are lit and the others stand back. */
  readonly storey: number
  /** A room id, or nothing. The same selection the bubbles and the zoning read. */
  readonly selected: string | null
  readonly onSelect: (id: string | null) => void
  readonly onStorey: (storey: number) => void
  readonly onHeight: (storey: number, metres: number) => void
  readonly onPlace: (id: string, footprint: Footprint, commit: Commit) => void
  readonly onRefuse: (reason: string) => void
}
