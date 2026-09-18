/**
 * The assistant's memory, kept by the tool and sent with every message, so the owner meets one
 * assistant across sessions and versions: what they said, what it noted for itself, and the plans
 * they kept. Nothing here reads a store; it is the shape and the bounds.
 */

import { allPlaced, storeyNameOf, storeyOf, type Sheet } from './model'
import { r2 } from './geometry'

type Line = { at: string; text: string }

/** A kept plan is room names with their frames: enough for the assistant to lay it out again. */
type PlanRoom = { name: string; x: number; y: number; w: number; h: number; angle: number }

type Plan = { at: string; name: string; rooms: PlanRoom[] }

export type Memory = { feedback: Line[]; plans: Plan[]; notes: Line[] }

export const PLANS_KEPT = 5
export const FEEDBACK_SENT = 30
export const NOTES_SENT = 20

/** One line's most, when it is stored and when it is sent, so a paste cannot fill the prompt. */
export const TEXT_CAP = 400

/** Lines kept in the store, so the browser's store cannot grow without end. */
export const LINES_KEPT = 200

export const newMemory = (): Memory => ({ feedback: [], plans: [], notes: [] })

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

export const withNote = (memory: Memory, text: string, at: string): Memory => ({
  ...memory,
  notes: added(memory.notes, trim(text), at),
})

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
    notes: lines('notes').slice(-LINES_KEPT),
    plans: (Array.isArray(held.plans) ? (held.plans as unknown[]) : [])
      .flatMap((entry) => {
        const plan = planOf(entry)
        return plan ? [plan] : []
      })
      .slice(-PLANS_KEPT),
  }
}

export type MemorySent = { feedback: string[]; notes: string[]; plans: Plan[] }

/** What goes into a prompt: the last lines only, each within its cap, and the kept plans. */
export const memorySent = (memory: Memory): MemorySent => ({
  feedback: memory.feedback.slice(-FEEDBACK_SENT).map((line) => trim(line.text)),
  notes: memory.notes.slice(-NOTES_SENT).map((line) => trim(line.text)),
  plans: memory.plans.slice(-PLANS_KEPT),
})
