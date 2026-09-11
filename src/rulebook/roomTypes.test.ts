import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { roomTypes } from './roomTypes'
import { plotBandFor, typicalArea } from './sizes'
import { byPlotBand, type RoomType } from './types'

const markdown = readFileSync(new URL('../../rulebook/room-types.md', import.meta.url), 'utf8')

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

function typicalCell(type: RoomType): string {
  const typical = type.typical
  if (typical === byPlotBand) return byPlotBand
  if (typeof typical === 'number') return type.perCar ? `${typical} per car` : String(typical)
  return `${typical.min} to ${typical.max} m wide`
}

function rangeCell(type: RoomType): string {
  const range = type.range
  if (typeof range === 'string') return range
  return type.perCar ? `${range.min} to ${range.max} per car` : `${range.min} to ${range.max}`
}

describe('the room-type table in code matches the one a person reads', () => {
  const rows = tableAfter('## The table')

  it('holds the same kinds in the same order', () => {
    expect(rows.map((cells) => cells[0])).toEqual(roomTypes.map((type) => type.label))
  })

  it('holds the same typical size, range and tier for every kind', () => {
    const fromMarkdown = rows.map((cells) => [cells[0], cells[3], cells[4], cells[7]])
    const fromCode = roomTypes.map((type) => [
      type.label,
      typicalCell(type),
      rangeCell(type),
      type.tier,
    ])
    expect(fromCode).toEqual(fromMarkdown)
  })

  it('holds the same Arabic label and category for every kind', () => {
    const fromMarkdown = rows.map((cells) => [cells[1], cells[6]])
    const fromCode = roomTypes.map((type) => [type.arabic, type.category])
    expect(fromCode).toEqual(fromMarkdown)
  })

  it('holds the same plot bands for the diwaniya and the two living rooms', () => {
    const rowsByBand = tableAfter('## Sizes that scale with the plot')
    const samples = [300, 500, 900]
    const kinds = ['diwaniya', 'formal-living', 'family-living']
    const fromCode = samples.map((plot) =>
      kinds.map((kind) => {
        const band = plotBandFor(kind, plot)
        return band ? `${band.min} to ${band.max}` : ''
      }),
    )
    expect(fromCode).toEqual(rowsByBand.map((cells) => cells.slice(1)))
  })
})

describe('typical area', () => {
  it('reads the plot band the plot falls in', () => {
    expect(typicalArea('diwaniya', 300)).toBe(40)
    expect(typicalArea('diwaniya', 400)).toBe(40)
    expect(typicalArea('diwaniya', 500)).toBe(52.5)
    expect(typicalArea('diwaniya', 750)).toBe(52.5)
    expect(typicalArea('diwaniya', 900)).toBe(75)
  })

  it('reads the same bands for the two living rooms', () => {
    expect(typicalArea('formal-living', 300)).toBe(27)
    expect(typicalArea('family-living', 500)).toBe(38.5)
    expect(typicalArea('formal-living', 900)).toBe(47.5)
  })

  it('reads a fixed size for every other kind, and a run for a hallway', () => {
    expect(typicalArea('bedroom', 500)).toBe(18)
    expect(typicalArea('garage', 500)).toBe(18)
    expect(typicalArea('hallway', 500)).toBe(12)
  })

  it('falls back to the other-room size for a kind it does not know', () => {
    expect(typicalArea('gymnasium', 500)).toBe(12)
  })
})
