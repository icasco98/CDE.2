/**
 * The page that teaches the architect its commands: the section of its own page, shipped with the
 * tool and sent with every message, so the words it reads and the words it was written are one.
 */

import page from '../../agent/architect.md?raw'

const HEADING = 'your commands'

/** One section of the page, from its heading to the next one, without the heading itself. */
function sectionOf(markdown: string, heading: string): string {
  const lines: string[] = []
  let inside = false
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      if (inside) break
      inside = line.slice(3).trim().toLowerCase() === heading
      continue
    }
    if (inside) lines.push(line)
  }
  return lines.join('\n').trim()
}

/** What the architect is told about its own commands. */
export const commandsPage = (markdown: string = page): string => sectionOf(markdown, HEADING)
