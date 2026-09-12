import type { Point, Polygon } from '../geometry'
import type { Grid } from './grid'

/*
 * What the partition is asked and what it answers. The question is the bubble diagram as it
 * stands — where each bubble is, how big it is, what it touches — and the floor it stands on; the
 * answer is one orthogonal zone per room on the 0.25 m grid, with the links it could realize.
 */

/** A room as the partition reads one: its bubble, and the walls the rulebook has already put on it. */
export type PartitionRoom = {
  readonly id: string
  readonly name: string
  /** The room-type key, which the small-room rules and the garage run read. */
  readonly type: string
  readonly targetArea: number
  /** The least floor the room-type table admits for the kind, where it carries one, in m². */
  readonly minArea?: number
  /** Where the bubble stands, in plot metres. */
  readonly at: Point
  readonly radius: number
  /** How far a corridor's segment reaches from its middle; nought for every other room. */
  readonly half: number
  /** The way that segment lies, in radians. */
  readonly angle: number
  /** The stretch of the buildable line this room claimed, and the way in from it. */
  readonly kerb?: Kerb
  /** The room whose perimeter this one rides, where it is that room's companion. */
  readonly owner?: string
}

/** A stretch of the buildable line, and the way in from it. */
export type Kerb = { readonly from: Point; readonly to: Point; readonly inward: Point }

/** A link between two rooms of the storey, which the partition either gives a door or leaves open. */
export type PartitionLink = { readonly id: string; readonly a: string; readonly b: string }

export type PartitionInput = {
  readonly rooms: readonly PartitionRoom[]
  readonly links: readonly PartitionLink[]
  readonly plot: Polygon
  readonly buildable: Polygon
  /**
   * The rooms a person arrives in, the first of them first: the entry on the ground or the stair on
   * a floor above it, and then every room with its own street door. The corridor is laid from the
   * first of them, and a room no door reaches from any of them is a room the plan has shut off.
   */
  readonly arrivals: readonly string[]
  /** The stretch of the buildable line the cars come off, and the way in from it. */
  readonly street?: Kerb
}

/** One room's share of the floor: an orthogonal polygon on the grid, and what it measures. */
export type Zone = {
  readonly id: string
  readonly polygon: Polygon
  readonly areaM2: number
}

/** A link the zones realized: where the door goes on the wall they share, and how that wall runs. */
export type Door = {
  readonly linkId: string
  readonly at: Point
  readonly along: Point
}

/** A link the zones left open, with the one thing standing in its way. */
export type Tension = {
  readonly linkId: string
  readonly a: string
  readonly b: string
  readonly sentence: string
}

export type Partition = {
  readonly zones: readonly Zone[]
  readonly doors: readonly Door[]
  readonly tensions: readonly Tension[]
  /** Rooms with no way from the entry over the doors, by id. */
  readonly unreached: readonly string[]
  /** What the storey took past the buildable line, in m²; nought while it fits inside it. */
  readonly overflowM2: number
  /** The rings of that overflow, drawn hatched outside the line. */
  readonly spill: readonly Polygon[]
  /** Garage bays the frontage left with no straight run to the street, by id. */
  readonly blockedBays: readonly string[]
}

/** No cell belongs to a room until one is given it. */
export const NOBODY = -1

/** The floor being divided: who holds each cell, which cells are settled, and who may take which. */
export type Division = {
  readonly grid: Grid
  /** The room holding each cell, by index into the rooms, or `NOBODY`. */
  readonly owner: Int32Array
  /** A cell a wall put down and no reach may take: the corridor, a kerb claim, a seeded contact. */
  readonly fixed: Uint8Array
  /** The claim over each cell, by index into `claims`, or `NOBODY` where anyone may take it. */
  readonly claim: Int32Array
  /** For each claim, the rooms it is reserved to. */
  readonly claims: (readonly number[])[]
  /** Whether the storey's targets fit inside the buildable line, which is what lets a cell spill. */
  readonly fits: boolean
}
