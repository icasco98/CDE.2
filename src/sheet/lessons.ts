/**
 * The architect's starting lessons: the page it has written for itself, shipped with the tool and
 * read as data. What it writes at runtime is added to these, never instead of them.
 */

import page from '../../agent/lessons.md?raw'

export type RequestState = 'open' | 'built' | 'refused'

export type Request = { text: string; state: RequestState }

const stateOf = (mark: string): RequestState =>
  mark === 'built' ? 'built' : mark === 'refused' ? 'refused' : 'open'

/** The bullets under one heading, each line of a bullet joined into the one sentence it is. */
function bulletsUnder(markdown: string, heading: string): string[] {
  const out: string[] = []
  let inside = false
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) {
      inside = line.slice(3).trim().toLowerCase() === heading
      continue
    }
    if (!inside) continue
    if (line.startsWith('- ')) out.push(line.slice(2).trim())
    else if (line.startsWith('  ') && out.length) out[out.length - 1] += ` ${line.trim()}`
  }
  return out
}

/** The lessons as written, one line each. */
export const startingLessons = (markdown: string = page): string[] =>
  bulletsUnder(markdown, 'rules')

/** The requests as written, each with the state the cofounder left on it. */
export const startingRequests = (markdown: string = page): Request[] =>
  bulletsUnder(markdown, 'requests').map((line) => {
    const marked = /^(.*?)\s*\((open|built|refused)\)$/.exec(line)
    return marked
      ? { text: marked[1]!.trim(), state: stateOf(marked[2]!) }
      : { text: line, state: 'open' as RequestState }
  })
