import type { Plot, Room } from '../../model'

export type MassingViewProps = {
  readonly rooms: readonly Room[]
  readonly storeys: number
  readonly heights: readonly number[]
  readonly plot: Plot
  /** A room id, or nothing. The same selection the bubbles and the zoning read. */
  readonly selected: string | null
  readonly onSelect: (id: string | null) => void
  readonly onHeight: (storey: number, metres: number) => void
}
