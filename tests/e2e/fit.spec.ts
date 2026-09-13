import { expect, test, type Page } from '@playwright/test'
import { clickInside, drag, onSheet, openSheet, place, tab } from './plan'

/*
 * Fit by reduction, and the manual size check. Both are answers the sheet gives a person, never
 * changes it makes on its own, so every test here reads what the sheet says and then does what it
 * says to do.
 */

/** The zones open as one cut, so a click on an outlined room never lands mid-animation. */
test.use({ contextOptions: { reducedMotion: 'reduce' } })

/** What every room of the program asks for, by name, read off the Requirements table. */
async function targets(page: Page): Promise<Record<string, number>> {
  await tab(page, 'Requirements').click()
  return page.evaluate(() => {
    const asked: Record<string, number> = {}
    for (const row of document.querySelectorAll('table.program tbody tr')) {
      const name = row.querySelector('input[aria-label="Room name"]')
      const target = row.querySelector('input[aria-label="Target area"]')
      if (name instanceof HTMLInputElement && target instanceof HTMLInputElement) {
        asked[name.value] = Number(target.value)
      }
    }
    return asked
  })
}

/** The two-storey default villa on a plot narrowed from 20 m to `width`, its bubbles settled. */
async function openNarrowed(page: Page, width: number): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByLabel('Width (m)').fill(String(width))

  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  for (let again = 0; again < 2; again++) {
    await page.getByRole('button', { name: 'Settle now' }).click()
    await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
  }
  await openSheet(page)
}

/** The default program with one room on the sheet and nothing else on the storey. */
async function openOneRoom(page: Page, name: string, x: number, y: number): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await openSheet(page)
  await place(page, name, x, y)
  await expect(page.locator('svg.zoning-sheet [data-room]')).toHaveCount(1)
  await clickInside(page, `[data-room][data-name="${name}"] polygon`)
}

/** The handle in the middle of the room's east wall, which pulls its width out or back. */
async function pullEastWallTo(page: Page, metre: number, at: number): Promise<void> {
  const handle = await page.locator('svg.zoning-sheet .resize-handle').nth(3).boundingBox()
  if (!handle) throw new Error('the room has no handles')
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    await onSheet(page, metre, at),
  )
}

test('the rooms the sheet offers to reduce take the spill to nothing, one click each', async ({
  page,
}) => {
  await openNarrowed(page, 17)
  const before = await targets(page)
  await openSheet(page)
  await page.getByRole('button', { name: 'Morph' }).click()

  await expect(page.locator('[data-fit]')).toContainText('outside the buildable line')
  await expect(page.locator('[data-reduce]')).toContainText('and the floor fits: Diwaniya 52.5 to')
  expect(await page.locator('[data-reduce-room]').count()).toBeGreaterThan(0)

  // Each click sets one target and the storey is morphed again, so the offer is read afresh.
  let clicks = 0
  for (; clicks < 8; clicks++) {
    if ((await page.locator('[data-reduce-room]').count()) === 0) break
    const id = await page.locator('[data-reduce-room]').first().getAttribute('data-reduce-room')
    await clickInside(page, '[data-reduce-room]')
    await expect(page.locator(`[data-reduce-room="${id}"]`)).toHaveCount(0)
  }
  expect(clicks).toBeGreaterThan(1)
  await expect(page.locator('[data-reduce]')).toHaveCount(0)
  await expect(page.locator('[data-spill]')).toHaveCount(0)
  await expect(page.locator('[data-fit]')).not.toContainText('outside the buildable line')

  // One room reduced per click, and nothing else on the storey touched.
  const reduced = await targets(page)
  const changed = Object.keys(before).filter((name) => reduced[name] !== before[name])
  expect(changed.length).toBe(clicks)
  expect(reduced['Diwaniya']).toBe(45)

  // One undo per press, each putting back one target and leaving the rest where they are.
  for (let back = 1; back <= clicks; back++) {
    await page.getByRole('button', { name: 'Undo' }).click()
    const now = await targets(page)
    expect(Object.keys(now).filter((name) => now[name] !== before[name])).toEqual(
      changed.slice(0, clicks - back),
    )
  }
})

test('a spilling proposal left standing changes no target on its own', async ({ page }) => {
  await openNarrowed(page, 17)
  const before = await targets(page)
  await openSheet(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-reduce]')).toContainText('Reduce')

  await page.waitForTimeout(2000)
  await expect(page.locator('[data-reduce]')).toContainText('Reduce')
  expect(await targets(page)).toEqual(before)
})

test('a kitchen resized past the top of its range is outlined and named', async ({ page }) => {
  await openOneRoom(page, 'Kitchen', 5, 5.125)
  await expect(page.locator('[data-size-said]')).toHaveCount(0)

  // The kitchen opens 5.5 by 3.75; its east wall pulled out to 8 m wide makes it 30 m².
  await pullEastWallTo(page, 10.25, 5.125)
  await expect(page.locator('[data-size-said]')).toHaveText(
    'Kitchen is 30 m², the range ends at 28.',
  )
  await expect(page.locator('[data-room][data-name="Kitchen"]')).toHaveClass(/room-past-range/)

  await pullEastWallTo(page, 7.75, 5.125)
  await expect(page.locator('[data-size-said]')).toHaveCount(0)
  await expect(page.locator('[data-room][data-name="Kitchen"]')).not.toHaveClass(/room-past-range/)
})

test('a storey resized past its buildable area says so', async ({ page }) => {
  await openOneRoom(page, 'Diwaniya', 5, 4)
  await expect(page.locator('[data-ratio-said]')).toHaveCount(0)

  // The 20 by 25 plot leaves 365.5 m² inside the setbacks. One room pulled out to the far corner
  // of the plot stands on more than 450 m², which is past the line and not past the plot.
  await pullEastWallTo(page, 19.75, 4)
  const handle = await page.locator('svg.zoning-sheet .resize-handle').nth(5).boundingBox()
  if (!handle) throw new Error('the room has no handles')
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    await onSheet(page, 10, 24.75),
  )
  await expect(page.locator('[data-ratio-said]')).toContainText('Ground is ')
  await expect(page.locator('[data-ratio-said]')).toContainText('on 365.5 m² buildable.')
})

test('a project opened from storage says nothing until a hand has moved something', async ({
  page,
}) => {
  await openOneRoom(page, 'Kitchen', 5, 5.125)
  await pullEastWallTo(page, 10.25, 5.125)
  await expect(page.locator('[data-size-said]')).toHaveCount(1)
  // Longer than the autosave's own half second, so what is on the screen is what is stored.
  await page.waitForTimeout(1200)

  await page.goto('/')
  await openSheet(page)
  await expect(page.locator('[data-room][data-name="Kitchen"]')).toHaveAttribute(
    'data-area',
    '30.00',
  )
  await expect(page.locator('[data-size-said]')).toHaveCount(0)
  await expect(page.locator('[data-room][data-name="Kitchen"]')).not.toHaveClass(/room-past-range/)

  // One gesture, and the sheet answers for what it now holds.
  const from = await onSheet(page, 5, 5.125)
  await drag(page, from, { x: from.x + 30, y: from.y })
  await expect(page.locator('[data-size-said]')).toHaveText(
    'Kitchen is 30 m², the range ends at 28.',
  )
})
