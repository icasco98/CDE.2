import { expect, test } from '@playwright/test'
import { exported, openZoning, place, textOf } from './exporting'

test('the two buttons hand over a PDF and a DXF of the plan as it stands', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5)
  await place(page, 'Dining', 13, 5)
  await expect(page.locator('[data-room]')).toHaveCount(2)

  const pdf = await exported(page, 'Export PDF')
  expect(pdf.suggestedFilename()).toBe('untitled.pdf')
  expect((await textOf(pdf)).startsWith('%PDF-')).toBe(true)

  const dxf = await exported(page, 'Export DXF')
  expect(dxf.suggestedFilename()).toBe('untitled.dxf')
  const drawing = await textOf(dxf)
  expect(drawing.startsWith('0\nSECTION')).toBe(true)
  // One opening per room polyline on the ground storey's rooms layer, so two rooms split it in three.
  expect(drawing.split('0\nPOLYLINE\n8\nS0-ROOMS\n')).toHaveLength(3)
  expect(drawing.endsWith('0\nEOF\n')).toBe(true)
})

test('a project named by hand names the files it exports', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Project name').fill('Al Rai villa')
  expect((await exported(page, 'Export PDF')).suggestedFilename()).toBe('al-rai-villa.pdf')
  expect((await exported(page, 'Export DXF')).suggestedFilename()).toBe('al-rai-villa.dxf')
})
