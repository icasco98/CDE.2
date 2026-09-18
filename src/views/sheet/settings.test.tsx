import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULTS, sampleSheet, setSetting, type Settings } from '../../sheet'
import { SettingsWindow } from './Settings'
import { TABS, rowNames, tabFor, type Row } from './settings'

/** The window as the owner sees it, one tab at a time, and the settings its rows stand for. */
function rendered(tab: number): string {
  return renderToStaticMarkup(
    <SettingsWindow
      settings={DEFAULTS}
      tab={tab}
      onTab={() => {}}
      onChange={() => {}}
      onResetSpec={() => {}}
      onStandardColours={() => {}}
      onClose={() => {}}
      specState=""
    />,
  )
}

const shownSettings = (): string[] => {
  const names: string[] = []
  for (let tab = 0; tab < TABS.length; tab++)
    for (const found of rendered(tab).matchAll(/data-setting="([^"]+)"/g)) names.push(found[1]!)
  return names
}

const rows = (): Row[] => TABS.flatMap((tab) => tab.rows)

describe('the settings window', () => {
  it('has a row for every setting, so nothing settable stays only in code', () => {
    const shown = shownSettings()
    for (const name of Object.keys(DEFAULTS)) expect(shown).toContain(name)
  })

  it('stands for settings the sheet has, and says what each one does', () => {
    for (const name of rowNames()) expect(Object.keys(DEFAULTS)).toContain(name)
    expect(new Set(rowNames()).size).toBe(rowNames().length)
    for (const tab of TABS) expect(tab.rows.some((row) => !!row.hint)).toBe(true)
  })

  it('is the mock’s nine tabs, and opens on the tab for the step in use', () => {
    expect(TABS.map((tab) => tab.title)).toEqual([
      'Landing and overlaps',
      'Snapping',
      'Drawing and Reshape',
      'Doors and openings',
      'Labels',
      'Spaces and boundary',
      'Motion',
      'Colours',
      'Storeys',
    ])
    expect(tabFor('drawing', 0)).toBe(2)
    expect(tabFor('zoning', 5)).toBe(5)
    expect(tabFor('zoning', 99)).toBe(0)
  })

  it('writes the tab’s rows out with their explanations', () => {
    expect(rendered(0)).toContain('Hallway width')
    expect(rendered(7)).toContain('Reception')
    expect(rendered(8)).toContain("The stair's top, at most".replace("'", '&#x27;'))
  })
})

describe('what each kind of row may be set to', () => {
  const sheet = sampleSheet()
  const set = (name: string, value: string | number) =>
    setSetting(sheet, { name, value }).sheet.settings[name as keyof Settings]

  it('takes every choice a switch or list offers, and refuses the rest', () => {
    for (const row of rows())
      if (row.kind === 'seg' || row.kind === 'select')
        for (const choice of row.choices) expect(set(row.name, choice.value)).toEqual(choice.value)
    expect(setSetting(sheet, { name: 'boundary', value: 'somewhere' }).result.ok).toBe(false)
    expect(setSetting(sheet, { name: 'dims', value: 'lots' }).result.ok).toBe(false)
  })

  it('holds every slider between the ends it is drawn with', () => {
    for (const row of rows())
      if (row.kind === 'range') {
        expect(set(row.name, row.min)).toBe(row.min)
        expect(set(row.name, row.max)).toBe(row.max)
        expect(set(row.name, row.min - 100)).toBe(row.min)
        expect(set(row.name, row.max + 100)).toBe(row.max)
        expect(setSetting(sheet, { name: row.name, value: 'wide' }).result.ok).toBe(false)
      }
  })

  it('takes a colour per category as #rrggbb and nothing else', () => {
    for (const category of Object.keys(DEFAULTS.colors)) {
      const out = setSetting(sheet, { name: `color.${category}`, value: '#123456' })
      expect(out.result.ok).toBe(true)
      expect(out.sheet.settings.colors[category]).toBe('#123456')
      expect(setSetting(sheet, { name: `color.${category}`, value: 'blue' }).result.ok).toBe(false)
    }
    expect(setSetting(sheet, { name: 'colors', value: {} }).result.ok).toBe(false)
  })
})
