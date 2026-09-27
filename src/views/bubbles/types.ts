import type { Check } from '../../graph/types'
import type { Bubble, Commit, EdgeKind } from '../../model'
import type { PairChoice } from './setPair'

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
  /** The rulebook row that wants this pair, in its own words; absent for a pair added by hand. */
  readonly source?: string
}

export type BubbleApart = { readonly id: string; readonly a: string; readonly b: string }

/** What a drag from one room's ring to another makes: a connection, or a pair kept apart. */
export type DragMakes = 'connect' | 'apart'

export type BubblesViewProps = {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly apart: readonly BubbleApart[]
  /** The suggested connections the person took out, which Restore brings back. */
  readonly declined: readonly { readonly a: string; readonly b: string }[]
  readonly storeys: number
  /** The graph's warnings, read again on every edit. */
  readonly checks: readonly Check[]
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  /** The storeys that still want a hallway, each with the rule's sentence saying why. */
  readonly hallwayWanted: readonly { readonly storey: number; readonly sentence: string }[]
  readonly onNudge: (id: string, nudge: Bubble, commit: Commit) => void
  readonly onSetStorey: (id: string, storey: number) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onKeepApart: (a: string, b: string) => void
  readonly onAllowTogether: (id: string) => void
  /** One cell of the matrix set, as one undo step. */
  readonly onSetPair: (a: string, b: string, choice: PairChoice) => void
  readonly onSetEdgeKind: (edgeId: string, kind: EdgeKind) => void
  readonly onRemoveRoom: (id: string) => void
  readonly onAddHallway: (storey: number) => void
  /** The declined suggestions made again: every one, or one room's. */
  readonly onRestore: (room?: string) => void
  readonly onSelect: (id: string | null) => void
  /** A gesture the model will not have, said in the view's own words. */
  readonly onRefuse: (message: string) => void
}
