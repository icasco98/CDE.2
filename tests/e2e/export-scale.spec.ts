import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exported, openZoning, place } from './exporting'
import { decodePng, verticalLines } from './png'

/**
 * The sheet measured as it prints. Chromium's viewer at 100% draws a point as 96/72 of a pixel, so
 * the starting 20 m plot at 1:100 is 200 mm, or 755.91 px, across. The full browser is asked for by
 * name, and so in its own file: the headless shell downloads a PDF rather than drawing it.
 */
test.use({ channel: 'chromium', viewport: { width: 1800, height: 1200 } })

test('draws a 20 m plot edge 200 mm wide, to better than half a percent', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5)
  const file = join(mkdtempSync(join(tmpdir(), 'export-')), 'sheet.pdf')
  await (await exported(page, 'Export PDF')).saveAs(file)

  await page.goto(`file://${file}#zoom=100&toolbar=0`)
  let lines: readonly number[] = []
  await expect(async () => {
    lines = verticalLines(decodePng(await page.screenshot()), 0.5)
    expect(lines.length).toBeGreaterThanOrEqual(4)
  }).toPass({ timeout: 30000 })

  // The frame and the plot are both centred on the sheet, so every long line has a partner across
  // the middle; the closest such pair is the plot, the rooms inside it being too short to count.
  const middle = ((lines[0] ?? 0) + (lines[lines.length - 1] ?? 0)) / 2
  const spans = lines
    .filter((x) => x < middle)
    .map((x) => {
      const wanted = 2 * middle - x
      const partner = lines.reduce((best, each) =>
        Math.abs(each - wanted) < Math.abs(best - wanted) ? each : best,
      )
      return partner - x
    })
    .sort((a, b) => a - b)
  const measured = spans[0] ?? 0
  const expected = (200 / 25.4) * 96
  const error = Math.abs(measured - expected) / expected
  test.info().annotations.push({
    type: 'scale',
    description: `plot edge ${measured} px against ${expected.toFixed(2)} px expected, ${(error * 100).toFixed(3)}% out`,
  })
  expect(error).toBeLessThan(0.005)
})
