import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_SENT,
  NOTES_KEPT,
  NOTES_SENT,
  PAGE_CAP,
  PLANS_KEPT,
  TEXT_CAP,
  memorySent,
  newMemory,
  planRooms,
  readMemory,
  withFeedback,
  withNote,
  withPlan,
  withRequest,
  type Memory,
} from './memory'
import { sampleSheet } from './sample'

const at = (k: number) => `2026-09-18T${String(10 + k).padStart(2, '0')}:05:00.000Z`

const filled = (lines: number): Memory => {
  let memory = newMemory()
  for (let k = 0; k < lines; k++) {
    memory = withFeedback(memory, `owner line ${k}`, at(k % 14))
    memory = withNote(memory, `note ${k}`, at(k % 14))
  }
  return memory
}

describe('the assistant memory', () => {
  it('keeps at most five plans, the oldest dropped', () => {
    const sheet = sampleSheet()
    let memory = newMemory()
    for (let k = 0; k < PLANS_KEPT + 3; k++) memory = withPlan(memory, sheet, 0, at(k))
    expect(memory.plans).toHaveLength(PLANS_KEPT)
    expect(memory.plans[0]!.at).toBe(at(3))
  })

  it('keeps a plan as room names with their frames', () => {
    const rooms = planRooms(sampleSheet(), 0)
    const diwaniya = rooms.find((r) => r.name === 'Diwaniya')
    expect(diwaniya).toBeDefined()
    expect(diwaniya!.w * diwaniya!.h).toBeGreaterThan(35)
    expect(rooms.every((r) => Number.isFinite(r.x) && Number.isFinite(r.y))).toBe(true)
  })

  it('sends the last thirty owner lines, and the lessons it starts with before its own', () => {
    const sent = memorySent(filled(50))
    expect(sent.feedback).toHaveLength(FEEDBACK_SENT)
    expect(sent.feedback[FEEDBACK_SENT - 1]).toBe('owner line 49')
    expect(sent.lessons.length).toBeGreaterThan(NOTES_SENT)
    expect(sent.lessons[0]).toContain('Place rooms against each other')
    expect(sent.lessons[sent.lessons.length - 1]).toBe('note 49')
  })

  it('keeps the lessons to about a page, the oldest going first', () => {
    const memory = filled(80)
    expect(memory.notes.length).toBeLessThanOrEqual(NOTES_KEPT)
    expect(memory.notes.reduce((sum, line) => sum + line.text.length + 3, 0)).toBeLessThanOrEqual(
      PAGE_CAP,
    )
    expect(memory.notes[memory.notes.length - 1]!.text).toBe('note 79')
  })

  it('writes a lesson over the older line it supersedes, where that line stood', () => {
    let memory = withNote(newMemory(), 'the dining room is never the small one', at(0))
    memory = withNote(memory, 'the garden goes west', at(1))
    memory = withNote(
      memory,
      'the dining room is never the small one: take area from the kitchen',
      at(2),
      'the dining room is never the small one',
    )
    expect(memory.notes).toHaveLength(2)
    expect(memory.notes[0]!.text).toContain('take area from the kitchen')
    expect(memory.notes[1]!.text).toBe('the garden goes west')
  })

  it('keeps a request once, with its state, and sends it after the ones it shipped with', () => {
    let memory = withRequest(newMemory(), 'let me place a door', at(0))
    memory = withRequest(memory, 'let me place a door as well', at(1))
    expect(memory.requests).toEqual([{ at: at(0), text: 'let me place a door', state: 'open' }])
    const sent = memorySent(memory)
    expect(sent.requests[0]!.state).toBe('built')
    expect(sent.requests[sent.requests.length - 1]).toEqual({
      text: 'let me place a door',
      state: 'open',
    })
  })

  it('cuts a pasted line to its cap', () => {
    const memory = withFeedback(newMemory(), 'x'.repeat(2000), at(0))
    expect(memory.feedback[0]!.text).toHaveLength(TEXT_CAP)
  })

  it('reads back what it wrote and leaves out what it cannot read', () => {
    const memory = withPlan(
      withNote(withFeedback(newMemory(), 'go on', at(0)), 'north is 25°', at(1)),
      sampleSheet(),
      0,
      at(2),
    )
    expect(readMemory(JSON.parse(JSON.stringify(memory)))).toEqual(memory)
    expect(readMemory('not memory at all')).toEqual(newMemory())
    expect(
      readMemory({ feedback: [{ text: '' }, 42], notes: null, plans: [7], requests: 'no' }),
    ).toEqual(newMemory())
  })
})
