import type { Result, Violation } from '../../model'

/** The store's own words, put plainly where they name parts of the model. */
const plainly: Readonly<Record<string, string>> = {
  'storey-in-use': 'The top storey still holds rooms. Move them down first.',
  'last-storey': 'A project has one storey at least.',
  'bad-area': 'A target area is a number of square metres above zero.',
}

const say = (problem: Violation): string => plainly[problem.code] ?? problem.message

export function refusalOf(result: Result<unknown>): string | null {
  return result.ok ? null : result.problems.map(say).join(' ')
}
