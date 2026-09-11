import type { Commit, EdgeKind, Plot } from '../../model'
import type { Position } from '../../bubbles'

export type BubbleRoom = {
  readonly id: string
  readonly name: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly pinned: boolean
  readonly bubble?: Position
  /** From the room-type table where the program has one; without it every bubble takes the neutral fill. */
  readonly category?: string
}

export type BubbleLink = {
  readonly id: string
  readonly a: string
  readonly b: string
  readonly kind: EdgeKind
  readonly storey: number
}

/** A connection the rulebook offers and the graph does not hold: drawn faintly until a click takes it. */
export type BubbleProposal = {
  readonly a: string
  readonly b: string
  readonly kind: EdgeKind
  readonly storey: number
  readonly rowId: string
  /** The rulebook row's own words for why this connection belongs in the house. */
  readonly source: string
}

export type BubblesViewProps = {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly proposals: readonly BubbleProposal[]
  readonly storeys: number
  readonly plot: Plot
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  readonly onMoveBubble: (id: string, at: Position, commit: Commit) => void
  /**
   * The end of a drag: where the bubble came to rest and, when it landed in another band, the
   * storey that band gives it, as one step to undo. False when the storey was refused, so the
   * bubble is put back in the band it still belongs to.
   */
  readonly onDropBubble: (id: string, at: Position, storey?: number) => boolean
  readonly onPin: (id: string, pinned: boolean) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSetEdgeKind: (edgeId: string, kind: EdgeKind) => void
  readonly onRemoveRoom: (id: string) => void
  readonly onAccept: (proposal: BubbleProposal) => void
  /** Every proposal at once, as one step to undo. */
  readonly onAcceptAll: () => void
  readonly onSelect: (id: string | null) => void
  /** A gesture the model will not have, said in the view's own words. */
  readonly onRefuse: (message: string) => void
}
