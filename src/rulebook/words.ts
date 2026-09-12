/** Small counts read as words, because a finding and a nudge are sentences, not tables. */
const counted = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]

export function inWords(count: number): string {
  return counted[count] ?? String(count)
}

/** A number of metres as a sentence says it: to a tenth, and no trailing nought. */
export function metresIn(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** Names read as a person says them: one, two joined by "and", more by commas and an "and". */
export function listedNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? 'nothing'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
