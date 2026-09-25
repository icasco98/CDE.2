import type { Bubble, Commit, EdgeKind } from '../../model'

/** What a drag on a stair is answered with: its span is the program's to set, not the hand's. */
export const STAIR_STAYS = 'A stair does not change floors on its own; set its span in the program.'

export type BubbleRoom = {
  readonly id: string
  readonly name: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly bubble?: Bubble
  /** From the room-type table where the program has one; without it the bubble takes the neutral fill. */
  readonly category?: string
  /** The room-type table's privacy tier, which picks the band the bubble stands in. */
  readonly tier?: string
}

export type BubbleLink = {
  readonly id: string
  readonly a: string
  readonly b: string
  readonly kind: EdgeKind
  readonly storey: number
}

export type BubblesViewProps = {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly storeys: number
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  /** The storeys that still want a hallway, each with the rule's sentence saying why. */
  readonly hallwayWanted: readonly { readonly storey: number; readonly sentence: string }[]
  readonly onNudge: (id: string, nudge: Bubble, commit: Commit) => void
  readonly onSetStorey: (id: string, storey: number) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSetEdgeKind: (edgeId: string, kind: EdgeKind) => void
  readonly onRemoveRoom: (id: string) => void
  readonly onAddHallway: (storey: number) => void
  readonly onSelect: (id: string | null) => void
  /** A gesture the model will not have, said in the view's own words. */
  readonly onRefuse: (message: string) => void
}
