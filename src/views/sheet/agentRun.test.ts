import { describe, expect, it } from 'vitest'
import { errorSaid, runMessage } from './agentRun'
import { sampleSheet, type Change, type Desk, type Result, type Sheet } from '../../sheet'
import type { Sample } from './claude'

function desk(): { at: Desk; sheet: () => Sheet; said: string[] } {
  let sheet = sampleSheet()
  const said: string[] = []
  return {
    at: {
      read: () => sheet,
      write: (change: Change): Result => {
        if (change.result.ok) sheet = change.sheet
        return change.result
      },
      say: (line) => said.push(line),
      note: () => {},
    },
    sheet: () => sheet,
    said,
  }
}

describe('one message to the assistant', () => {
  it('hands it the tools and gives back what it said', async () => {
    const table = desk()
    const streamed: string[] = []
    const sample = (async (input, options) => {
      expect(input[0]!.content).toContain('The owner says: lay out the ground floor')
      expect(options?.modelTier).toBe('default')
      expect(options?.cache).toBe(false)
      const place = options?.tools?.find((tool) => tool.name === 'place_rooms')
      place?.execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
      options?.onText?.({ text: 'Bedroom is in.', delta: 'Bedroom is in.' })
      return { text: 'Bedroom is in.', truncated: false }
    }) as Sample
    const run = await runMessage({
      sample,
      desk: table.at,
      storey: 0,
      memory: { feedback: [], notes: [], plans: [] },
      text: 'lay out the ground floor',
      onText: (text) => streamed.push(text),
    })
    expect(run).toEqual({ text: 'Bedroom is in.' })
    expect(streamed).toEqual(['Bedroom is in.'])
    expect(table.sheet().rooms.find((r) => r.name === 'Bedroom')!.placed).toBe(true)
  })

  it('refuses where the view cannot run the tools', async () => {
    const sample = (async () => ({ text: 'never asked', truncated: false })) as Sample
    sample.limits = async () => ({})
    const run = await runMessage({
      sample,
      desk: desk().at,
      storey: 0,
      memory: { feedback: [], notes: [], plans: [] },
      text: 'lay out the ground floor',
      onText: () => {},
    })
    expect(run).toEqual({ error: errorSaid('tools_unavailable', '') })
  })

  it('turns a failure into its code and a plain sentence', async () => {
    const sample = (async () => {
      throw { code: 'rate_limited', message: 'too many' }
    }) as Sample
    const run = await runMessage({
      sample,
      desk: desk().at,
      storey: 0,
      memory: { feedback: [], notes: [], plans: [] },
      text: 'again',
      onText: () => {},
    })
    expect(run).toEqual({
      error: 'rate_limited · busy: the model is busy; wait a minute and try again.',
    })
  })

  it('says stopped, busy and not allowed in plain words, and keeps an unknown code', () => {
    expect(errorSaid('cancelled', 'aborted')).toContain('stopped:')
    expect(errorSaid('not_granted', 'no consent')).toContain('not allowed:')
    expect(errorSaid('queue_overflow', 'full')).toContain('busy:')
    expect(errorSaid('something_new', 'the wire broke')).toBe('something_new · the wire broke')
    expect(errorSaid('', 'nothing at all')).toBe('no code · nothing at all')
  })
})
