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

const groundOf = (rooms: readonly ProgramRoom[], buildableM2: number, storeys: number) =>
  storeyFits(rooms, buildableM2, storeys)[0]!

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
 * The program the household implies, on as many storeys as it needs. It stays on one storey when the
 * ground holds it: the one-storey program, hallway included, against the floor the setbacks leave.
 * When it does not, a first storey is proposed: the bedrooms and their suites go up by the room-type
 * table and a stair spans the storeys; while the ground is still over, a private room the table lets
 * stand on either floor follows them up. A project already on more storeys keeps them.
 */
export function proposeProgram(
  plotAreaM2: number,
  buildableM2: number,
  household: Household,
  storeys: number,
): StoreyProposal {
  const current = Math.max(1, Math.trunc(storeys))
  const onOne = defaultProgram(plotAreaM2, household, 1)
  const one = groundOf(onOne, buildableM2, 1)
  const against = `${metresIn(one.needed)} m² of targets, hallway included, on ${metresIn(buildableM2)} m² buildable`
  if (current === 1 && !one.over)
    return {
      storeys: 1,
      rooms: onOne,
      reasons: [
        `The whole program fits on one storey: ${against}, ${metresIn(one.difference)} m² to spare.`,
      ],
    }

  const levels = Math.max(current, 2)
  const reasons = [
    current === 1
      ? `The program does not fit on one storey: ${against}, over by ${metresIn(one.difference)} m². A First storey is proposed.`
      : `The project has ${levels} storeys, so the program is spread over them.`,
  ]
  const raised = new Set<string>()
  let rooms = defaultProgram(plotAreaM2, household, levels, raised)
  // The rooms a person asked for are named; the suites and hallways that come with them are not.
  const upstairs = rooms.filter((room) => {
    const flags = roomTypeById(room.type)?.flags
    return room.storey > 0 && !flags?.auxiliary && !flags?.circulation
  })
  if (upstairs.length > 0)
    reasons.push(
      `${storeyLabel(1)} takes the private zone the room-type table puts upstairs: ${listedNames(upstairs.map((room) => room.name))}, with their suites. Reception, diwaniya, kitchen, service and garage stay on the ground.`,
    )
  if (household.masterOnGround)
    reasons.push('The master bedroom stays on the ground, as the household asks.')
  reasons.push(
    `A stair spans ${storeyLabel(0)} to ${storeyLabel(levels - 1)}, the one way between them.`,
  )

  for (const type of liftable(rooms)) {
    const ground = groundOf(rooms, buildableM2, levels)
    if (!ground.over) break
    raised.add(type)
    rooms = defaultProgram(plotAreaM2, household, levels, raised)
    reasons.push(
      `${roomTypeById(type)?.label ?? type} goes up too: the ground was still over by ${metresIn(ground.difference)} m², and the table lets it stand on either floor.`,
    )
  }
  const ground = groundOf(rooms, buildableM2, levels)
  reasons.push(
    ground.over
      ? `The ground is still over its buildable area by ${metresIn(ground.difference)} m²; move rooms up or reduce them.`
      : `The ground now holds ${metresIn(ground.needed)} m² of ${metresIn(ground.buildable)} m² buildable.`,
  )
  return { storeys: levels, rooms, reasons }
}
