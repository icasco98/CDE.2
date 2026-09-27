import type { EdgeKind, Endpoint } from '../model'

/** A room as the checks read one: who it is, which storeys it stands on, and its privacy tier. */
export type CheckRoom = {
  readonly id: string
  readonly name: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly tier?: string
}

export type CheckEdge = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: EdgeKind
  readonly storey: number
}

export type CheckPair = { readonly a: string; readonly b: string }

/** One warning on the graph, with the rule it reads and where that rule comes from. */
export type Check = {
  readonly code:
    'no-stair' | 'unreached' | 'tier-skip' | 'crossing' | 'apart-joined' | 'apart-through'
  /** The rooms it is about, so a view can point at them. */
  readonly rooms: readonly string[]
  readonly sentence: string
  readonly rule: string
  readonly source: string
}
