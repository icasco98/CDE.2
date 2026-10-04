import { expect, test } from '@playwright/test'
import { seedPlan } from './plan'
import { tab } from './tabs'

/* A right-click menu opened near the window's edge is moved to stand whole inside it. */

test.use({ viewport: { width: 1280, height: 720 } })

test('a zone menu opened near the bottom of the window is whole and its last row answers', async ({
  page,
}) => {
  await seedPlan(page)
  await page.goto('/')
  await tab(page, 'Zoning and 3D').click()
  await page.locator('svg.sheet').waitFor()

  // The lowest point in the window where a right-click lands on a zone of the sheet.
  const lowest = await page.evaluate(() => {
    for (let y = window.innerHeight - 2; y > 0; y -= 4)
      for (let x = 20; x < window.innerWidth; x += 20) {
        const zone = document.elementFromPoint(x, y)?.closest('svg.sheet g.zone[data-zone]')
        if (zone) return { id: zone.getAttribute('data-zone')!, x, y }
      }
    throw new Error('no zone on the sheet')
  })
  expect(lowest.y).toBeGreaterThan(720 * 0.75)
  await page.mouse.click(lowest.x, lowest.y, { button: 'right' })

  const menu = page.locator('.sheet-stage .ctx')
  await expect(menu).toBeVisible()
  const box = (await menu.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(720)
  expect(box.x + box.width).toBeLessThanOrEqual(1280)

  // Whole on screen and not clipped by the panel it was opened in: its top corner answers the pointer.
  const top = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('.ctx'),
    [box.x + 8, box.y + 8],
  )
  expect(top).toBe(true)

  const last = menu.locator('button').last()
  await expect(last).toContainText('Send back to the tray')
  await last.click()
  await expect(menu).toHaveCount(0)
  await expect(page.locator(`svg.sheet g.zone[data-zone="${lowest.id}"]`)).toHaveCount(0)
})
