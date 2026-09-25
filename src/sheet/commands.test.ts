import { describe, expect, it } from 'vitest'
import { commandsPage } from './commands'
import { promptFor } from './prompt'
import { newMemory } from './memory'
import { sheetRead } from './agent'
import { fixtureSheet } from './fixture'

describe('the page that teaches the architect its commands', () => {
  const page = commandsPage()

  it('is the section of the architect’s own page, without its heading', () => {
    expect(page.startsWith('## ')).toBe(false)
    expect(page).toContain('Seven commands.')
    for (const name of [
      'read_sheet',
      'place_against',
      'place_rooms',
      'settle',
      'take_back',
      'remember',
      '`do`',
    ])
      expect(page).toContain(name)
    for (const verb of [
      'turn',
      'mirror',
      'carve',
      'court',
      'corridor',
      'combine',
      'height',
      'door',
    ])
      expect(page).toContain(verb)
    // it stops at the next heading of the page
    expect(page).not.toContain('How you speak')
  })

  it('says the three things the architect has got wrong', () => {
    expect(page).toContain('`place_against` takes several rooms in one call')
    expect(page).toContain('a sentence in the chat changes nothing')
    expect(page).toContain('a verb refused is a fact about')
  })

  it('takes a heading that is not there as no section', () => {
    expect(commandsPage('# A page\n\nNothing under a heading.\n')).toBe('')
  })

  it('is sent with every message, and the prompt still fits', () => {
    const prompt = promptFor({
      read: sheetRead(fixtureSheet(), 0),
      memory: newMemory(),
      text: 'lay out the ground floor',
    })
    expect(prompt).toContain('Seven commands.')
    expect(new TextEncoder().encode(prompt).length).toBeLessThan(60_000)
  })
})
