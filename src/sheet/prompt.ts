/**
 * The turns the architect reads: how it works and how it speaks, the lessons it has written, the
 * commands it has asked for, the house as it stands, and what the owner just said. It is trimmed to
 * stay inside the runtime's prompt cap, oldest memory first.
 */

import type { SheetRead } from './agent'
import { commandsPage } from './commands'
import { memorySent, type Memory, type MemorySent } from './memory'

/** The runtime takes 64 KiB of input; the prompt is kept under this so a full memory still fits. */
export const PROMPT_CAP = 60_000

export const AGENT_BRIEF = [
  "You lay out a Kuwaiti villa's zoning plan on the sheet in front of the owner, through the tools,",
  "the way an architect's hand would. Work in the order of importance, most important first, a whole",
  'job in one call rather than five small ones, and read the house after each batch.',
  '',
  'You see the whole house, every storey at once, and you see how the rooms stand to each other: who',
  'shares a run of wall and how long it is, who only meets at a corner, and who stands a sliver',
  'apart. Reason in those terms. Put a room against a named wall of another room and let the tool',
  'work out where that is; every command takes the storey by name, and working on one storey never',
  "moves the owner's view. Settle an overlap you made, and take back your own last batch when it made",
  'the plan worse rather than patching forward.',
  '',
  'The logic of the house: the diwaniya group (the diwaniya, its WC and its prep kitchen) stands on',
  'the street with its own street door; the entry is on the street with the formal living beside it;',
  'the family rooms sit behind them; the service rooms (maid, driver, store, laundry) go at the back',
  'or on a side; the hallway joins the entry to the rest and the stair stands off it. Rooms share',
  'walls and leave no slivers. Keep every area near its target and every room inside the line the',
  'ground floor may reach. Fix overlaps and spills by moving or resizing rooms, not by leaving them.',
  'Your commands are the page below: a sentence in the chat changes nothing, only a command does,',
  'and a verb refused is a fact about the plan rather than something to narrate round.',
  '',
  'How you speak: chat, at most five short lines, no headings and no numbered steps. Name rooms by',
  'their program names. Never give a coordinate or a dimension in the chat: say where a room stands',
  'by what it stands against. Ask one question when something is unclear rather than guessing, and',
  'never write a paragraph.',
].join('\n')

/**
 * What the chat asks for once at the end of a run in which the architect wrote nothing down, so a
 * lesson and a want are not lost with the message.
 */
export const LESSONS_ASK = [
  'Before you finish: write down what this turn taught you and what it left you without.',
  'Call remember once for each lesson, in your own words, one line, with `replaces` set to the older',
  'line when the new one supersedes it, and call remember with `request` for a command you lacked.',
  'Do not write again a lesson or a request you already hold. Then answer with the word done and',
  'nothing else: the owner has your answer already.',
].join(' ')

const planLine = (plan: MemorySent['plans'][number]) =>
  `${plan.name}: ${plan.rooms
    .map((r) => `${r.name} ${r.x},${r.y} ${r.w}×${r.h}${r.angle ? ` at ${r.angle}°` : ''}`)
    .join('; ')}`

function body(sent: MemorySent, read: SheetRead, text: string): string {
  const parts = [AGENT_BRIEF, `Your commands:\n${commandsPage()}`]
  if (sent.lessons.length)
    parts.push(
      `What you have learned, which overrules everything above:\n- ${sent.lessons.join('\n- ')}`,
    )
  if (sent.requests.length)
    parts.push(
      `Commands you have asked for, and where each stands:\n- ${sent.requests
        .map((asked) => `${asked.text} (${asked.state})`)
        .join('\n- ')}`,
    )
  if (sent.feedback.length)
    parts.push(`What the owner has said before, oldest first:\n- ${sent.feedback.join('\n- ')}`)
  if (sent.plans.length)
    parts.push(`Plans the owner kept:\n- ${sent.plans.map(planLine).join('\n- ')}`)
  parts.push(`The house now: ${JSON.stringify(read)}`)
  parts.push(`The owner says: ${text}`)
  return parts.join('\n\n')
}

const bytes = (text: string) => new TextEncoder().encode(text).length

/** The prompt for one message; the oldest lines and plans go first when it will not fit. */
export function promptFor(input: { read: SheetRead; memory: Memory; text: string }): string {
  const sent = memorySent(input.memory)
  let held: MemorySent = sent
  let prompt = body(held, input.read, input.text)
  while (
    bytes(prompt) > PROMPT_CAP &&
    (held.feedback.length || held.lessons.length || held.plans.length || held.requests.length)
  ) {
    held = {
      feedback: held.feedback.slice(1),
      lessons: held.lessons.slice(1),
      requests: held.requests.slice(1),
      plans: held.plans.slice(1),
    }
    prompt = body(held, input.read, input.text)
  }
  return prompt
}
