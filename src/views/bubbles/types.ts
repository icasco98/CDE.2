import type { Commit, Plot } from '../../model'
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

export type BubbleLink = { readonly id: string; readonly a: string; readonly b: string }

export type BubblesViewProps = {
  readonly rooms: readonly BubbleRoom[]
  readonly edges: readonly BubbleLink[]
  readonly storeys: number
  readonly plot: Plot
  /** A room id, an edge id, or nothing. */
  readonly selected: string | null
  readonly onMoveBubble: (id: string, at: Position, commit: Commit) => void
  readonly onPin: (id: string, pinned: boolean) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onDisconnect: (edgeId: string) => void
  readonly onSelect: (id: string | null) => void
}
