import { describe, expect, it } from 'vitest'
import { AGENT_BRIEF, PROMPT_CAP, promptFor } from './prompt'
import { sheetRead } from './agent'
import { sampleSheet } from './sample'
import { newMemory, withFeedback, withNote, withPlan, withRequest, type Memory } from './memory'

const at = '2026-09-18T11:05:00.000Z'

/** A memory as full as the tool will ever send: long lines, and five kept plans. */
function fullMemory(): Memory {
  const sheet = sampleSheet()
  let memory = newMemory()
  for (let k = 0; k < 60; k++) {
    memory = withFeedback(memory, `the owner writes a long line ${k} `.repeat(20), at)
    memory = withNote(memory, `a rule the assistant noted ${k} `.repeat(20), at)
  }
  for (let k = 0; k < 8; k++) memory = withPlan(memory, sheet, 0, at)
  for (let k = 0; k < 20; k++) memory = withRequest(memory, `a command it lacked ${k}`, at)
  return memory
}

describe('the prompt the assistant reads', () => {
  const read = sheetRead(sampleSheet(), 0)

  it('carries the brief, the sheet and what the owner said', () => {
    const prompt = promptFor({ read, memory: newMemory(), text: 'lay out the ground floor' })
    expect(prompt.startsWith(AGENT_BRIEF)).toBe(true)
    expect(prompt).toContain('The owner says: lay out the ground floor')
    expect(prompt).toContain('"Diwaniya"')
    expect(prompt).toContain('at most five short lines')
    expect(prompt).toContain('Never give a coordinate or a dimension in the chat')
    expect(prompt).toContain('Ask one question when something is unclear')
  })

  it('carries the lessons and the requests it ships with, and where each request stands', () => {
    const prompt = promptFor({ read, memory: newMemory(), text: 'lay out the ground floor' })
    expect(prompt).toContain('- Place rooms against each other')
    expect(prompt).toContain('- Read the whole house at once, every storey, not only the one on')
    expect(prompt).toContain('screen. (built)')
  })

  it('carries the memory: the owner’s lines, the notes and the kept plans', () => {
    const memory = withPlan(
      withNote(withFeedback(newMemory(), 'no diwaniya WC', at), 'the garden goes west', at),
      sampleSheet(),
      0,
      at,
    )
    const prompt = promptFor({
      read,
      memory: withRequest(memory, 'let me place a door', at),
      text: 'again please',
    })
    expect(prompt).toContain('- no diwaniya WC')
    expect(prompt).toContain('- let me place a door (open)')
    expect(prompt).toContain('- the garden goes west')
    expect(prompt).toContain('Ground kept 11:05')
    expect(prompt).toContain('Diwaniya 11.86,15.04')
  })

  it('stays under 60 KB with a full memory', () => {
    const prompt = promptFor({ read, memory: fullMemory(), text: 'check this layout' })
    const bytes = new TextEncoder().encode(prompt).length
    expect(bytes).toBeLessThan(PROMPT_CAP)
    expect(prompt).toContain('The owner says: check this layout')
  })
})
