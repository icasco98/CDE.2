/**
 * The course: for every task, three runs, each a fresh architect that has only its own pages and the
 * desk. The architect's turn is played by a fresh Claude Code process on the sonnet model; the
 * runner gives it the pack, keeps its last words, and runs `check` itself.
 *
 *   node course/course.mjs tools
 *   node course/course.mjs run <task> <n>
 *   node course/course.mjs all [--only t1-give,t2-court] [--runs 3]
 *   node course/course.mjs summary [harder]
 */

import { register } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

register('./ts-resolve.mjs', import.meta.url)

const here = dirname(fileURLToPath(import.meta.url))
const { layoutTools } = await import('../src/sheet/index.ts')
const { COURSE, HARDER, TASKS, taskNamed } = await import('./tasks.mjs')
const { packFor, writeTools } = await import('./pack.mjs')

const resultsDir = join(here, 'results')
const runDir = (key, n) => join(here, 'runs', `${key}-${n}`)

/** The descriptions the architect is shown come from a desk with nothing on it. */
const emptyDesk = {
  read: () => TASKS[0].sheet(),
  write: (change) => change.result,
  say: () => {},
  note: () => {},
  request: () => {},
}

const tools = () => layoutTools(emptyDesk, 0)

/** The architect's own last words, as its process reported them. */
function lastWords(asked) {
  try {
    return String(JSON.parse(asked.stdout || '{}').result ?? '').trim()
  } catch {
    return (asked.stdout || asked.stderr || '').trim().slice(0, 2000)
  }
}

const ARCHITECT_TIMEOUT = 15 * 60 * 1000

/** One fresh architect: it has the pack, the shell, and the desk's two commands it may run. */
function playArchitect(task, run) {
  const scratch = join(runDir(task.key, run), 'cwd')
  mkdirSync(scratch, { recursive: true })
  const desk = join(here, 'run.mjs')
  const asked = spawnSync(
    'claude',
    [
      '-p',
      packFor(task, run, tools()),
      '--model',
      'sonnet',
      '--output-format',
      'json',
      '--allowed-tools',
      `Bash(node ${desk}:*)`,
      '--disallowed-tools',
      'Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit',
    ],
    { cwd: scratch, encoding: 'utf8', timeout: ARCHITECT_TIMEOUT, maxBuffer: 64 * 1024 * 1024 },
  )
  const words = lastWords(asked)
  return words || '(the architect said nothing)'
}

function oneRun(key, run) {
  const task = taskNamed(key)
  if (!task) throw new Error(`no task called ${key}`)
  rmSync(runDir(task.key, run), { recursive: true, force: true })
  mkdirSync(runDir(task.key, run), { recursive: true })
  const words = playArchitect(task, run)
  writeFileSync(join(runDir(task.key, run), 'words.txt'), `${words}\n`)
  const checked = spawnSync('node', [join(here, 'run.mjs'), task.key, String(run), 'check'], {
    encoding: 'utf8',
  })
  process.stdout.write(checked.stdout || checked.stderr || 'the check said nothing\n')
  return checked.stdout ?? ''
}

