import { roomTypes } from './roomTypes'
import { byPlotBand, type Band, type RoomCategory, type RoomType } from './types'

/** The bands rulebook/room-types.md gives for the diwaniya and the two living rooms. */
const plotBands: readonly {
  readonly upTo: number
  readonly bands: Readonly<Record<string, Band>>
}[] = [
  {
    upTo: 400,
    bands: {
      diwaniya: { min: 35, max: 45 },
      'formal-living': { min: 24, max: 30 },
      'family-living': { min: 24, max: 32 },
    },
  },
  {
    upTo: 750,
    bands: {
      diwaniya: { min: 45, max: 60 },
      'formal-living': { min: 30, max: 40 },
      'family-living': { min: 32, max: 45 },
    },
  },
  {
    upTo: Infinity,
    bands: {
      diwaniya: { min: 60, max: 90 },
      'formal-living': { min: 40, max: 55 },
      'family-living': { min: 45, max: 60 },
    },
  },
]

/** A hallway has a width, not an area, so a new one opens as its narrowest typical width over 8 m. */
const hallwayRun = 8

const fallback = 'room-other'

const byId: ReadonlyMap<string, RoomType> = new Map(roomTypes.map((type) => [type.id, type]))

const categoryOrder: readonly RoomCategory[] = ['reception', 'shared', 'private', 'service', 'open']

export const categoryLabels: Readonly<Record<RoomCategory, string>> = {
  reception: 'Reception',
  shared: 'Shared',
  private: 'Private',
  service: 'Service',
  open: 'Open',
}

export function roomTypeById(id: string): RoomType | undefined {
  return byId.get(id)
}

/** A stair and a lift stand on every storey they serve, so the table gives them every storey. */
export function spansAllStoreys(kindId: string): boolean {
  return byId.get(kindId)?.defaultStorey === 'all'
}

export function plotBandFor(kindId: string, plotAreaM2: number): Band | undefined {
  const row = plotBands.find((entry) => plotAreaM2 <= entry.upTo) ?? plotBands[plotBands.length - 1]
  return row?.bands[kindId]
}

/** What a new room of this kind gets: the table's typical, or the middle of its plot band. */
export function typicalArea(kindId: string, plotAreaM2: number): number {
  const type = byId.get(kindId) ?? byId.get(fallback)
  if (!type) return 0
  const { typical } = type
  if (typical === byPlotBand) {
    const band = plotBandFor(type.id, plotAreaM2)
    return band ? (band.min + band.max) / 2 : 0
  }
  if (typeof typical === 'number') return typical
  return typical.min * hallwayRun
}

export function typesByCategory(): readonly (readonly [RoomCategory, readonly RoomType[]])[] {
  return categoryOrder.map((category) => [
    category,
    roomTypes.filter((type) => type.category === category),
  ])
}
