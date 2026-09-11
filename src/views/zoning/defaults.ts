import { GRID_M, area, boundingBox, type Footprint } from '../../geometry'
import { byPlotBand, freeProportion, plotBandFor, type RoomType } from '../../rulebook'
import { metres2 } from '../requirements/format'

/** Width against depth for a kind whose table row leaves the proportion free. */
export const defaultProportion = 1.25

/** How far the live area may sit from the target before the label is a warning. */
const OFF_TARGET = 0.1

/** The sizes a footprint of one kind is drawn and judged against. */
export type RoomSizes = {
  /** Width : depth for a new footprint. */
  readonly proportion: number
  /** The smallest area the table admits for the kind. */
  readonly minArea?: number
  /** The Municipality's least width for the kind, where the table carries one. */
  readonly minWidth?: number
}

export function proportionOf(type: RoomType | undefined): number {
  if (!type || type.proportion === freeProportion) return defaultProportion
  return (type.proportion.min + type.proportion.max) / 2
}

function minAreaOf(type: RoomType | undefined, plotAreaM2: number): number | undefined {
  if (!type) return undefined
  if (type.range === byPlotBand) return plotBandFor(type.id, plotAreaM2)?.min
  if (typeof type.range === 'object') return type.range.min
  return undefined
}

export function sizesOf(type: RoomType | undefined, plotAreaM2: number): RoomSizes {
  const minArea = minAreaOf(type, plotAreaM2)
  const minWidth = type?.legalFloor?.width
  return {
    proportion: proportionOf(type),
    ...(minArea === undefined ? {} : { minArea }),
    ...(minWidth === undefined ? {} : { minWidth }),
  }
}

/** To the nearest grid line, so a small room is not pushed over its target by the rounding alone. */
function toGrid(value: number): number {
  return Math.max(GRID_M, Math.round(value / GRID_M) * GRID_M)
}

/**
 * The rectangle a room of `targetArea` opens at: the sides that hold that area at `proportion`,
 * each taken to the nearest grid line, and then, while that leaves the room under its target, a
 * grid step added to the longer side, which is the smaller of the two additions it could take.
 */
export function startingRectangle(
  targetArea: number,
  proportion: number,
): { readonly width: number; readonly depth: number } {
  const wanted = Math.max(GRID_M * GRID_M, targetArea)
  const shape = proportion > 0 ? proportion : 1
  let width = toGrid(Math.sqrt(wanted * shape))
  let depth = toGrid(Math.sqrt(wanted / shape))
  while (width * depth < wanted - 1e-9) {
    if (width >= depth) width += GRID_M
    else depth += GRID_M
  }
  return { width, depth }
}

export function offTarget(liveArea: number, targetArea: number): boolean {
  return Math.abs(liveArea - targetArea) > targetArea * OFF_TARGET
}

/**
 * Below what the kind admits, and which of the two it is: too little floor, or a side shorter
 * than the Municipality allows. The words come back rather than a bare false so a refusal can
 * say what it is refusing.
 */
export function underMinimum(footprint: Footprint, sizes: RoomSizes): string | null {
  if (sizes.minArea !== undefined && area(footprint.polygon) < sizes.minArea) {
    return `under its smallest ${metres2(sizes.minArea)} m²`
  }
  if (sizes.minWidth === undefined) return null
  const bounds = boundingBox(footprint.polygon)
  if (Math.min(bounds.width, bounds.depth) < sizes.minWidth) {
    return `narrower than the ${metres2(sizes.minWidth)} m the Municipality allows`
  }
  return null
}

export function belowMinimum(footprint: Footprint, sizes: RoomSizes): boolean {
  return underMinimum(footprint, sizes) !== null
}
