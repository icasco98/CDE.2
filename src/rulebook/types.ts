export type RoomCategory = 'reception' | 'shared' | 'private' | 'service' | 'open'

export type RoomTier = 'public' | 'semi-public' | 'private' | 'exempt'

export type Band = { readonly min: number; readonly max: number }

export const byPlotBand = 'by plot band'
export const lengthAsNeeded = 'length as needed'
export const freeProportion = 'free'

/** A number of m², a width band in metres for a hallway, or a size read from the plot band. */
export type Typical = number | Band | typeof byPlotBand

export type SizeRange = Band | typeof byPlotBand | typeof lengthAsNeeded

/** What the Municipality will not let a room go below, and the section it comes from. */
export type LegalFloor = {
  readonly area?: number
  readonly width?: number
  readonly source: string
  readonly note?: string
}

/**
 * Where a kind opens when the program is rebuilt. `any` suits either floor, `all` stands on every
 * storey at once, which is what a stair and a lift do, and `top` is the roof.
 */
export type DefaultStorey = 'ground' | 'upper' | 'any' | 'all' | 'top'

export type RoomTypeFlags = {
  readonly circulation?: true
  readonly auxiliary?: true
  readonly optional?: true
  readonly notInRatio?: true
}

export type RoomType = {
  readonly id: string
  readonly label: string
  readonly arabic: string
  readonly legalFloor?: LegalFloor
  readonly typical: Typical
  readonly range: SizeRange
  readonly proportion: Band | typeof freeProportion
  readonly category: RoomCategory
  readonly tier: RoomTier
  readonly defaultStorey: DefaultStorey
  /** The kind this one brings with it, such as a bedroom's ensuite; it takes the room's storey. */
  readonly companion?: string
  readonly flags: RoomTypeFlags
  readonly basis: string
  /** Everything the table says about the kind that is not one of the flags. */
  readonly note?: string
  /** The garage's numbers are per car, not per room. */
  readonly perCar?: true
}
