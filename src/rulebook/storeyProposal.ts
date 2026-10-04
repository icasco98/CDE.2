import type { Household } from '../model'
import { storeyFits, storeyLabel, type StoreyFit } from './fit'
import { defaultProgram, type ProgramZone } from './program'
import { zoneTypeById } from './sizes'
import { listedNames, metresIn } from './words'

/** A program read off the household, the storeys it is proposed on, and one sentence a decision. */
export type StoreyProposal = {
  readonly storeys: number
  readonly zones: readonly ProgramZone[]
  readonly reasons: readonly string[]
}

/** The ground's bare targets against its buildable area, as the Requirements totals read them. */
function groundOf(zones: readonly ProgramZone[], buildableM2: number, storeys: number): StoreyFit {
  return storeyFits(zones, buildableM2, storeys)[0]!
}

/**
 * The kinds that may follow the bedrooms up while the ground is still over: private zones the table
 * lets stand on either floor, largest first so the fewest move.
 */
function liftable(zones: readonly ProgramZone[]): readonly string[] {
  const onGround = zones.filter((zone) => {
    const kind = zoneTypeById(zone.type)
    return zone.storey === 0 && kind?.defaultStorey === 'any' && kind.tier === 'private'
  })
  const largest = [...onGround].sort((a, b) => b.targetArea - a.targetArea)
  return [...new Set(largest.map((zone) => zone.type))]
}

/**
 * The program the household implies, on a Ground and a First at least: the private zones the
 * zone-type table puts upstairs go up with their suites, a stair spans the storeys, and the rest
 * stays on the ground. The ground's targets are then read against its buildable area; while it is
 * over, a private zone the table lets stand on either floor follows the bedrooms up, largest first.
 * A project already on more storeys keeps them.
 */
export function proposeProgram(
  plotAreaM2: number,
  buildableM2: number,
  household: Household,
  storeys: number,
): StoreyProposal {
  const levels = Math.max(2, Math.trunc(storeys))
  const raised = new Set<string>()
  let zones = defaultProgram(plotAreaM2, household, levels, raised)
  // The zones a person asked for are named; the suites and hallways that come with them are not.
  const upstairs = zones.filter((zone) => {
    const flags = zoneTypeById(zone.type)?.flags
    return zone.storey > 0 && !flags?.auxiliary && !flags?.circulation
  })
  const reasons = [
    levels === 2
      ? `Two storeys, ${storeyLabel(0)} and ${storeyLabel(1)}: the house receives and serves on the ground and sleeps above it.`
      : `The project has ${levels} storeys; the house receives and serves on the ground and sleeps above it.`,
  ]
  if (upstairs.length > 0)
    reasons.push(
      `${storeyLabel(1)} takes the private zones the zone-type table puts upstairs: ${listedNames(upstairs.map((zone) => zone.name))}, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.`,
    )
  if (household.masterOnGround && household.bedrooms > 0)
    reasons.push('The master bedroom and its suite stay on the ground, as the household asks.')
  reasons.push(
    `A stair spans ${storeyLabel(0)} to ${storeyLabel(levels - 1)}, the one way between them.`,
  )

  for (const type of liftable(zones)) {
    const ground = groundOf(zones, buildableM2, levels)
    if (!ground.over) break
    raised.add(type)
    zones = defaultProgram(plotAreaM2, household, levels, raised)
    reasons.push(
      `${zoneTypeById(type)?.label ?? type} goes up too: the ground was over by ${metresIn(ground.difference)} m², and the table lets it stand on either floor.`,
    )
  }
  const ground = groundOf(zones, buildableM2, levels)
  const against = `${metresIn(ground.needed)} m² of targets on ${metresIn(ground.buildable)} m² buildable`
  reasons.push(
    ground.over
      ? `The ground is still over its buildable area: ${against}, over by ${metresIn(ground.difference)} m²; move zones up or reduce them.`
      : `The ground holds its program: ${against}, ${metresIn(ground.difference)} m² to spare.`,
  )
  return { storeys: levels, zones, reasons }
}
