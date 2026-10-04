import { storeyLabel } from './fit'
import { zoneTypes } from './zoneTypes'
import { zoneTypeById } from './sizes'
import { inWords } from './words'

/** A zone as the circulation rule reads one: its kind, where it stands, and how much floor it takes. */
export type CirculationZone = {
  readonly type: string
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
}

/** What one storey's circulation comes to: the hallway it has, and the words for the one it wants. */
export type StoreyCirculation = {
  readonly storey: number
  readonly hasHallway: boolean
  /** Why the rule wants a hallway here, as the nudge says it; absent when the storey wants none or holds one. */
  readonly wanted?: string
}

/**
 * The Circulation section of rulebook/zone-types.md, which stays the text a person reads. The
 * share, the floor and the ceiling are provisional judgement; the 1.20 m clear width is legal and
 * sits with the other legal floors, in the hallway's own row of the zone-type table.
 */
export const circulationRule = {
  /** Ten per cent: the middle of the 8 to 12 per cent published plans show. */
  share: 0.1,
  /** 1.20 m clear over a 5 m run; below it the space is a landing, not a corridor. */
  floor: 6,
  /** About 1.8 m over 17 m; past it a floor wants a second hallway, not a longer one. */
  ceiling: 30,
} as const

/** The kinds some other kind brings with it, which are entered through the zone they serve. */
const companionKinds: ReadonlySet<string> = new Set(
  zoneTypes.flatMap((type) => (type.companion === undefined ? [] : [type.companion])),
)

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** A stair stands on every floor it reaches, so it is on each of them for this rule as for any other. */
function standsOn(zone: CirculationZone, storey: number): boolean {
  const span = Math.max(1, Math.trunc(zone.storeysSpanned))
  return storey >= zone.storey && storey < zone.storey + span
}

/** A zone the corridor leads to: circulation joins circulation, and what the ratio leaves out is not floor. */
function isServed(zone: CirculationZone): boolean {
  const flags = zoneTypeById(zone.type)?.flags
  return !flags?.circulation && !flags?.notInRatio
}

function onStorey(zones: readonly CirculationZone[], storey: number): readonly CirculationZone[] {
  return zones.filter((zone) => standsOn(zone, storey))
}

/** The target area a hallway on this storey takes: the share of what it serves, inside the two bounds. */
export function hallwayArea(zones: readonly CirculationZone[], storey: number): number {
  const served = onStorey(zones, storey)
    .filter(isServed)
    .reduce((total, zone) => total + Math.max(zone.targetArea, 0), 0)
  const share = served * circulationRule.share
  return round(Math.min(Math.max(share, circulationRule.floor), circulationRule.ceiling))
}

/**
 * Why this storey wants a hallway, or nothing when it does not: two private zones are two zones
 * reached without walking through the other, and a stair with anything off it is the same corridor
 * at its shortest. A companion is entered through the zone it serves and asks for no corridor.
 */
function wantsHallway(zones: readonly CirculationZone[], storey: number): string | undefined {
  const here = onStorey(zones, storey)
  const privateZones = here.filter((zone) => zoneTypeById(zone.type)?.tier === 'private')
  if (privateZones.length >= 2)
    return `${storeyLabel(storey)} has ${inWords(privateZones.length)} private zones and no hallway.`
  const stair = here.some((zone) => zone.type === 'stair')
  const offIt = here.some((zone) => zone.type !== 'stair' && !companionKinds.has(zone.type))
  return stair && offIt ? `${storeyLabel(storey)} has a stair and no hallway.` : undefined
}

export function needsHallway(zones: readonly CirculationZone[], storey: number): boolean {
  return wantsHallway(zones, storey) !== undefined
}

/**
 * Where a hallway stands in the program: behind the stair that serves its storey, behind the entry
 * where there is no stair, and on the end where there is neither. Rebuilding the program and adding
 * one by hand read this same rule, so two programs holding the same zones read the same way. The
 * answer is the place in the list the hallway takes, so it is one past the zone it follows, and
 * past any hallway of a lower storey already standing there, which keeps the corridors in the
 * order of their floors.
 */
export function hallwayFollows(zones: readonly CirculationZone[], storey: number): number {
  const stair = zones.findIndex((zone) => zone.type === 'stair' && standsOn(zone, storey))
  const entry = zones.findIndex((zone) => zone.type === 'entry-foyer')
  const behind = stair >= 0 ? stair : entry
  if (behind < 0) return zones.length
  let at = behind + 1
  while (zones[at]?.type === 'hallway' && (zones[at]?.storey ?? storey) < storey) at++
  return at
}

/** What a hallway is called: one house-wide corridor needs no storey in its name, several do. */
export function hallwayName(storey: number, storeys: number): string {
  return storeys > 1 ? `${storeyLabel(storey)} Hallway` : 'Hallway'
}

/** Each storey's circulation as the Bubbles tab reads it: where a hallway is, and where one is wanted. */
export function circulationPerStorey(
  zones: readonly CirculationZone[],
  storeys: number,
): readonly StoreyCirculation[] {
  const levels = Math.max(1, Math.trunc(storeys))
  return Array.from({ length: levels }, (_unused, storey) => {
    const hasHallway = onStorey(zones, storey).some((zone) => zone.type === 'hallway')
    const wanted = hasHallway ? undefined : wantsHallway(zones, storey)
    return { storey, hasHallway, ...(wanted === undefined ? {} : { wanted }) }
  })
}
