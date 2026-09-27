import { expect, test } from '@playwright/test'
import { exported, openSheet, textOf } from './exporting'

test('the two buttons hand over a PDF and a DXF of the sheet as it stands', async ({ page }) => {
  await openSheet(page)
  // One zoning tool, not two: the plan tabs share the sheet the export is taken from.
  await expect(page.locator('nav.tabs button')).toHaveText([
    'Requirements',
    'Bubbles',
    'Zoning and 3D',
    'Openings',
  ])
  const rooms = await page.locator('svg.sheet g.room[data-room]:not(.under)').count()
  expect(rooms).toBeGreaterThan(4)

  const pdf = await exported(page, 'Export PDF')
  expect(pdf.suggestedFilename()).toBe('test-plan.pdf')
  expect((await textOf(pdf)).startsWith('%PDF-')).toBe(true)

  const dxf = await exported(page, 'Export DXF')
  expect(dxf.suggestedFilename()).toBe('test-plan.dxf')
  const drawing = await textOf(dxf)
  expect(drawing.startsWith('0\nSECTION')).toBe(true)
  expect(drawing.endsWith('0\nEOF\n')).toBe(true)
  // The ground storey has a rooms layer of its own, with at least one closed outline on it for
  // every room the sheet is showing.
  expect(drawing).toContain('0\nLAYER\n2\nS0-ROOMS\n')
  expect(drawing.split('0\nPOLYLINE\n8\nS0-ROOMS\n').length - 1).toBeGreaterThanOrEqual(rooms)
})

test('a project named by hand names the files it exports', async ({ page }) => {
  await openSheet(page)
  await page.getByLabel('Project name').fill('Al Rai villa')
  expect((await exported(page, 'Export PDF')).suggestedFilename()).toBe('al-rai-villa.pdf')
  expect((await exported(page, 'Export DXF')).suggestedFilename()).toBe('al-rai-villa.dxf')
})

test('inside an artifact that grants downloads, the PDF is handed over and the DXF goes in a zip', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const handed: { filename: string; kind: string }[] = []
    Object.assign(window, {
      handed,
      claude: {
        use: async (name: string) =>
          name === 'downloads'
            ? {
                save: async (file: { filename: string; data: Blob }) => {
                  handed.push({ filename: file.filename, kind: file.data.type })
                  return { status: 'saved' }
                },
              }
            : null,
      },
    })
  })
  await openSheet(page)
  await page.getByRole('button', { name: 'Export PDF' }).click()
  await page.getByRole('button', { name: 'Export DXF' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { handed: unknown[] }).handed))
    .toEqual([
      { filename: 'test-plan.pdf', kind: 'application/pdf' },
      { filename: 'test-plan.zip', kind: 'application/zip' },
    ])
})
