import { expect, test, type Page } from '@playwright/test'

/**
 * The settings window, saving, and the page fitted to the window: what the owner does when they
 * open the tool from a link, change a setting where they expect to find it, and come back to it.
 */

const KITCHEN = 'r8'

async function openSheet(page: Page): Promise<void> {
  await page.goto('/')
  await toSheetTab(page)
}

/** The tool opens on Requirements, here and after every reload: the sheet is one click in. */
async function toSheetTab(page: Page): Promise<void> {
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
}

const settingsButton = (page: Page) => page.getByRole('button', { name: '⚙ Settings' })

async function openTab(page: Page, title: string): Promise<void> {
  if ((await page.locator('[role=dialog]').count()) === 0) await settingsButton(page).click()
  await page.locator('.dialog .tabs').getByRole('tab', { name: title }).click()
}

/** How far a room stands from the sheet's left, in metres of plan. */
async function metresAcross(page: Page, id: string): Promise<number> {
  return page.evaluate((room) => {
    const sheet = document.querySelector('svg.sheet')
    const drawn = document.querySelector(`svg.sheet [data-room="${room}"]`)
    const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
    if (!screen || !drawn) throw new Error(`${room} is not drawn`)
    return (drawn.getBoundingClientRect().x - screen.e) / screen.a
  }, id)
}

async function nudged(page: Page, id: string): Promise<number> {
  await page.locator(`svg.sheet [data-room="${id}"]`).click()
  const before = await metresAcross(page, id)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => metresAcross(page, id), { timeout: 2000 }).not.toBeCloseTo(before, 3)
  return (await metresAcross(page, id)) - before
}

test('nothing on the Sheet tab is below the fold on a 1280 by 720 window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openSheet(page)
  const fold = await page.evaluate(() => {
    const of = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return {
      over: document.documentElement.scrollHeight - window.innerHeight,
      sheet: of('svg.sheet').bottom - window.innerHeight,
      say: of('.say').bottom - window.innerHeight,
      legend: of('.legend').bottom - window.innerHeight,
      sheetHeight: of('svg.sheet').height,
    }
  })
  expect(fold.over).toBeLessThanOrEqual(1)
  expect(fold.sheet).toBeLessThanOrEqual(1)
  expect(fold.say).toBeLessThanOrEqual(1)
  expect(fold.legend).toBeLessThanOrEqual(1)
  expect(fold.sheetHeight).toBeGreaterThan(200)
  await expect(page.locator('.say')).toContainText('m² placed')
  // The program column has its own scroll rather than lengthening the page.
  expect(await page.evaluate(() => document.querySelector('.tray')!.scrollHeight)).toBeGreaterThan(
    0,
  )
})

/** Snapping off, so what a nudge moves by is the grid's step and not a neighbour's wall. */
async function noSnapping(page: Page): Promise<void> {
  await openTab(page, 'Snapping')
  await page.locator('[data-setting="snapDist"] input[type=range]').fill('0')
  await page.locator('[data-setting="closeGap"] input[type=range]').fill('0')
  await page.getByRole('button', { name: 'Close' }).click()
}

test('the grid changed in the window is the step a nudge moves by', async ({ page }) => {
  await openSheet(page)
  await noSnapping(page)
  expect(await nudged(page, KITCHEN)).toBeCloseTo(0.25, 2)
  await openTab(page, 'Snapping')
  await page.locator('[data-setting="grid"]').getByRole('button', { name: '1 m' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  // A metre step, and the room comes to rest on the metre grid it was given.
  expect(await nudged(page, KITCHEN)).toBeGreaterThanOrEqual(1)
  expect((await metresAcross(page, KITCHEN)) % 1).toBeCloseTo(0, 2)
})

test('a category colour changed in the window is taken by the rooms and the program', async ({
  page,
}) => {
  await openSheet(page)
  await openTab(page, 'Colours')
  await page.locator('.swatches input').first().fill('#ff0000')
  await page.getByRole('button', { name: 'Close' }).click()
  const red = 'rgb(255, 0, 0)'
  await expect(page.locator('svg.sheet .room.reception path.body').first()).toHaveCSS('fill', red)
  await expect(page.locator('.tray .item.reception .swatch').first()).toHaveCSS(
    'background-color',
    red,
  )
  await openTab(page, 'Colours')
  await page.getByRole('button', { name: 'Back to the standard colours' }).click()
  await expect(page.locator('svg.sheet .room.reception path.body').first()).not.toHaveCSS(
    'fill',
    red,
  )
})

test('Clear the plan survives a reload', async ({ page }) => {
  await openSheet(page)
  await page.getByRole('button', { name: 'Clear the plan' }).click()
  await expect(page.locator('svg.sheet [data-room]')).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.reload()
  await toSheetTab(page)
  await expect(page.locator('svg.sheet [data-room]')).toHaveCount(0)
  await expect(page.locator('.tray .item.hollow').first()).toBeVisible()
})

test('Back to the sample restores the owner’s sheet', async ({ page }) => {
  await openSheet(page)
  const placed = await page.locator('svg.sheet [data-room]').count()
  await page.getByRole('button', { name: 'Clear the plan' }).click()
  await expect(page.locator('svg.sheet [data-room]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to the sample' }).click()
  await expect(page.locator('svg.sheet [data-room]')).toHaveCount(placed)
  await expect(page.locator('.say')).toContainText('m² placed')
})

test('a sheet edited, reloaded, comes back as it was', async ({ page }) => {
  await openSheet(page)
  await noSnapping(page)
  await nudged(page, KITCHEN)
  const moved = await metresAcross(page, KITCHEN)
  await openTab(page, 'Labels')
  await page.locator('[data-setting="showArea"]').getByRole('button', { name: 'Shown' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(600)
  await page.reload()
  await toSheetTab(page)
  expect(await metresAcross(page, KITCHEN)).toBeCloseTo(moved, 2)
  await settingsButton(page).click()
  await expect(
    page.locator('[data-setting="showArea"]').getByRole('button', { name: 'Shown' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('This is it saves the sheet and the settings as the spec, and Reset to the spec puts them back', async ({
  page,
}) => {
  await openSheet(page)
  await page.getByRole('button', { name: 'This is it' }).click()
  await expect(page.locator('.tools .state')).toHaveText('Saved as the spec.')
  await openTab(page, 'Snapping')
  await page.locator('[data-setting="grid"]').getByRole('button', { name: '1 m' }).click()
  await page.getByRole('button', { name: 'Reset to the spec' }).click()
  await expect(
    page.locator('[data-setting="grid"]').getByRole('button', { name: '0.25 m' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
