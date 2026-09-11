import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { connectionSource, defaultConnections } from './defaultConnections'
import { roomTypes } from './roomTypes'
import { EXTERIOR } from '../model'

const markdown = readFileSync(
  new URL('../../rulebook/default-connections.md', import.meta.url),
  'utf8',
)

function tableAfter(heading: string): readonly (readonly string[])[] {
  const start = markdown.indexOf(heading)
  expect(start).toBeGreaterThan(-1)
  const rows: string[][] = []
  for (const line of markdown.slice(start).split('\n').slice(1)) {
    const text = line.trim()
    if (!text.startsWith('|')) {
      if (rows.length > 0) break
      continue
    }
    const cells = text
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (cells.every((cell) => /^-+$/.test(cell))) continue
    rows.push(cells)
  }
  return rows.slice(1)
}

describe('the default-connection table in code matches the one a person reads', () => {
  const rows = tableAfter('## The table')

  it('holds the same rows in the same order', () => {
    const fromMarkdown = rows.map((cells) => cells.slice(0, 5))
    const fromCode = defaultConnections.map((row) => [
      row.id,
      row.from,
      row.to,
      row.kind,
      row.pairing,
    ])
    expect(fromCode).toEqual(fromMarkdown)
  })

  it('holds the same source and confidence for every row', () => {
    const fromMarkdown = rows.map((cells) => [cells[5], cells[6]])
    const fromCode = defaultConnections.map((row) => [row.source, row.confidence])
    expect(fromCode).toEqual(fromMarkdown)
  })
})

describe('the table stays inside the model', () => {
  const kinds = new Set(roomTypes.map((type) => type.id))

  it('names only kinds the room-type table knows, or the outside', () => {
    const named = defaultConnections.flatMap((row) => [row.from, row.to])
    expect(named.filter((kind) => kind !== EXTERIOR && !kinds.has(kind))).toEqual([])
  })

  it('reads D1, D2 and on, with no id used twice', () => {
    expect(defaultConnections.map((row) => row.id)).toEqual(
      defaultConnections.map((_, index) => `D${index + 1}`),
    )
  })

  it('proposes the front door from the outside only, and once', () => {
    const frontDoors = defaultConnections.filter((row) => row.kind === 'main-door')
    expect(frontDoors).toHaveLength(1)
    expect(frontDoors[0]?.from).toBe(EXTERIOR)
  })

  it('pairs one to one only between two rooms, never with the outside', () => {
    const oneToOne = defaultConnections.filter((row) => row.pairing === 'one')
    expect(oneToOne.filter((row) => row.from === EXTERIOR || row.to === EXTERIOR)).toEqual([])
  })

  it('says why every row is here, and every row is provisional', () => {
    expect(defaultConnections.filter((row) => row.source.length < 20)).toEqual([])
    expect(defaultConnections.filter((row) => row.confidence !== 'provisional')).toEqual([])
  })
})

describe('the source a person is shown', () => {
  it('is the row the proposal came from', () => {
    expect(connectionSource('D2')).toContain('its own street door')
  })

  it('is empty for a row that is not in the table', () => {
    expect(connectionSource('D999')).toBe('')
  })
})
