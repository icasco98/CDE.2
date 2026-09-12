import { storeyLabel } from './fit'
import { roomTypes } from './roomTypes'
import { roomTypeById } from './sizes'

/** A room as the circulation rule reads one: its kind, where it stands, and how much floor it takes. */
export type CirculationRoom = {
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
 * The Circulation section of rulebook/room-types.md, which stays the text a person reads. The
 * share, the floor and the ceiling are provisional judgement; the 1.20 m clear width is legal and
 * sits with the other legal floors, in the hallway's own row of the room-type table.
 */
export const circulationRule = {
  /** Ten per cent: the middle of the 8 to 12 per cent published plans show. */
  share: 0.1,
  /** 1.20 m clear over a 5 m run; below it the space is a landing, not a corridor. */
  floor: 6,
  /** About 1.8 m over 17 m; past it a floor wants a second hallway, not a longer one. */
  ceiling: 30,
} as const

/** The kinds some other kind brings with it, which are entered through the room they serve. */
const companionKinds: ReadonlySet<string> = new Set(
  roomTypes.flatMap((type) => (type.companion === undefined ? [] : [type.companion])),
)

/** Small counts read as words, because the nudge is a sentence. */
const counted = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]

function inWords(count: number): string {
  return counted[count] ?? String(count)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** A stair stands on every floor it reaches, so it is on each of them for this rule as for any other. */
function standsOn(room: CirculationRoom, storey: number): boolean {
  const span = Math.max(1, Math.trunc(room.storeysSpanned))
  return storey >= room.storey && storey < room.storey + span
}

/** A room the corridor leads to: circulation joins circulation, and what the ratio leaves out is not floor. */
function isServed(room: CirculationRoom): boolean {
  const flags = roomTypeById(room.type)?.flags
  return !flags?.circulation && !flags?.notInRatio
}

function onStorey(rooms: readonly CirculationRoom[], storey: number): readonly CirculationRoom[] {
  return rooms.filter((room) => standsOn(room, storey))
}

/** The target area a hallway on this storey takes: the share of what it serves, inside the two bounds. */
export function hallwayArea(rooms: readonly CirculationRoom[], storey: number): number {
  const served = onStorey(rooms, storey)
    .filter(isServed)
    .reduce((total, room) => total + Math.max(room.targetArea, 0), 0)
  const share = served * circulationRule.share
  return round(Math.min(Math.max(share, circulationRule.floor), circulationRule.ceiling))
}

/**
 * Why this storey wants a hallway, or nothing when it does not: two private rooms are two rooms
 * reached without walking through the other, and a stair with anything off it is the same corridor
 * at its shortest. A companion is entered through the room it serves and asks for no corridor.
 */
function wantsHallway(rooms: readonly CirculationRoom[], storey: number): string | undefined {
  const here = onStorey(rooms, storey)
  const privateRooms = here.filter((room) => roomTypeById(room.type)?.tier === 'private')
  if (privateRooms.length >= 2)
    return `${storeyLabel(storey)} has ${inWords(privateRooms.length)} private rooms and no hallway.`
  const stair = here.some((room) => room.type === 'stair')
  const offIt = here.some((room) => room.type !== 'stair' && !companionKinds.has(room.type))
  return stair && offIt ? `${storeyLabel(storey)} has a stair and no hallway.` : undefined
}

export function needsHallway(rooms: readonly CirculationRoom[], storey: number): boolean {
  return wantsHallway(rooms, storey) !== undefined
}

/**
 * Where a hallway stands in the program: behind the stair that serves its storey, behind the entry
 * where there is no stair, and on the end where there is neither. Rebuilding the program and adding
 * one by hand read this same rule, so two programs holding the same rooms read the same way. The
 * answer is the place in the list the hallway takes, so it is one past the room it follows, and
 * past any hallway of a lower storey already standing there, which keeps the corridors in the
 * order of their floors.
 */
export function hallwayFollows(rooms: readonly CirculationRoom[], storey: number): number {
  const stair = rooms.findIndex((room) => room.type === 'stair' && standsOn(room, storey))
  const entry = rooms.findIndex((room) => room.type === 'entry-foyer')
  const behind = stair >= 0 ? stair : entry
  if (behind < 0) return rooms.length
  let at = behind + 1
  while (rooms[at]?.type === 'hallway' && (rooms[at]?.storey ?? storey) < storey) at++
  return at
}

/** What a hallway is called: one house-wide corridor needs no storey in its name, several do. */
export function hallwayName(storey: number, storeys: number): string {
  return storeys > 1 ? `${storeyLabel(storey)} Hallway` : 'Hallway'
}

/** Each storey's circulation as the Bubbles tab reads it: where a hallway is, and where one is wanted. */
export function circulationPerStorey(
  rooms: readonly CirculationRoom[],
  storeys: number,
): readonly StoreyCirculation[] {
  const levels = Math.max(1, Math.trunc(storeys))
  return Array.from({ length: levels }, (_unused, storey) => {
    const hasHallway = onStorey(rooms, storey).some((room) => room.type === 'hallway')
    const wanted = hasHallway ? undefined : wantsHallway(rooms, storey)
    return { storey, hasHallway, ...(wanted === undefined ? {} : { wanted }) }
  })
}
