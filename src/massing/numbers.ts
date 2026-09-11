import {
  area,
  differencePolygons,
  outlineOf,
  unionPolygons,
  type Piece,
  type Polygon,
} from '../geometry'
import { occupiedStoreys, type Room } from '../model'

/** Kuwait Municipality, private and model housing, building ratio: 210% of a plot of 401 m² or more. */
export const PLOT_RATIO_PERCENT = 210

/** Municipality heights: 15 m from the average kerb level to the roof of the second floor. */
export const MAX_BUILDING_HEIGHT_M = 15

/** Municipality heights: 3 m clear. Floor-to-floor is measured against it, which is the generous reading. */
export const MIN_CLEAR_HEIGHT_M = 3

export type StoreyNumbers = {
  readonly storey: number
  readonly height: number
  readonly floorArea: number
  readonly outlineArea: number
  readonly outlinePerimeter: number
}

export type Envelope = {
  readonly perStorey: readonly StoreyNumbers[]
  readonly grossFloorArea: number
  readonly plotRatioPercent: number
  readonly wallArea: number
  readonly roofArea: number
  readonly volume: number
  readonly surfaceToVolume: number
  readonly buildingHeight: number
}

/** What each number is, in one sentence, for the reader who wants to check it. */
export const formulas = {
  floorArea: 'The footprints placed on this storey, added up.',
  outlineArea:
    'The area the storey covers: its footprints joined into one outline, holes taken out.',
  outlinePerimeter: 'The length of that outline, courtyard walls counted with the outer walls.',
  grossFloorArea: 'Every storey’s floor area added up.',
  plotRatioPercent: 'Gross floor area as a percentage of the plot area.',
  wallArea: 'Each storey’s outline perimeter times that storey’s height, added up.',
  roofArea:
    'Each storey’s outline less what the storey above covers, plus the whole outline of the top storey.',
  volume: 'Each storey’s outline area times that storey’s height, added up.',
  surfaceToVolume: 'Wall area plus roof area, divided by volume.',
  buildingHeight: 'Every storey’s floor-to-floor height added up.',
} as const

function regionArea(pieces: readonly Piece[]): number {
  let total = 0
  for (const piece of pieces) {
    const [outer, ...holes] = piece
    if (!outer) continue
    total += area(outer)
    for (const hole of holes) total -= area(hole)
  }
  return total
}

function ringLength(ring: Polygon): number {
  let total = 0
  for (let corner = 0; corner < ring.length; corner += 1) {
    const here = ring[corner]
    const next = ring[(corner + 1) % ring.length]
    if (!here || !next) continue
    total += Math.hypot(next[0] - here[0], next[1] - here[1])
  }
  return total
}

/** What this storey covers and the one above does not: the flat roof it is left with. */
function uncovered(here: readonly Piece[], above: readonly Polygon[]): number {
  let total = 0
  for (const piece of here) {
    const [outer, ...holes] = piece
    if (!outer) continue
    total += regionArea(differencePolygons(outer, [...holes, ...above]))
  }
  return total
}

function outlinesOn(rooms: readonly Room[], storey: number): readonly Polygon[] {
  const here: Polygon[] = []
  for (const room of rooms) {
    const footprint = room.footprint
    if (!footprint || !occupiedStoreys(room).includes(storey)) continue
    here.push(outlineOf(footprint))
  }
  return here
}

/** The envelope numbers beside the drawing. Each one's formula is in `formulas`, keyed by its name. */
export function envelopeOf(input: {
  readonly rooms: readonly Room[]
  readonly storeys: number
  readonly heights: readonly number[]
  readonly plotArea: number
}): Envelope {
  const { rooms, heights, plotArea } = input
  const storeys = Math.max(0, Math.min(input.storeys, heights.length))

  const shapes: (readonly Polygon[])[] = []
  const regions: Piece[][] = []
  const perStorey: StoreyNumbers[] = []
  for (let storey = 0; storey < storeys; storey += 1) {
    const here = outlinesOn(rooms, storey)
    const region = unionPolygons(here)
    shapes.push(here)
    regions.push(region)
    perStorey.push({
      storey,
      height: heights[storey] ?? 0,
      floorArea: here.reduce((sum, shape) => sum + area(shape), 0),
      outlineArea: regionArea(region),
      outlinePerimeter: region.flat().reduce((sum, ring) => sum + ringLength(ring), 0),
    })
  }

  let wallArea = 0
  let volume = 0
  let roofArea = 0
  perStorey.forEach((numbers, storey) => {
    wallArea += numbers.outlinePerimeter * numbers.height
    volume += numbers.outlineArea * numbers.height
    roofArea +=
      storey === storeys - 1
        ? numbers.outlineArea
        : uncovered(regions[storey] ?? [], shapes[storey + 1] ?? [])
  })

  const grossFloorArea = perStorey.reduce((sum, numbers) => sum + numbers.floorArea, 0)
  const buildingHeight = heights.slice(0, storeys).reduce((sum, height) => sum + height, 0)
  return {
    perStorey,
    grossFloorArea,
    plotRatioPercent: plotArea > 0 ? (grossFloorArea / plotArea) * 100 : 0,
    wallArea,
    roofArea,
    volume,
    surfaceToVolume: volume > 0 ? (wallArea + roofArea) / volume : 0,
    buildingHeight,
  }
}
