import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Strings match as whole identifiers, case-sensitively. Regexes match as written.
const forbidden: ReadonlyArray<string | RegExp> = [
  'generateLayout',
  /annealing/i,
  'scoreCandidate',
  'evaluateConfig',
  'compareEvaluations',
  'buildScenario',
  'runScenario',
  'unnecessaryGaps',
  'corridorWaste',
  'circulationRatio',
  'deadEndHallways',
  'overhangs(',
  'frozenAt',
  'arrowIsLive',
  'liveArrowIds',
  'syncFrozenArrowPoints',
  'memoByBoxes',
  'buildTouchGraph',
  'suggestArrows',
  /fastapi/i,
  /uvicorn/i,
  /sqlite/i,
  /handoff/i,
  /\bTask \d/,
  /\bStep \d/,
  /\bPhase \d/,
]

const scannedRoots = ['src', 'tests', '.github']
const guardFile = join('tests', 'guard.test.ts')

type Violation = { file: string; line: number; pattern: string }

const identifierChar = /[\w$]/

function toRegExp(entry: string | RegExp): RegExp {
  if (entry instanceof RegExp) return entry
  const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const head = identifierChar.test(entry.charAt(0)) ? '(?<![\\w$])' : ''
  const tail = identifierChar.test(entry.charAt(entry.length - 1)) ? '(?![\\w$])' : ''
  return new RegExp(head + escaped + tail)
}

const patterns = forbidden.map((entry) => ({ label: String(entry), regExp: toRegExp(entry) }))

function filesUnder(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function scan(root: string, skip: ReadonlyArray<string> = []): Violation[] {
  if (!existsSync(root)) return []
  const violations: Violation[] = []
  for (const file of filesUnder(root)) {
    if (skip.includes(file)) continue
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        for (const { label, regExp } of patterns) {
          if (regExp.test(text)) violations.push({ file, line: index + 1, pattern: label })
        }
      })
  }
  return violations
}

describe('guard against removed concepts', () => {
  it('finds none of the forbidden names in the repository', () => {
    const violations = scannedRoots.flatMap((root) => scan(root, [guardFile]))
    expect(violations).toEqual([])
  })

  it('catches a planted name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-'))
    try {
      writeFileSync(join(dir, 'planted.ts'), 'export const x = generateLayout(rooms)\n')
      writeFileSync(join(dir, 'notes.txt'), 'see Phase 2 of the plan\n')
      writeFileSync(join(dir, 'clean.ts'), 'export const generateLayoutPreview = 1\n')
      const found = scan(dir).map((v) => [relative(dir, v.file), v.line, v.pattern])
      expect(found).toEqual([
        ['notes.txt', 1, String(/\bPhase \d/)],
        ['planted.ts', 1, 'generateLayout'],
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
