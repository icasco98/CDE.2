import type { Footprint, Point, Polygon } from '../geometry/types'

export const EXTERIOR = 'EXTERIOR'

/** The document format; a bump needs a migration in persistence.ts. */
export const PROJECT_VERSION = 1

export type EdgeKind = 'door' | 'open' | 'main-door'

/** A room id, or the singleton outside. */
export type Endpoint = string

export type Bubble = { readonly x: number; readonly y: number }

/** Where a door was last drawn on a wall; losing it changes nothing. */
export type WallHint = { readonly at: Point }

export type Plot = {
  /** Where the plot is, as the person writes it: a block and plot number, an address. */
  readonly on: string
  readonly polygon: Polygon
  /** Degrees from up on the sheet, clockwise. */
  readonly north: number
  /** Indices of the polygon sides that face a street, side `i` running from vertex `i` to `i + 1`. */
  readonly street: readonly number[]
}

export type Room = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
  readonly bubble?: Bubble
  readonly footprint?: Footprint
  readonly pinned: boolean
}

export type Edge = {
  readonly id: string
  readonly a: Endpoint
  readonly b: Endpoint
  readonly kind: EdgeKind
  readonly storey: number
  readonly hint?: WallHint
}

/** One number per force; the forces themselves are not defined yet. */
export type Weights = Readonly<Record<string, number>>

export type Actor = {
  readonly id: string
  readonly name: string
  readonly role: string
  /** Room ids, in the order the actor passes through them. */
  readonly waypoints: readonly string[]
}

export type Project = {
  readonly id: string
  readonly name: string
  readonly storeys: number
  readonly plot: Plot
  readonly rooms: readonly Room[]
  readonly edges: readonly Edge[]
  readonly weights: Weights
  readonly actors: readonly Actor[]
  readonly version: number
}

export type Violation = { readonly code: string; readonly message: string }

export type Result<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Violation[] }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function refused(...problems: readonly Violation[]): Result<never> {
  return { ok: false, problems }
}
