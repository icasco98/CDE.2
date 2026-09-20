/**
 * One message: the prompt is built, the architect is asked with the sheet's tools in its hand, its
 * answer streams back, and a failure becomes a line with its code and a plain sentence. A run that
 * changed the sheet and wrote nothing down is asked once, before it answers, for its lessons.
 */

import {
  LESSONS_ASK,
  NOTHING_PLACED,
  claimsChange,
  layoutTools,
  promptFor,
  sheetRead,
  type AgentTool,
  type Desk,
  type Memory,
} from '../../sheet'
import type { Sample } from './claude'

/** The answer, and the one line the log adds under it when the answer claims what no command did. */
type Run = { text: string; note?: string } | { error: string }

const plain: Record<string, string> = {
  cancelled: 'stopped: nothing more was asked of the model.',
  not_granted:
    'not allowed: the page may not ask the model; allow it when the browser asks, then try again.',
  session_expired: 'not allowed: the session has ended; reload the page and try again.',
  sampling_disabled: 'not allowed: asking the model is switched off for this page.',
  not_declared: 'not allowed: this page does not declare the assistant.',
  tools_unavailable: 'not allowed: this view cannot run the tools the sheet needs.',
  rate_limited: 'busy: the model is busy; wait a minute and try again.',
  queue_overflow: 'busy: too much was asked at once; try again in a moment.',
  prompt_too_large: 'the sheet and the memory are too long to send; keep fewer plans.',
  refused: 'the model would not answer this one.',
  empty_completion: 'the model said nothing; ask for less at a time.',
  upstream_error: 'the model stopped part way; try again.',
}

/** A failure the owner can read: the code as it came, and a sentence in plain words. */
export const errorSaid = (code: string, message: string): string =>
  `${code || 'no code'} · ${plain[code] ?? message.slice(0, 160)}`

const errorOf = (thrown: unknown): { code: string; message: string } => {
  const held = (thrown ?? {}) as { code?: unknown; message?: unknown }
  return {
    code: typeof held.code === 'string' ? held.code : '',
    message: typeof held.message === 'string' ? held.message : String(thrown),
  }
}

type RunInput = {
  sample: Sample
  desk: Desk
  storey: number
  memory: Memory
  text: string
  onText: (text: string) => void
  signal?: AbortSignal
}

/** The commands, in the order they matter, cut to what this view will carry. */
const toolsFor = (desk: Desk, storey: number, most: number | undefined): AgentTool[] => {
  const tools = layoutTools(desk, storey)
  return most && most < tools.length ? tools.slice(0, most) : tools
}

export async function runMessage(input: RunInput): Promise<Run> {
  const prompt = promptFor({
    read: sheetRead(input.desk.read(), input.storey),
    memory: input.memory,
    text: input.text,
  })
  // What the architect wrote down in this message, what it changed, and the sheet before it worked.
  let wrote = 0
  let ran = 0
  const desk: Desk = {
    ...input.desk,
    write: (change) => {
      const out = input.desk.write(change)
      if (out.ok) ran++
      return out
    },
    note: (text, replaces) => {
      wrote++
      input.desk.note(text, replaces)
    },
    request: (text) => {
      wrote++
      input.desk.request(text)
    },
  }
  const before = JSON.stringify(input.desk.read().rooms)
  try {
    let limits: { tools?: { maxCount: number } } | null = null
    try {
      limits = (await input.sample.limits?.()) ?? null
    } catch {
      // a view that cannot say what it allows is asked anyway; the call itself refuses if it must
    }
    if (limits && !limits.tools) return { error: errorSaid('tools_unavailable', '') }
    const most = limits?.tools?.maxCount
    const answer = await input.sample([{ role: 'user', content: prompt }], {
      tools: toolsFor(desk, input.storey, most),
      modelTier: 'default',
      cache: false,
      onText: ({ text }) => input.onText(text),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    const text = answer.text || 'Done.'
    if (!wrote && JSON.stringify(input.desk.read().rooms) !== before)
      await askForLessons(input, desk, prompt, text)
    return { text, ...(!ran && claimsChange(text) ? { note: NOTHING_PLACED } : {}) }
  } catch (thrown) {
    const { code, message } = errorOf(thrown)
    return { error: errorSaid(code, message) }
  }
}

/**
 * The one question at the end of a run that changed the sheet and left no lesson behind: the same
 * turns, its own answer, and the ask. It writes through `remember`; a failure here is left alone,
 * because the owner has their answer either way.
 */
async function askForLessons(
  input: RunInput,
  desk: Desk,
  prompt: string,
  answer: string,
): Promise<void> {
  const remember = layoutTools(desk, input.storey).filter((tool) => tool.name === 'remember')
  try {
    await input.sample(
      [
        { role: 'user', content: prompt },
        { role: 'assistant', content: answer },
        { role: 'user', content: LESSONS_ASK },
      ],
      {
        tools: remember,
        modelTier: 'default',
        cache: false,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    )
  } catch {
    // a lesson the architect could not be asked for is a lesson lost, not a message failed
  }
}
