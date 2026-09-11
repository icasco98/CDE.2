import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { session } from './session'

function clear(): void {
  for (const message of session.messages()) session.dismiss(message.id)
}

describe('what the app says', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clear()
  })

  afterEach(() => {
    clear()
    vi.useRealTimers()
  })

  it('lets a refusal of a gesture go after eight seconds', () => {
    session.say('Kitchen stays where it was: that would overlap Dining Room.')
    expect(session.messages()).toHaveLength(1)
    vi.advanceTimersByTime(7999)
    expect(session.messages()).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(session.messages()).toHaveLength(0)
  })

  it('keeps one message where the same refusal is said four times over', () => {
    for (let i = 0; i < 4; i++) session.say('Kitchen is pinned.')
    expect(session.messages()).toHaveLength(1)
    vi.advanceTimersByTime(8001)
    expect(session.messages()).toHaveLength(0)
  })

  it('counts the eight seconds from the last time it was said', () => {
    session.say('Kitchen is pinned.')
    vi.advanceTimersByTime(6000)
    session.say('Kitchen is pinned.')
    vi.advanceTimersByTime(6000)
    expect(session.messages()).toHaveLength(1)
    vi.advanceTimersByTime(2001)
    expect(session.messages()).toHaveLength(0)
  })

  it('leaves a problem with a file standing until it is dismissed', () => {
    session.warn('broken.json cannot be opened: that is not JSON')
    vi.advanceTimersByTime(60000)
    expect(session.messages()).toHaveLength(1)
    const [standing] = session.messages()
    expect(standing?.until).toBeUndefined()
    if (standing) session.dismiss(standing.id)
    expect(session.messages()).toHaveLength(0)
  })

  it('lets a refusal go without disturbing a problem standing beside it', () => {
    session.warn('broken.json cannot be opened: that is not JSON')
    session.say('Kitchen is pinned.')
    expect(session.messages()).toHaveLength(2)
    vi.advanceTimersByTime(8001)
    expect(session.messages().map((message) => message.text)).toEqual([
      'broken.json cannot be opened: that is not JSON',
    ])
  })
})
