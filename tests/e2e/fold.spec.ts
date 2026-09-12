import { expect, test, type Page } from '@playwright/test'
import { openBoth, tab } from './plan'

/** How far the page runs past the window, and where the lowest drawing on it ends. */
async function belowTheFold(page: Page, sheets: readonly string[]) {
  return page.evaluate((selectors) => {
    const bottoms = selectors.map((selector) => {
      const sheet = document.querySelector(selector)
      if (!sheet) throw new Error(`${selector} is not drawn`)
      return sheet.getBoundingClientRect().bottom
    })
    return {
      over: document.documentElement.scrollHeight - window.innerHeight,
      past: Math.max(...bottoms) - window.innerHeight,
    }
  }, sheets)
}

/** The default program on two storeys, every room placed, which is the fullest the tab ever is. */
async function twoStoreys(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
}

test('nothing on the Plan tab is below the fold on a 1280 by 720 window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await twoStoreys(page)
  await openBoth(page)
  await page.getByRole('button', { name: 'Lay out from bubbles' }).click()
  await expect(page.locator('svg.zoning-sheet [data-room]').first()).toBeVisible()

  const fold = await belowTheFold(page, ['svg.zoning-sheet', 'svg.massing-sheet'])
  expect(fold.over).toBeLessThanOrEqual(1)
  expect(fold.past).toBeLessThanOrEqual(1)

  // The plot's street side is the last thing drawn down the sheet, and it is on the screen too.
  const street = await page.locator('svg.zoning-sheet .street').first().boundingBox()
  expect(street?.y ?? Infinity).toBeLessThan(720)
})

test('nothing on the Bubbles tab is below the fold on a 1280 by 720 window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await twoStoreys(page)
  await tab(page, 'Bubbles').click()
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })

  const fold = await belowTheFold(page, ['svg.bubbles-sheet'])
  expect(fold.over).toBeLessThanOrEqual(1)
  expect(fold.past).toBeLessThanOrEqual(1)
})

test('a taller window gives the drawings the height it adds', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await twoStoreys(page)
  await openBoth(page)
  const short = await page.locator('svg.zoning-sheet').boundingBox()
  await page.setViewportSize({ width: 1280, height: 900 })
  const tall = await page.locator('svg.zoning-sheet').boundingBox()
  expect((tall?.height ?? 0) - (short?.height ?? 0)).toBeCloseTo(180, 0)
  expect(await belowTheFold(page, ['svg.zoning-sheet'])).toEqual({ over: 0, past: 0 })
})

test('a window too short for both drawings keeps them 320 px deep and lets the page scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await twoStoreys(page)
  await openBoth(page)
  const sheet = await page.locator('svg.zoning-sheet').boundingBox()
  const massing = await page.locator('svg.massing-sheet').boundingBox()
  expect(sheet?.height).toBeGreaterThanOrEqual(320)
  expect(massing?.height).toBeGreaterThanOrEqual(320)
  const fold = await belowTheFold(page, ['svg.zoning-sheet'])
  // The page is longer than the window, which is how the whole of a 320 px sheet is reached.
  expect(fold.over).toBeGreaterThan(0)
})

test('at phone width the halves stand one above the other, each at least 320 px deep', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await twoStoreys(page)
  await openBoth(page)
  const sheet = await page.locator('.plan-sheet').boundingBox()
  const massing = await page.locator('.plan-massing').boundingBox()
  if (!sheet || !massing) throw new Error('a half is not drawn')
  expect(sheet.height).toBeGreaterThanOrEqual(320)
  expect(massing.height).toBeGreaterThanOrEqual(320)
  // Stacked, not side by side: the massing begins where the sheet ends.
  expect(massing.y).toBeGreaterThanOrEqual(sheet.y + sheet.height - 1)
  expect(await page.locator('.plan-handle').count()).toBe(1)
  await expect(page.locator('.plan-handle')).toBeHidden()
})
