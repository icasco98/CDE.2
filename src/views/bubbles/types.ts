import type { Commit, EdgeKind, Family, Plot, Site, Weights } from '../../model'
import type { Position } from '../../bubbles'
import type { StoreyCirculation } from '../../rulebook'

/** What a drag on a stair is answered with: its span is the program's to set, not the hand's. */
export const STAIR_STAYS = 'A stair does not change floors on its own; set its span in the program.'

export type BubbleRoom = {
  readonly id: string
  readonly name: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
  /** The room-type table's key, which the walls and the forces read. */
  readonly kind?: string
  /** From the room-type table where the program has one; without it every bubble takes the neutral fill. */
  readonly category?: string
  /** The room-type table's privacy tier, which the forces read when the user-requirements weight is up. */
  readonly tier?: string
}

export type BubbleLink = {
  readonly id: string
  readonly a: string
  readonly b: string
  readonly kind: EdgeKind
  readonly storey: number
  /** The rulebook row's own words, where the link came from the default connections. */
  readonly source?: string
}

export type BubblesViewProps = {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly storeys: number
  /** Each storey's hallway as the rulebook reads it: where one stands, and where one is wanted. */
  readonly circulation: readonly StoreyCirculation[]
  readonly plot: Plot
  /** The client's two site answers, which S4 and S5 read. */
  readonly site: Site
  /** The three families of forces, on the sheet beside the diagram they change. */
  readonly weights: Weights
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  readonly onMoveBubble: (id: string, at: Position, commit: Commit) => void
  /** The end of a drag: where the bubble came to rest, as one step to undo. */
  readonly onDropBubble: (id: string, at: Position) => void
  /** The storey a room stands on, from the button on the selected bubble. */
  readonly onSetStorey: (id: string, storey: number) => void
  readonly onPin: (id: string, pinned: boolean) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSetEdgeKind: (edgeId: string, kind: EdgeKind) => void
  readonly onRemoveRoom: (id: string) => void
  /** A hallway on this storey, sized by the circulation rule from the rooms standing there now. */
  readonly onAddHallway: (storey: number) => void
  readonly onSetWeight: (family: Family, weight: number) => void
  readonly onSelect: (id: string | null) => void
  /** A gesture the model will not have, said in the view's own words. */
  readonly onRefuse: (message: string) => void
}
