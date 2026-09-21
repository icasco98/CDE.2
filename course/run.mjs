/**
 * The desk one architect works at for one run: the sheet in a file, the tool's own commands over it,
 * and the pass condition read from the sheet afterwards. Three commands and nothing else.
 *
 *   node course/run.mjs <task> <n> read
 *   node course/run.mjs <task> <n> call '{"tool":"place_against","input":{…}}'
 *   node course/run.mjs <task> <n> check
 */

import { register } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

register('./ts-resolve.mjs', import.meta.url)

const here = dirname(fileURLToPath(import.meta.url))
const { layoutTools } = await import('../src/sheet/index.ts')
const { taskNamed } = await import('./tasks.mjs')

export const runDir = (key, n) => join(here, 'runs', `${key}-${n}`)
const resultsDir = join(here, 'results')

const stateFile = (key, n) => join(runDir(key, n), 'state.json')

export function readState(key, n) {
  const file = stateFile(key, n)
  if (!existsSync(file)) return { task: key, run: Number(n), onScreen: 0, told: false, calls: [] }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const keepState = (state) => {
  mkdirSync(runDir(state.task, state.run), { recursive: true })
  writeFileSync(stateFile(state.task, state.run), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * The sheet as the recorded calls left it: the starting sheet, then every call the architect has
 * made, through the tool's own commands in one hand — so undo and the memory are the tool's.
 */
export function replay(task, calls) {
  let sheet = task.sheet()
  const log = []
  const notes = []
  const requests = []
  const desk = {
    read: () => sheet,
    write: (change) => {
      sheet = change.sheet
      return change.result
    },
    say: (line) => log.push(line),
    note: (text, replaces) => notes.push({ text, ...(replaces ? { replaces } : {}) }),
    request: (text) => requests.push(text),
  }
  const tools = layoutTools(desk, task.onScreen)
  const apply = (asked) => {
    const tool = tools.find((t) => t.name === asked.tool)
    if (!tool)
      return {
        error: `${String(asked.tool ?? '')} is no command of mine: ${tools.map((t) => t.name).join(', ')}`,
      }
    try {
      return tool.execute(asked.input && typeof asked.input === 'object' ? asked.input : {})
    } catch (thrown) {
      return { error: String(thrown?.message ?? thrown) }
    }
  }
  for (const call of calls) apply(call)
  return { apply, log, notes, requests, sheet: () => sheet }
}

const out = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

const readingOf = (state, task) => {
  const hand = replay(task, state.calls)
  return hand.apply({ tool: 'read_sheet', input: {} })
}

function doRead(state, task) {
  if (!state.told) {
    process.stdout.write(
      `Task: ${task.title}\nThe owner says: “${task.instruction}”\n` +
        `The storey on screen is the ${state.onScreen === 0 ? 'Ground' : 'First'}.\n\n`,
    )
    state.told = true
  }
  const reading = readingOf(state, task)
  state.calls.push({ tool: 'read_sheet', input: {}, result: reading })
  keepState(state)
  out(reading)
}

function doCall(state, task, text) {
  let asked
  try {
    asked = JSON.parse(text ?? '')
  } catch {
    process.stdout.write('The call is one JSON object: {"tool":…,"input":{…}}\n')
    process.exitCode = 1
    return
  }
  const hand = replay(task, state.calls)
  const result = hand.apply({ tool: asked.tool, input: asked.input })
  state.calls.push({ tool: asked.tool, input: asked.input ?? {}, result })
  keepState(state)
  out(result)
}

function doCheck(state, task) {
  const hand = replay(task, state.calls)
  const sheet = hand.sheet()
  const record = { ...state, calls: state.calls }
  const outcome = task.check(sheet, record)
  const words = join(runDir(state.task, state.run), 'words.txt')
  const lines = Object.entries(outcome.numbers).map(([name, value]) => `  ${name}: ${value}`)
  process.stdout.write(`${outcome.pass ? 'PASS' : 'FAIL'} · ${task.key} run ${state.run}\n`)
  process.stdout.write(`${lines.join('\n')}\n`)
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(
    join(resultsDir, `${task.key}-${state.run}.json`),
    `${JSON.stringify(
      {
        task: task.key,
        title: task.title,
        run: state.run,
        instruction: task.instruction,
        pass: outcome.pass,
        numbers: outcome.numbers,
        calls: state.calls,
        said: hand.log,
        notes: hand.notes,
        requests: hand.requests,
        lastWords: existsSync(words) ? readFileSync(words, 'utf8').trim() : '',
      },
      null,
      2,
    )}\n`,
  )
}

/** The desk is a command the architect types; imported instead, it is only these functions. */
const asked = process.argv[1] ? resolve(process.argv[1]) : ''
const [key, n, command, argument] = process.argv.slice(2)
const task = asked === fileURLToPath(import.meta.url) ? taskNamed(key ?? '') : null
if (asked !== fileURLToPath(import.meta.url)) {
  // imported by the runner or the drawings: nothing to do
} else if (!task) {
  process.stdout.write('The task is one of: t1-give … t10-door-refused\n')
  process.exitCode = 1
} else {
  const state = readState(task.key, n ?? '1')
  state.task = task.key
  state.run = Number(n ?? 1)
  state.onScreen = task.onScreen
  if (command === 'read') doRead(state, task)
  else if (command === 'call') doCall(state, task, argument)
  else if (command === 'check') doCheck(state, task)
  else {
    process.stdout.write('The commands are read, call and check.\n')
    process.exitCode = 1
  }
}
