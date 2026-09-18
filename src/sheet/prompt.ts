/**
 * The one turn the assistant reads: how it should work and how it should speak, the sheet as it
 * stands, its own memory, and what the owner just said. It is trimmed to stay inside the runtime's
 * prompt cap, oldest memory first.
 */

import type { SheetRead } from './agent'
import { memorySent, type Memory, type MemorySent } from './memory'

/** The runtime takes 64 KiB of input; the prompt is kept under this so a full memory still fits. */
export const PROMPT_CAP = 60_000

export const AGENT_BRIEF = [
  "You lay out a Kuwaiti villa's zoning plan on the sheet in front of the owner, through the tools,",
  "the way an architect's hand would. Coordinates are plot metres, x east, y south; a room's x,y is",
  "its frame's top-left corner. Work in the order of importance, most important first, several rooms",
  'a call, and read the sheet after each batch.',
  '',
  'The logic of the house: the diwaniya group (the diwaniya, its WC and its prep kitchen) stands on',
  'the street with its own street door; the entry is on the street with the formal living beside it;',
  'the family rooms sit behind them; the service rooms (maid, driver, store, laundry) go at the back',
  'or on a side; the hallway joins the entry to the rest and the stair stands off it. Rooms share',
  'walls and leave no slivers. Keep every area near its target and every room inside the line the',
  'ground floor may reach. Fix overlaps and spills by moving or resizing rooms, not by leaving them.',
  'Zones only: no doors, no heights, no storeys.',
  '',
  'How you speak: chat, at most five short lines, no headings and no numbered steps. Name rooms by',
  'their program names. Ask one question at a time when you are unsure, and never write a paragraph.',
].join('\n')

const planLine = (plan: MemorySent['plans'][number]) =>
  `${plan.name}: ${plan.rooms
    .map((r) => `${r.name} ${r.x},${r.y} ${r.w}×${r.h}${r.angle ? ` at ${r.angle}°` : ''}`)
    .join('; ')}`

function body(sent: MemorySent, read: SheetRead, text: string): string {
  const parts = [AGENT_BRIEF]
  if (sent.feedback.length)
    parts.push(`What the owner has said before, oldest first:\n- ${sent.feedback.join('\n- ')}`)
  if (sent.notes.length) parts.push(`What you noted for yourself:\n- ${sent.notes.join('\n- ')}`)
  if (sent.plans.length)
    parts.push(`Plans the owner kept:\n- ${sent.plans.map(planLine).join('\n- ')}`)
  parts.push(`The sheet now: ${JSON.stringify(read)}`)
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
    (held.feedback.length || held.notes.length || held.plans.length)
  ) {
    held = {
      feedback: held.feedback.slice(1),
      notes: held.notes.slice(1),
      plans: held.plans.slice(1),
    }
    prompt = body(held, input.read, input.text)
  }
  return prompt
}
