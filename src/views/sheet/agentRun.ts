/**
 * One message: the prompt is built, the assistant is asked with the sheet's tools in its hand, its
 * answer streams back, and a failure becomes a line with its code and a plain sentence.
 */

import { layoutTools, promptFor, sheetRead, type Desk, type Memory } from '../../sheet'
import type { Sample } from './claude'

type Run = { text: string } | { error: string }

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

export async function runMessage(input: RunInput): Promise<Run> {
  const prompt = promptFor({
    read: sheetRead(input.desk.read(), input.storey),
    memory: input.memory,
    text: input.text,
  })
  try {
    let limits: { tools?: { maxCount: number } } | null = null
    try {
      limits = (await input.sample.limits?.()) ?? null
    } catch {
      // a view that cannot say what it allows is asked anyway; the call itself refuses if it must
    }
    if (limits && !limits.tools) return { error: errorSaid('tools_unavailable', '') }
    const answer = await input.sample([{ role: 'user', content: prompt }], {
      tools: layoutTools(input.desk, input.storey),
      modelTier: 'default',
      cache: false,
      onText: ({ text }) => input.onText(text),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    return { text: answer.text || 'Done.' }
  } catch (thrown) {
    const { code, message } = errorOf(thrown)
    return { error: errorSaid(code, message) }
  }
}
