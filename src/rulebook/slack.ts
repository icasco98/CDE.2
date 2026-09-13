import { storeyLabel } from './fit'
import { rangeFor } from './sizes'
import { inWords, metresIn } from './words'

/*
 * Decision 19: the tool never shrinks a room by itself. When a storey spills past the buildable
 * line it names the rooms that could give up area and what one click each would take them to, and
 * when nothing fits it says so in one sentence. Both are read here, off the program alone.
 */

/** A room as the reduction reads one: what it is called, what kind it is, and what it asks for. */
export type SlackRoom = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly targetArea: number
}

/** One room the sheet offers: what it asks for now, and what one click would take it to. */
export type Reducible = {
  readonly id: string
  readonly name: string
  readonly from: number
  readonly to: number
  readonly slack: number
}

export type Reduction = {
  /** The rooms to click, the most slack first; empty when no reduction can make the storey fit. */
  readonly offered: readonly Reducible[]
  /** What the offered rooms could give up together, in m². */
  readonly together: number
  readonly sentence: string
}

/**
 * The kinds that are never offered for reduction although the table gives them a range: a stair
 * is its risers and a lift is its car, so both are geometry rather than preference. A hallway is
 * left out by having no range at all — its length is read off the rooms it serves.
 */
const fixed: ReadonlySet<string> = new Set(['stair', 'lift'])

/** To a tenth of a m², which is as fine as a target area is ever read. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** What a room could give up: its target less the bottom of its kind's range, never negative. */
export function slackOf(room: SlackRoom, plotAreaM2: number): number {
  if (fixed.has(room.type)) return 0
  const range = rangeFor(room.type, plotAreaM2)
  return range ? Math.max(0, round(room.targetArea - range.min)) : 0
}

function reducibleOf(room: SlackRoom, slack: number): Reducible {
  return {
    id: room.id,
    name: room.name,
    from: round(room.targetArea),
    to: round(room.targetArea - slack),
    slack,
  }
}

function offerSentence(offered: readonly Reducible[], together: number): string {
  const named = offered.map((room) => `${room.name} ${metresIn(room.from)} to ${metresIn(room.to)}`)
  const these = offered.length === 1 ? 'this one' : `these ${inWords(offered.length)}`
  return `Reduce ${these} and the floor fits: ${named.join(', ')}, together ${metresIn(together)} m².`
}

function tooBigSentence(storey: number, byM2: number): string {
  return (
    `The ${storeyLabel(storey).toLowerCase()} floor program is too big for this plot by ` +
    `${metresIn(byM2)} m² even with every room at its smallest: ` +
    'move rooms upstairs or remove some.'
  )
}

/**
 * What the sheet offers a storey that spills. The rooms are sorted by slack, the most first, and
 * the fewest taken whose slack together covers the overflow — the fewest, because each one is a
 * click and a room the designer sized on purpose. Where the storey's targets at their smallest
 * still do not fit its buildable area no reduction can save it, so nothing is offered and the
 * sentence says how much has to leave the floor instead. Nothing here changes a target: the
 * caller does that, one click at a time.
 */
export function reductionFor(input: {
  readonly rooms: readonly SlackRoom[]
  readonly overflowM2: number
  readonly buildableM2: number
  readonly plotAreaM2: number
  readonly storey: number
}): Reduction | null {
  const overflow = round(input.overflowM2)
  if (overflow <= 0) return null
  const slacks = input.rooms.map((room) => ({ room, slack: slackOf(room, input.plotAreaM2) }))
  const smallest = slacks.reduce((sum, each) => sum + each.room.targetArea - each.slack, 0)
  const short = round(smallest - input.buildableM2)
  if (short > 0) {
    return { offered: [], together: 0, sentence: tooBigSentence(input.storey, short) }
  }
  // A stable sort by slack keeps the program's own order among rooms that could give up the same.
  const ranked = slacks.filter((each) => each.slack > 0).sort((a, b) => b.slack - a.slack)
  const offered: Reducible[] = []
  let together = 0
  for (const each of ranked) {
    if (together >= overflow) break
    offered.push(reducibleOf(each.room, each.slack))
    together = round(together + each.slack)
  }
  if (offered.length === 0) return null
  return { offered, together, sentence: offerSentence(offered, together) }
}
