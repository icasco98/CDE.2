import { expect, test, type Page } from '@playwright/test'
import { seedPlan } from './plan'
import { tab } from './tabs'

/*
 * The plan in two tabs: Zoning and 3D edits the zones and shows their connections on demand, and
 * Openings edits the doors of the same sheet, which a change of tab neither loses nor forgets.
 */

type At = { x: number; y: number }

test.use({ viewport: { width: 1500, height: 1100 } })

async function onSheet(page: Page, x: number, y: number): Promise<At> {
  return page.evaluate(
    ([mx, my]) => {
      const sheet = document.querySelector('svg.sheet')
      const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
      if (!screen) throw new Error('there is no sheet')
      const at = new DOMPoint(mx, my).matrixTransform(screen)
      return { x: at.x, y: at.y }
    },
    [x, y],
  )
}

async function drag(page: Page, from: At, to: At): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  await page.mouse.up()
}

const doors = (page: Page) => page.locator('svg.sheet .door:not(.preview)')
const lines = (page: Page) => page.locator('svg.sheet .check-line')

test.beforeEach(async ({ page }) => {
  await seedPlan(page)
  await page.goto('/')
})

test('the four tabs read Requirements, Bubbles, Zoning and 3D, Openings', async ({ page }) => {
  await expect(page.locator('nav.tabs button')).toHaveText([
    'Requirements',
    'Bubbles',
    'Zoning and 3D',
    'Openings',
  ])
  await tab(page, 'Zoning and 3D').click()
  await expect(page.locator('.sheet-stage')).not.toHaveClass(/openings/)
  await tab(page, 'Openings').click()
  await expect(page.locator('.sheet-stage.openings')).toBeVisible()
})

test('Show connections toggles the lines from a zone to the zones it should connect to', async ({
  page,
}) => {
  await tab(page, 'Zoning and 3D').click()
  await page.locator('svg.sheet').waitFor()
  const show = page.getByRole('button', { name: 'Show connections', exact: true })
  // the Store moved off the Kitchen it connects to, and left in hand
  await drag(page, await onSheet(page, 3, 18.8), await onSheet(page, 3, 13.5))
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(lines(page)).toHaveCount(0)
  await show.click()
  await expect(show).toHaveAttribute('aria-pressed', 'true')
  await expect(lines(page).first()).toBeVisible()
  await show.click()
  await expect(lines(page)).toHaveCount(0)
})

test('a door is placed from the Openings tab, and kept across a change of tab', async ({
  page,
}) => {
  await tab(page, 'Openings').click()
  await page.locator('svg.sheet.doormode').waitFor()
  const before = await doors(page).count()
  await page.locator('.grp.place').getByRole('button', { name: 'Door', exact: true }).click()
  const edge = await onSheet(page, 4, 16.37)
  await page.mouse.click(edge.x, edge.y)
  await expect(doors(page)).toHaveCount(before + 1)

  await tab(page, 'Zoning and 3D').click()
  await expect(page.locator('svg.sheet.doormode')).toHaveCount(0)
  await tab(page, 'Openings').click()
  await expect(doors(page)).toHaveCount(before + 1)
  // the undo made in one tab is still there in the other
  await page.keyboard.press('Control+z')
  await expect(doors(page)).toHaveCount(before)
})
