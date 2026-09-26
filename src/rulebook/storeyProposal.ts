import type { Household } from '../model'
import { storeyFits, storeyLabel } from './fit'
import { defaultProgram, type ProgramRoom } from './program'
import { roomTypeById } from './sizes'
import { listedNames, metresIn } from './words'

/** A program read off the household, the storeys it is proposed on, and one sentence a decision. */
export type StoreyProposal = {
  readonly storeys: number
  readonly rooms: readonly ProgramRoom[]
  readonly reasons: readonly string[]
}

/**
 * What walls and slack add to the ground's target areas before they are read against the buildable
 * floor: the architect's decision (26 September 2026), provisional.
 */
const WALL_ALLOWANCE = 0.15

type GroundFit = { readonly needed: number; readonly over: boolean; readonly difference: number }

/** The ground's targets with the wall allowance, against its buildable area, to a tenth of a m². */
function groundOf(rooms: readonly ProgramRoom[], buildableM2: number, storeys: number): GroundFit {
  const targets = storeyFits(rooms, buildableM2, storeys)[0]!.needed
  const needed = Math.round(targets * (1 + WALL_ALLOWANCE) * 10) / 10
  const buildable = Math.round(buildableM2 * 10) / 10
  return {
    needed,
    over: needed > buildable,
    difference: Math.round(Math.abs(buildable - needed) * 10) / 10,
  }
}

/**
 * The kinds that may follow the bedrooms up while the ground is still over: private rooms the table
 * lets stand on either floor, largest first so the fewest move.
 */
function liftable(rooms: readonly ProgramRoom[]): readonly string[] {
  const onGround = rooms.filter((room) => {
    const kind = roomTypeById(room.type)
    return room.storey === 0 && kind?.defaultStorey === 'any' && kind.tier === 'private'
  })
  const largest = [...onGround].sort((a, b) => b.targetArea - a.targetArea)
  return [...new Set(largest.map((room) => room.type))]
}

/**
 * The program the household implies, on a Ground and a First at least: the private rooms the
 * room-type table puts upstairs go up with their suites, a stair spans the storeys, and the rest
 * stays on the ground. The ground is then read against its buildable area with the wall allowance;
 * while it is over, a private room the table lets stand on either floor follows the bedrooms up,
 * largest first. A project already on more storeys keeps them.
 */
export function proposeProgram(
  plotAreaM2: number,
  buildableM2: number,
  household: Household,
  storeys: number,
): StoreyProposal {
  const levels = Math.max(2, Math.trunc(storeys))
  const raised = new Set<string>()
  let rooms = defaultProgram(plotAreaM2, household, levels, raised)
  // The rooms a person asked for are named; the suites and hallways that come with them are not.
  const upstairs = rooms.filter((room) => {
    const flags = roomTypeById(room.type)?.flags
    return room.storey > 0 && !flags?.auxiliary && !flags?.circulation
  })
  const reasons = [
    levels === 2
      ? `Two storeys, ${storeyLabel(0)} and ${storeyLabel(1)}: the house receives and serves on the ground and sleeps above it.`
      : `The project has ${levels} storeys; the house receives and serves on the ground and sleeps above it.`,
  ]
  if (upstairs.length > 0)
    reasons.push(
      `${storeyLabel(1)} takes the private rooms the room-type table puts upstairs: ${listedNames(upstairs.map((room) => room.name))}, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.`,
    )
  if (household.masterOnGround && household.bedrooms > 0)
    reasons.push('The master bedroom and its suite stay on the ground, as the household asks.')
  reasons.push(
    `A stair spans ${storeyLabel(0)} to ${storeyLabel(levels - 1)}, the one way between them.`,
  )

  for (const type of liftable(rooms)) {
    const ground = groundOf(rooms, buildableM2, levels)
    if (!ground.over) break
    raised.add(type)
    rooms = defaultProgram(plotAreaM2, household, levels, raised)
    reasons.push(
      `${roomTypeById(type)?.label ?? type} goes up too: the ground was over by ${metresIn(ground.difference)} m² with walls allowed for, and the table lets it stand on either floor.`,
    )
  }
  const ground = groundOf(rooms, buildableM2, levels)
  const against = `${metresIn(ground.needed)} m² with ${WALL_ALLOWANCE * 100}% for walls, on ${metresIn(buildableM2)} m² buildable`
  reasons.push(
    ground.over
      ? `The ground is still over its buildable area: ${against}, over by ${metresIn(ground.difference)} m²; move rooms up or reduce them.`
      : `The ground holds its program: ${against}, ${metresIn(ground.difference)} m² to spare.`,
  )
  return { storeys: levels, rooms, reasons }
}
