/**
 * The assistant's memory, kept by the tool and sent with every message, so the owner meets one
 * assistant across sessions and versions: what they said, the lessons it wrote for itself, the
 * commands it asked for and the plans they kept. Nothing here reads a store; it is the shape and
 * the bounds. The lessons it starts with are the page it ships with; these are what it adds.
 */

import { allPlaced, storeyNameOf, storeyOf, type Sheet } from './model'
import { r2 } from './geometry'
import { startingLessons, startingRequests, type Request, type RequestState } from './lessons'

type Line = { at: string; text: string }

/** A kept plan is room names with their frames: enough for the assistant to lay it out again. */
type PlanRoom = { name: string; x: number; y: number; w: number; h: number; angle: number }

type Plan = { at: string; name: string; rooms: PlanRoom[] }

/** A command the architect asked for, and where the cofounder has left it. */
type Asked = { at: string; text: string; state: RequestState }

export type Memory = { feedback: Line[]; plans: Plan[]; notes: Line[]; requests: Asked[] }

export const PLANS_KEPT = 5
export const FEEDBACK_SENT = 30
export const NOTES_SENT = 20

/** One line's most, when it is stored and when it is sent, so a paste cannot fill the prompt. */
export const TEXT_CAP = 400

/** Lines kept in the store, so the browser's store cannot grow without end. */
export const LINES_KEPT = 200

/** The lessons stay about a page: this many lines, and this many characters of them. */
export const NOTES_KEPT = 24
export const PAGE_CAP = 2400
export const REQUESTS_KEPT = 12

export const newMemory = (): Memory => ({ feedback: [], plans: [], notes: [], requests: [] })

const trim = (text: unknown) =>
  String(text ?? '')
    .trim()
    .slice(0, TEXT_CAP)

const added = (lines: Line[], text: string, at: string): Line[] =>
  [...lines, { at, text }].slice(-LINES_KEPT)

export const withFeedback = (memory: Memory, text: string, at: string): Memory => ({
  ...memory,
  feedback: added(memory.feedback, trim(text), at),
})

/** The lessons cut back to a page, the oldest going first. */
function aPage(notes: Line[]): Line[] {
  const held = notes.slice(-NOTES_KEPT)
  while (held.length > 1 && held.reduce((sum, line) => sum + line.text.length + 3, 0) > PAGE_CAP)
    held.shift()
  return held
}

/** The line a new one is written over: the same words, or the opening of them. */
const sameLesson = (held: string, over: string) => {
  const a = held.trim().toLowerCase()
  const b = over.trim().toLowerCase()
  return !!b && (a === b || a.startsWith(b) || b.startsWith(a))
}

/**
 * A lesson written into the memory. One that supersedes an older line replaces it where it stood,
 * so the page never piles up two versions of the same rule.
 */
export function withNote(memory: Memory, text: string, at: string, replaces?: string): Memory {
  const line = { at, text: trim(text) }
  if (!line.text) return memory
  const over = replaces ? trim(replaces) : ''
  const stood = memory.notes.findIndex((held) =>
    over ? sameLesson(held.text, over) : held.text === line.text,
  )
  const notes =
    stood >= 0
      ? memory.notes.map((held, i) => (i === stood ? line : held))
      : [...memory.notes, line].slice(-LINES_KEPT)
  return { ...memory, notes: aPage(notes) }
}

/** A command the architect says it lacked, kept once with its state. */
export function withRequest(memory: Memory, text: string, at: string): Memory {
  const want = trim(text)
  if (!want) return memory
  if (memory.requests.some((held) => sameLesson(held.text, want))) return memory

  return {
    ...memory,
    requests: [...memory.requests, { at, text: want, state: 'open' as RequestState }].slice(
      -REQUESTS_KEPT,
    ),
  }
}