/** The record of one run as the desk wrote it. */
const recordOf = (key, run) => {
  const file = join(resultsDir, `${key}-${run}.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

const KINDS = {
  narration: 'narration',
  'wrong choice': 'wrong choice',
  'tool fault': 'tool fault',
  'rule broken': 'rule broken',
}

/** The judgement on each failure, and what the course could not test, read back from beside it. */
const judgement = (file) =>
  existsSync(join(here, file))
    ? JSON.parse(readFileSync(join(here, file), 'utf8'))
    : { failures: {}, notes: [] }

/** The two courses, each with its own tasks, its judgement and the page it is written to. */
const COURSES = {
  first: {
    tasks: COURSE,
    judgement: 'judgement.json',
    out: 'summary.md',
    head: [
      '# The course: how the architect used the tool',
      '',
      'Thirty runs, three for each task, each a fresh architect with its own two pages, the tool',
      'descriptions and the desk. Every pass condition is read from the sheet the tool left behind.',
    ],
  },
  harder: {
    tasks: HARDER,
    judgement: 'judgement-harder.json',
    out: 'harder.md',
    head: [
      '# The harder course: the architect under pressure',
      '',
      'Thirty more runs, three for each of ten tasks that take several moves, hold a trap, or say',
      'too little. Each pass condition is read from the model, or — where the task is about what the',
      "architect said — from the run's own record of its words.",
    ],
  },
}

const changedAnything = (record) =>
  record.calls.some(
    (c) =>
      c.tool !== 'read_sheet' &&
      c.result &&
      !c.result.error &&
      (c.result.changed?.moves?.length ||
        c.result.changed?.born?.length ||
        c.result.changed?.gone?.length ||
        c.result.tookBack),
  )

function summary(which) {
  const { tasks: TASKS, head, out, judgement: file } = COURSES[which] ?? COURSES.first
  const { failures: judged = {}, notes = [], rules = [] } = judgement(file)
  const lines = [...head, '', '| Task | Passed | Runs |', '| --- | --- | --- |']
  const failures = []
  for (const task of TASKS) {
    const runs = [1, 2, 3].map((n) => recordOf(task.key, n))
    const passed = runs.filter((r) => r?.pass).length
    lines.push(
      `| ${task.key} — ${task.title} | ${passed}/3 | ${runs
        .map((r, i) => `${i + 1}: ${r ? (r.pass ? 'PASS' : 'FAIL') : '—'}`)
        .join(', ')} |`,
    )
    for (const [i, record] of runs.entries())
      if (record && !record.pass) {
        const key = `${task.key}-${i + 1}`
        const held = judged[key] ?? {}
        const kind = KINDS[held.kind] ?? (changedAnything(record) ? 'wrong choice' : 'narration')
        const rule = held.rule ? ` (${held.rule})` : ''
        failures.push(`- **${key}** · ${kind}${rule} · ${held.why ?? 'see the record'}`)
      }
  }
  lines.push('', '## The failures, one line each', '')
  lines.push(...(failures.length ? failures : ['- none']))
  if (rules.length)
    lines.push(
      '',
      '## The rules that are never broken, run by run',
      '',
      ...rules.map((r) => `- ${r}`),
    )
  if (notes.length)
    lines.push('', '## What the course could not test', '', ...notes.map((n) => `- ${n}`))
  lines.push('', '## The numbers behind each run', '')
  for (const task of TASKS)
    for (const n of [1, 2, 3]) {
      const record = recordOf(task.key, n)
      if (!record) continue
      const numbers = Object.entries(record.numbers)
        .map(([name, value]) => `${name} ${value}`)
        .join('; ')
      const commands = record.calls.filter((c) => c.tool !== 'read_sheet').length
      lines.push(
        `- **${task.key}-${n}** ${record.pass ? 'PASS' : 'FAIL'} · ` +
          `${commands} command${commands === 1 ? '' : 's'} · ${numbers}`,
      )
    }
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(join(resultsDir, out), `${lines.join('\n')}\n`)
  process.stdout.write(`${lines.slice(4, 18).join('\n')}\n`)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'tools') {
  writeTools(tools())
  process.stdout.write(`the tool descriptions are in course/tools.txt\n`)
} else if (command === 'run') {
  oneRun(rest[0], Number(rest[1] ?? 1))
} else if (command === 'all') {
  const only = rest.includes('--only') ? rest[rest.indexOf('--only') + 1].split(',') : null
  const runs = rest.includes('--runs') ? Number(rest[rest.indexOf('--runs') + 1]) : 3
  for (const task of TASKS)
    if (!only || only.includes(task.key)) for (let n = 1; n <= runs; n++) oneRun(task.key, n)
} else if (command === 'summary') {
  summary(rest[0] === 'harder' ? 'harder' : 'first')
} else {
  process.stdout.write('The commands are tools, run, all and summary.\n')
  process.exitCode = 1
}
