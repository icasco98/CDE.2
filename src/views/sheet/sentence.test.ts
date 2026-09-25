import { describe, expect, it } from 'vitest'
import { fixtureSheet } from '../../sheet/fixture'
import { DEFAULTS, report, setSetting } from '../../sheet'
import { drawingSentence, measuringSentence, sentenceOf, snapWord } from './sentence'

const text = (parts: { lead?: string; text: string }[]) =>
  parts.map((p) => (p.lead ? `${p.lead} ${p.text}` : p.text)).join(' · ')

describe('the sentence under the sheet', () => {
  const sheet = fixtureSheet()

  it('opens with the storey, what is placed, what was asked and the buildable area', () => {
    const parts = sentenceOf(report(sheet, 0), sheet.settings)
    expect(parts[0]).toEqual({
      lead: 'Ground',
      text: '344 m² placed of 305 m² asked, on 365.5 m² buildable',
    })
  })

  it('reads the boundary side by side, and marks a side over its budget', () => {
    const parts = sentenceOf(report(sheet, 0), sheet.settings)
    const west = parts.find((p) => p.text.startsWith('on the west boundary'))
    expect(west).toEqual({ text: 'on the west boundary 13 of 12.5 m, over by 0.5 m', bad: true })
    expect(parts.some((p) => p.text === 'on the north boundary 7.8 of 10 m')).toBe(true)
  })

  it('names the shortfalls, the walk and the hallways', () => {
    const walk = {
      reached: 17,
      all: 17,
      unreached: [],
      from: 'outside' as const,
      hallways: [
        { name: 'Ground Hallway', doors: 7 },
        { name: 'service hallway', doors: 4 },
      ],
      entryWithoutOutsideDoor: null,
      diwaniyaWithoutStreetDoor: null,
      cannotOpen: [],
    }
    const line = text(sentenceOf({ ...report(sheet, 0), walk }, sheet.settings))
    expect(line).toContain('Diwaniya 38.5 of 60')
    expect(line).toContain('Walk 17 of 17 reached from outside')
    expect(line).toContain('Ground Hallway serves 7 doors')
    expect(line).toContain('service hallway serves 4 doors')
  })

  it('says what the project warns of that the sheet cannot draw, a missing stair first', () => {
    const parts = sentenceOf(report(sheet, 0), sheet.settings, ['No stair connects the storeys'])
    expect(parts[1]).toEqual({ text: 'No stair connects the storeys', bad: true })
  })

  it('counts enclosed spaces only where the settings show them', () => {
    const shown = setSetting(sheet, { name: 'showPockets', value: 1 }).sheet
    const line = text(sentenceOf(report(shown, 0), shown.settings))
    expect(line).toMatch(/3 enclosed spaces, [\d.]+ m² together/)
    expect(text(sentenceOf(report(sheet, 0), sheet.settings))).not.toContain('enclosed')
  })

  it('says how many overlaps wait, in the plural the mock uses', () => {
    const one = sentenceOf(
      { ...report(sheet, 0), overlaps: [{ a: 'A', b: 'B', area: 2 }] },
      sheet.settings,
    )
    expect(one.some((p) => p.text.startsWith('1 overlap ·') && p.bad)).toBe(true)
    const two = sentenceOf(
      {
        ...report(sheet, 0),
        overlaps: [
          { a: 'A', b: 'B', area: 2 },
          { a: 'A', b: 'C', area: 1 },
        ],
      },
      sheet.settings,
    )
    expect(two.some((p) => p.text.startsWith('2 overlaps ·'))).toBe(true)
  })

  it('reads a measure as its length, its angle and what each point caught', () => {
    const line = text(
      measuringSentence({ a: [0, 0], b: [7.75, 0], at: null, kindA: 'corner', kindB: 'corner' }),
    )
    expect(line).toContain('7.8 m at 0°')
    expect(line).toContain('7.8 across, 0 down')
    expect(line).toContain('on a corner to on a corner')
  })

  it('reads a drawing as what is in hand against the target', () => {
    const line = text(
      drawingSentence({
        name: 'Bedroom',
        target: 14,
        shape: 'poly',
        area: 4.7375,
        snapKind: 'corner',
        reshaping: false,
      }),
    )
    expect(line).toContain('Drawing Bedroom')
    expect(line).toContain('4.7 of 14 m²')
    expect(line).toContain('on a corner')
  })

  it('names what a drawn point caught in the mock’s words', () => {
    expect(snapWord('meet')).toBe('where two lines meet')
    expect(snapWord('grid')).toBe('on the grid')
    expect(snapWord('nothing at all')).toBe('free')
  })

  it('reads both storeys against the 1050 m² the ratio allows, and marks it when over', () => {
    const two = { ...report(sheet, 1), floors: [344, 120], total: 464 }
    expect(text(sentenceOf(two, DEFAULTS))).toContain(
      'ground 344 + first 120 = 464 m² of 1050 m² the ratio allows',
    )
    const over = { ...two, floors: [600, 600], total: 1200, overRatio: true }
    const parts = sentenceOf(over, DEFAULTS)
    expect(text(parts)).toContain('over the 1050 m² the ratio allows')
    expect(parts.some((part) => part.bad && part.text.includes('ratio allows'))).toBe(true)
  })

  it('leaves the ratio unread when the setting is off', () => {
    const quiet = { ...DEFAULTS, ratioWarn: 0 }
    const read = { ...report(sheet, 0), floors: [344, 120], total: 464, ratioRead: false }
    const line = text(sentenceOf(read, quiet))
    expect(line).toContain('ground 344 + first 120 = 464 m²')
    expect(line).not.toContain('ratio allows')
  })
})