export const planRooms = (sheet: Sheet, storey: number): PlanRoom[] =>
  allPlaced(sheet)
    .filter((r) => storeyOf(r) === storey && !r.extra)
    .map((r) => ({
      name: r.name,
      x: r2(r.x),
      y: r2(r.y),
      w: r2(r.w),
      h: r2(r.h),
      angle: Math.round(r.angle || 0),
    }))

/** The sheet as it stands, kept as an approved plan; the oldest is dropped past five. */
export const withPlan = (memory: Memory, sheet: Sheet, storey: number, at: string): Memory => ({
  ...memory,
  plans: [
    ...memory.plans,
    {
      at,
      name: `${storeyNameOf(storey)} kept ${at.slice(11, 16)}`,
      rooms: planRooms(sheet, storey),
    },
  ].slice(-PLANS_KEPT),
})

const lineOf = (value: unknown): Line | null => {
  if (!value || typeof value !== 'object') return null
  const line = value as Record<string, unknown>
  const text = trim(line.text)
  return text ? { at: String(line.at ?? ''), text } : null
}

const planOf = (value: unknown): Plan | null => {
  if (!value || typeof value !== 'object') return null
  const plan = value as Record<string, unknown>
  const rooms = Array.isArray(plan.rooms) ? plan.rooms : []
  return {
    at: String(plan.at ?? ''),
    name: String(plan.name ?? 'a kept plan'),
    rooms: rooms.flatMap((room) => {
      if (!room || typeof room !== 'object') return []
      const r = room as Record<string, unknown>
      const numbers = (['x', 'y', 'w', 'h'] as const).map((k) => Number(r[k]))
      if (numbers.some((n) => !Number.isFinite(n))) return []
      return [
        {
          name: String(r.name ?? ''),
          x: numbers[0]!,
          y: numbers[1]!,
          w: numbers[2]!,
          h: numbers[3]!,
          angle: Number(r.angle) || 0,
        },
      ]
    }),
  }
}

/** Memory as it comes back from a store: anything unreadable is left out rather than trusted. */
export function readMemory(value: unknown): Memory {
  if (!value || typeof value !== 'object') return newMemory()
  const held = value as Record<string, unknown>
  const lines = (key: 'feedback' | 'notes'): Line[] =>
    (Array.isArray(held[key]) ? (held[key] as unknown[]) : []).flatMap((entry) => {
      const line = lineOf(entry)
      return line ? [line] : []
    })
  return {
    feedback: lines('feedback').slice(-LINES_KEPT),
    notes: aPage(lines('notes')),
    requests: (Array.isArray(held.requests) ? (held.requests as unknown[]) : [])
      .flatMap((entry) => {
        const line = lineOf(entry)
        const state = (entry as { state?: unknown } | null)?.state
        const held: RequestState = state === 'built' || state === 'refused' ? state : 'open'
        return line ? [{ ...line, state: held }] : []
      })
      .slice(-REQUESTS_KEPT),
    plans: (Array.isArray(held.plans) ? (held.plans as unknown[]) : [])
      .flatMap((entry) => {
        const plan = planOf(entry)
        return plan ? [plan] : []
      })
      .slice(-PLANS_KEPT),
  }
}

export type MemorySent = {
  feedback: string[]
  /** The page it ships with and the lines it has written since, as one list. */
  lessons: string[]
  requests: Request[]
  plans: Plan[]
}

/** What goes into a prompt: the lessons, the requests with their state, the last lines, the plans. */
export const memorySent = (memory: Memory): MemorySent => ({
  feedback: memory.feedback.slice(-FEEDBACK_SENT).map((line) => trim(line.text)),
  lessons: [
    ...startingLessons(),
    ...memory.notes.slice(-NOTES_SENT).map((line) => trim(line.text)),
  ],
  requests: [
    ...startingRequests(),
    ...memory.requests.map((held) => ({ text: held.text, state: held.state })),
  ],
  plans: memory.plans.slice(-PLANS_KEPT),
})
