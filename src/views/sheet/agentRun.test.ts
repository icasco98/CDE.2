import { describe, expect, it } from 'vitest'
import { errorSaid, runMessage } from './agentRun'
import {
  NOTHING_PLACED,
  newMemory,
  sampleSheet,
  type Change,
  type Desk,
  type Result,
  type Sheet,
} from '../../sheet'
import type { Sample } from './claude'

function desk(): {
  at: Desk
  sheet: () => Sheet
  said: string[]
  notes: string[]
  asked: string[]
} {
  let sheet = sampleSheet()
  const said: string[] = []
  const notes: string[] = []
  const asked: string[] = []
  return {
    at: {
      read: () => sheet,
      write: (change: Change): Result => {
        if (change.result.ok) sheet = change.sheet
        return change.result
      },
      say: (line) => said.push(line),
      note: (text) => notes.push(text),
      request: (text) => asked.push(text),
    },
    sheet: () => sheet,
    said,
    notes,
    asked,
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
      memory: newMemory(),
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
      memory: newMemory(),
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
      memory: newMemory(),
      text: 'again',
      onText: () => {},
    })
    expect(run).toEqual({
      error: 'rate_limited · busy: the model is busy; wait a minute and try again.',
    })
  })

  it('asks once for its lessons when it changed the sheet and wrote nothing down', async () => {
    const table = desk()
    const turns: number[] = []
    const asks: string[] = []
    const sample = (async (input, options) => {
      turns.push(input.length)
      asks.push(String(input[input.length - 1]!.content))
      const tools = options?.tools ?? []
      if (input.length === 1) {
        tools
          .find((tool) => tool.name === 'place_rooms')
          ?.execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
        return { text: 'Bedroom is in.', truncated: false }
      }
      expect(tools.map((tool) => tool.name)).toEqual(['remember'])
      tools[0]!.execute({ note: 'the bedroom goes beside the formal living', request: 'doors' })
      return { text: 'done', truncated: false }
    }) as Sample
    const run = await runMessage({
      sample,
      desk: table.at,
      storey: 0,
      memory: newMemory(),
      text: 'lay out the ground floor',
      onText: () => {},
    })
    // the owner reads the answer to their own message, not the answer to the question about lessons
    expect(run).toEqual({ text: 'Bedroom is in.' })
    expect(turns).toEqual([1, 3])
    expect(asks[1]).toContain('what this turn taught you')
    expect(table.notes).toEqual(['the bedroom goes beside the formal living'])
    expect(table.asked).toEqual(['doors'])
  })

  it('does not ask when it wrote a lesson itself, or when it changed nothing', async () => {
    const calls: number[] = []
    const run = async (work: 'note' | 'nothing') => {
      const table = desk()
      const sample = (async (_input, options) => {
        calls.push(1)
        const tools = options?.tools ?? []
        tools
          .find((tool) => tool.name === 'place_rooms')
          ?.execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
        if (work === 'note')
          tools.find((tool) => tool.name === 'remember')?.execute({ note: 'a rule' })
        if (work === 'nothing') tools.find((tool) => tool.name === 'take_back')?.execute({})
        return { text: 'said', truncated: false }
      }) as Sample
      await runMessage({
        sample,
        desk: table.at,
        storey: 0,
        memory: newMemory(),
        text: 'again',
        onText: () => {},
      })
    }
    await run('note')
    expect(calls).toHaveLength(1)
    await run('nothing')
    expect(calls).toHaveLength(2)
  })

  it('adds a line when the answer claims a change no command made', async () => {
    const table = desk()
    const narrating = (async () => ({
      text: 'I turned the kitchen and made the space behind it a court.',
      truncated: false,
    })) as Sample
    const narrated = await runMessage({
      sample: narrating,
      desk: table.at,
      storey: 0,
      memory: newMemory(),
      text: 'turn the kitchen',
      onText: () => {},
    })
    expect(narrated).toEqual({
      text: 'I turned the kitchen and made the space behind it a court.',
      note: NOTHING_PLACED,
    })
    // a command that ran leaves the answer alone, whatever it says
    const working = (async (_input, options) => {
      options?.tools
        ?.find((tool) => tool.name === 'do')
        ?.execute({ deeds: [{ verb: 'turn', room: 'Store', quarter: true }] })
      return { text: 'I turned the store.', truncated: false }
    }) as Sample
    const did = await runMessage({
      sample: working,
      desk: desk().at,
      storey: 0,
      memory: newMemory(),
      text: 'turn the store',
      onText: () => {},
    })
    expect(did).toEqual({ text: 'I turned the store.' })
  })

  it('says stopped, busy and not allowed in plain words, and keeps an unknown code', () => {
    expect(errorSaid('cancelled', 'aborted')).toContain('stopped:')
    expect(errorSaid('not_granted', 'no consent')).toContain('not allowed:')
    expect(errorSaid('queue_overflow', 'full')).toContain('busy:')
    expect(errorSaid('something_new', 'the wire broke')).toBe('something_new · the wire broke')
    expect(errorSaid('', 'nothing at all')).toBe('no code · nothing at all')
  })
})
