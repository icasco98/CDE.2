import type { ConnectionKind, Endpoint } from '../model'

/** A zone as the checks read one: who it is, which storeys it stands on, and its privacy tier. */
export type CheckZone = {
  readonly id: string
  readonly name: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly tier?: string
}

export type CheckConnection = {
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: ConnectionKind
  readonly storey: number
}

export type CheckPair = { readonly a: string; readonly b: string }

/** One warning on the graph, with the rule it reads and where that rule comes from. */
export type Check = {
  readonly code:
    'no-stair' | 'unreached' | 'tier-skip' | 'crossing' | 'apart-joined' | 'apart-through'
  /** The zones it is about, so a view can point at them. */
  readonly zones: readonly string[]
  readonly sentence: string
  readonly rule: string
  readonly source: string
}
