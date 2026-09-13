import { storeyLabel } from './fit'
import { allowedFloorArea } from './ratio'
import { rangeFor } from './sizes'
import { metresIn } from './words'

/*
 * The other direction of decision 19: a room a hand has made larger than its kind allows, or
 * smaller, and a storey or a house made larger than the plot or the Municipality's ratio allows,
 * are named rather than refused. Nothing here writes anything down; it reads what is drawn and
 * says what the limit is.
 */

/** A placed room as the check reads one: what kind it is, and what its footprint measures. */
export type MeasuredRoom = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly areaM2: number
}

/** One room past the range of its kind, and the sentence that names the limit it passed. */
export type SizeSaid = { readonly id: string; readonly sentence: string }

/** To a tenth of a m², so a rounding in the last decimal of a polygon never names a limit. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Every room whose footprint stands past the top of its kind's range or under its bottom, in the
 * order it was given, which is the order of the program. A kind the table gives no range — the
 * hallway — is never measured against one.
 */
export function pastRange(rooms: readonly MeasuredRoom[], plotAreaM2: number): readonly SizeSaid[] {
  const said: SizeSaid[] = []
  for (const room of rooms) {
    const range = rangeFor(room.type, plotAreaM2)
    if (!range) continue
    const measured = round(room.areaM2)
    const is = `${room.name} is ${metresIn(measured)} m²`
    if (measured > round(range.max)) {
      said.push({ id: room.id, sentence: `${is}, the range ends at ${metresIn(range.max)}.` })
    } else if (measured < round(range.min)) {
      said.push({ id: room.id, sentence: `${is}, the range starts at ${metresIn(range.min)}.` })
    }
  }
  return said
}

/**
 * What the storey and the house come to against the floor they are allowed: the setbacks for the
 * one, the Municipality's building ratio for the other. Both are said where both are passed,
 * because they are two different walls and a person fixes them differently.
 */
export function pastAllowed(input: {
  readonly storey: number
  readonly storeyAreaM2: number
  readonly buildableM2: number
  /** Every placed room on every storey, a room counted on each storey it stands on. */
  readonly houseAreaM2: number
  readonly plotAreaM2: number
}): readonly string[] {
  const said: string[] = []
  const storeyArea = round(input.storeyAreaM2)
  const buildable = round(input.buildableM2)
  if (storeyArea > buildable) {
    said.push(
      `${storeyLabel(input.storey)} is ${metresIn(storeyArea)} m² on ${metresIn(buildable)} m² buildable.`,
    )
  }
  const house = round(input.houseAreaM2)
  const allowed = round(allowedFloorArea(input.plotAreaM2))
  if (house > allowed) {
    said.push(`The house is ${metresIn(house)} m² of floor, the ratio allows ${metresIn(allowed)}.`)
  }
  return said
}
