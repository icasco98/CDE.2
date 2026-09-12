/** The storeys are named the same way wherever a house is read: the program, the sheets, the export. */
const named = ['Ground', 'First', 'Second']

export function storeyLabel(storey: number): string {
  return named[storey] ?? `Storey ${storey}`
}

/** A room as the fit reads one: what it asks for and which floors it stands on. */
export type FitRoom = {
  readonly storey: number
  readonly storeysSpanned: number
  readonly targetArea: number
}

export type StoreyFit = {
  readonly storey: number
  /** The target areas standing on this floor, a stair counted on every floor it passes through. */
  readonly needed: number
  readonly buildable: number
  readonly over: boolean
  /** What is left over, or what is missing when the storey is over, always a positive number. */
  readonly difference: number
}

/** To a tenth of a m², which is as fine as a target area is ever read. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** The same spelling of a number of m² the program table uses: a tenth, and no trailing nought. */
function metres2(value: number): string {
  return String(round(value))
}

function storeysOf(room: FitRoom): readonly number[] {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return Array.from({ length: span }, (_unused, above) => room.storey + above)
}

/**
 * What each storey's targets come to against the floor it has to stand on. This is a fit of areas,
 * not a layout: it says whether a storey can hold its program at all, before a bubble is moved.
 */
export function storeyFits(
  rooms: readonly FitRoom[],
  buildableM2: number,
  storeys: number,
): readonly StoreyFit[] {
  const levels = Math.max(1, Math.trunc(storeys))
  const needed = new Array<number>(levels).fill(0)
  for (const room of rooms)
    for (const storey of storeysOf(room))
      if (storey >= 0 && storey < levels)
        needed[storey] = (needed[storey] ?? 0) + Math.max(0, room.targetArea)
  const buildable = round(buildableM2)
  return needed.map((total, storey) => {
    const asked = round(total)
    return {
      storey,
      needed: asked,
      buildable,
      over: asked > buildable,
      difference: round(Math.abs(buildable - asked)),
    }
  })
}

/**
 * The one sentence both screens say. The storey's own name is left to whatever stands beside it,
 * so the bubbles sheet can put it in front and the totals line can leave it to the row's label.
 */
export function fitSentence(fit: StoreyFit): string {
  const against = `${metres2(fit.needed)} m² of targets on ${metres2(fit.buildable)} m² buildable`
  return fit.over
    ? `${against} · over by ${metres2(fit.difference)} m²`
    : `${against} · fits, ${metres2(fit.difference)} m² to spare`
}
