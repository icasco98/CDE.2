export function metres2(value: number): string {
  return String(Math.round(value * 10) / 10)
}

const named = ['Ground', 'First', 'Second']

export function storeyLabel(storey: number): string {
  return named[storey] ?? `Storey ${storey}`
}
