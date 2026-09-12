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
