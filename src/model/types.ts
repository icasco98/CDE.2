import type { Footprint, Point, Polygon } from '../geometry/types'

export const EXTERIOR = 'EXTERIOR'

/** The document format; a bump needs a migration in persistence.ts. */
export const PROJECT_VERSION = 2

export type EdgeKind = 'door' | 'open' | 'main-door'

/** A room id, or the singleton outside. */
export type Endpoint = string

export type Bubble = { readonly x: number; readonly y: number }

/** Where a door was last drawn on a wall; losing it changes nothing. */
export type WallHint = { readonly at: Point }

export type Plot = {
  /** Whether the boundary binds: rooms are held inside it and setbacks apply, or it is drawn for reference only. */
  readonly on: boolean
  readonly polygon: Polygon
  /** Degrees from up on the sheet, clockwise. */
  readonly north: number
  /** Indices of the polygon sides that face a street, side `i` running from vertex `i` to `i + 1`. */
  readonly street: readonly number[]
}

/** Who the house is for; the program screen reads the rooms it implies from it. */
export type Household = {
  readonly familySize: number
  readonly bedrooms: number
  readonly cars: number
  readonly maid: boolean
  readonly driver: boolean
  readonly womensReception: boolean
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
  readonly household: Household
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
