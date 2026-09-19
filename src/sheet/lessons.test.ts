import { describe, expect, it } from 'vitest'
import { startingLessons, startingRequests } from './lessons'

describe('the lessons the architect ships with', () => {
  it('reads its page of rules, one line each', () => {
    const lessons = startingLessons()
    expect(lessons.length).toBeGreaterThan(8)
    expect(lessons[0]).toContain('Place rooms against each other')
    // a rule written over two lines of the page is one lesson
    expect(lessons.some((line) => line.includes('about 1.5 m or more, and how much'))).toBe(true)
    expect(lessons.some((line) => line.startsWith('-'))).toBe(false)
  })

  it('reads its requests with the state each one is in', () => {
    const requests = startingRequests()
    expect(requests.length).toBeGreaterThan(4)
    // every command it had asked for is built, so it can read that it now has them
    expect(requests.every((asked) => asked.state === 'built')).toBe(true)
    expect(requests[0]!.text).toBe('Place a room against a named wall of another room, touching.')
  })

  it('reads a page of its own, with a request the cofounder has marked', () => {
    const page = [
      '# Lessons',
      '',
      '## Rules',
      '',
      '- one rule',
      '  carried on',
      '',
      '## Requests',
      '',
      '- a command I want. (built)',
      '- another. (refused)',
      '- a third.',
    ].join('\n')
    expect(startingLessons(page)).toEqual(['one rule carried on'])
    expect(startingRequests(page)).toEqual([
      { text: 'a command I want.', state: 'built' },
      { text: 'another.', state: 'refused' },
      { text: 'a third.', state: 'open' },
    ])
  })
})
