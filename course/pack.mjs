/**
 * What one architect is given for one run: its own two pages, the tool descriptions as the tool
 * writes them, the desk's three commands, and the rules of the run. Nothing of the source.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

export const toolsFile = join(here, 'tools.txt')

/** The tool descriptions, exactly as `src/sheet/agent.ts` writes them. */
export function writeTools(tools) {
  const text = tools
    .map((tool) => `${tool.name}\n${tool.description}\n${JSON.stringify(tool.inputSchema ?? {})}`)
    .join('\n\n')
  writeFileSync(toolsFile, `${text}\n`)
  return text
}

const page = (name) => readFileSync(join(root, 'agent', name), 'utf8').trim()

export function packFor(task, run, tools) {
  const desk = `node ${join(here, 'run.mjs')} ${task.key} ${run}`
  return `You are the architect described in the two pages below. You are at a desk with one
zoning sheet on it, and one job from the owner. You work only through the desk.

The desk takes three commands in the shell, and nothing else you do reaches the sheet:

    ${desk} read
    ${desk} call '<json>'
    ${desk} check

\`read\` prints the reading your \`read_sheet\` command gives, and the first time also the
owner's words. \`call\` applies one command of yours — the JSON is
{"tool":"<command>","input":{…}} — and prints exactly what the command returned. Every
command in your pages is called that way, \`do\` included.

The rules of this run:

- You may not read any file of the tool, its tests, the desk's own program or any other run.
  You may not use any tool but the shell, and in the shell only the two commands above.
- Never run \`check\`. Someone else checks your work.
- Read the sheet first, then act, then read again if you need to.
- Stop when you believe the owner's job is done, and answer in your own voice, at most five
  short lines, saying what you did. If a command refused you, say that instead.

--- agent/architect.md ---

${page('architect.md')}

--- agent/lessons.md ---

${page('lessons.md')}

--- your commands, as the tool describes them ---

${writeTools(tools)}
`
}
