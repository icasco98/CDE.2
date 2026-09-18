import { expect, test } from '@playwright/test'
import { exported, openSheet, textOf } from './exporting'

test('the two buttons hand over a PDF and a DXF of the sheet as it stands', async ({ page }) => {
  await openSheet(page)
  const rooms = await page.locator('svg.sheet g.room[data-room]:not(.under)').count()
  expect(rooms).toBeGreaterThan(4)

  const pdf = await exported(page, 'Export PDF')
  expect(pdf.suggestedFilename()).toBe('untitled.pdf')
  expect((await textOf(pdf)).startsWith('%PDF-')).toBe(true)

  const dxf = await exported(page, 'Export DXF')
  expect(dxf.suggestedFilename()).toBe('untitled.dxf')
  const drawing = await textOf(dxf)
  expect(drawing.startsWith('0\nSECTION')).toBe(true)
  expect(drawing.endsWith('0\nEOF\n')).toBe(true)
  // One opening per room outline on the ground storey's rooms layer, so the rooms on screen split
  // the file in as many pieces, and the ground storey has a layer of its own to hold them.
  expect(drawing).toContain('0\nLAYER\n2\nS0-ROOMS\n')
  expect(drawing.split('0\nPOLYLINE\n8\nS0-ROOMS\n').length - 1).toBeGreaterThanOrEqual(rooms)
})

test('a project named by hand names the files it exports', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Project name').fill('Al Rai villa')
  expect((await exported(page, 'Export PDF')).suggestedFilename()).toBe('al-rai-villa.pdf')
  expect((await exported(page, 'Export DXF')).suggestedFilename()).toBe('al-rai-villa.dxf')
})
