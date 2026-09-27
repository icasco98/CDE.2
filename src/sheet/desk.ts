/**
 * The desk the architect works at: the sheet in hand, one action at a time, a line in the log and
 * its own memory — and how it names a room or a storey, so a command works where it says it does.
 */

import type { Change, Result } from './actions'
import type { Room, Sheet } from './model'
import { MAX_STOREYS, STOREY_NAME } from './plot'

/**
 * The sheet the architect works on: it reads the sheet as it stands, writes one action at a time,
 * says a line in the log, and writes its lessons and its requests into its memory.
 */
export type Desk = {
  read: () => Sheet
  write: (change: Change) => Result
  say: (line: string) => void
  /** A lesson in its own words; `replaces` names the older line this one is written over. */
  note: (text: string, replaces?: string) => void
  /** A command it lacked. */
  request: (text: string) => void
  /** The project's edge between two rooms, or a room and the outside, which a door would draw. */
  edgeBetween: (a: string, b: string) => string | null
}

/** A room by the name the architect used: the program's name, the start of it, or its kind. */
export function roomNamed(sheet: Sheet, name: unknown): Room | null {
  const want = String(name ?? '')
    .trim()
    .toLowerCase()
  if (!want) return null
  const rooms = sheet.rooms
  return (
    rooms.find((r) => r.name.toLowerCase() === want) ??
    rooms.find((r) => r.name.toLowerCase().startsWith(want)) ??
    rooms.find((r) => r.kind === want) ??
    null
  )
}

/** The storey the architect named, or nothing when that is no storey: the caller says what to do. */
export function storeyAsked(value: unknown): number | null {
  const want = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!want) return null
  const named = STOREY_NAME.findIndex((name) => name.toLowerCase() === want)
  if (named >= 0) return named
  const number = Number(want)
  return Number.isFinite(number) ? Math.floor(number) : null
}

/** A storey by its name, so a command works where the architect says and not where the owner looks. */
export function storeyNamed(value: unknown, fallback: number): number {
  const asked = storeyAsked(value)
  if (asked === null) return fallback
  return Math.max(0, Math.min(MAX_STOREYS - 1, asked))
}
