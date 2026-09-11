import { expect, test, type Page } from '@playwright/test'

type At = { x: number; y: number }

async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
}

/** Where a point in sheet metres lands on the screen. */
async function onSheet(page: Page, x: number, y: number): Promise<At> {
  return page.evaluate(
    ([mx, my]) => {
      const sheet = document.querySelector('svg.zoning-sheet')
      const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
      if (!screen) throw new Error('there is no sheet')
      const point = new DOMPoint(mx, my).matrixTransform(screen)
      return { x: point.x, y: point.y }
    },
    [x, y],
  )
}

async function centreOf(page: Page, selector: string): Promise<At> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing to aim at: ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: At, to: At, modifier?: 'Alt'): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.up()
  if (modifier) await page.keyboard.up(modifier)
}

/** A room by the name on its label, as the store gave it. */
function roomNamed(page: Page, name: string) {
  return page.locator('[data-room]').filter({ has: page.getByText(name, { exact: true }) })
}

async function place(page: Page, name: string, x: number, y: number, modifier?: 'Alt') {
  const tray = page
    .locator('[data-tray]')
    .filter({ hasText: new RegExp(`^${name}`) })
    .first()
  const from = await tray.boundingBox()
  if (!from) throw new Error(`${name} is not in the tray`)
  await drag(
    page,
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    await onSheet(page, x, y),
    modifier,
  )
}

async function clickSheet(page: Page, x: number, y: number): Promise<void> {
  const at = await onSheet(page, x, y)
  await page.mouse.click(at.x, at.y)
}

async function pointsOf(page: Page, name: string): Promise<string | null> {
  return roomNamed(page, name).locator('polygon').getAttribute('points')
}

test('a room dragged out of the tray is placed at its target size', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '0.0')
  await expect(page.getByText('20.6 of 20 m²')).toBeVisible()
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(0)
})

test('a placed room is dragged about the sheet, and undo puts it back', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  const before = await pointsOf(page, 'Kitchen')
  await drag(page, await onSheet(page, 5, 5.125), await onSheet(page, 12, 12))
  const after = await pointsOf(page, 'Kitchen')
  expect(after).not.toBe(before)
  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await pointsOf(page, 'Kitchen')).toBe(before)
})

test('a room is turned by its handle and by the quarter-turn button', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 8, 8.125)
  await clickSheet(page, 8, 8.125)
  await expect(page.locator('[data-rotate-handle]')).toBeVisible()
  await drag(page, await centreOf(page, '[data-rotate-handle]'), await onSheet(page, 14, 8.125))
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '90.0')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
  await page.getByRole('button', { name: 'Rotate 90°' }).click()
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '180.0')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
})

test('a room is resized by a corner handle and the label follows', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 8, 8.125)
  await clickSheet(page, 8, 8.125)
  await drag(
    page,
    await centreOf(page, '[data-resize-handle="1,1"]'),
    await onSheet(page, 12.25, 12.25),
  )
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '42.00')
  await expect(page.getByText('42 of 20 m²')).toBeVisible()
})

test('a drop with Alt held carves the room under it', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Dining Room', 8, 8)
  await expect(roomNamed(page, 'Dining Room')).toHaveAttribute('data-area', '24.00')
  await place(page, 'Guest WC', 8, 5.75, 'Alt')
  await expect(page.locator('[data-room]')).toHaveCount(2)
  await expect(roomNamed(page, 'Dining Room')).toHaveAttribute('data-area', '23.00')
})

test('a drop on top of another room is refused and said out loud', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Dining Room', 8, 8)
  await place(page, 'Guest WC', 8, 8)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await expect(page.locator('.messages')).toContainText('Dining Room')
  await expect(page.locator('[data-tray]').filter({ hasText: /^Guest WC/ })).toHaveCount(1)
  await place(page, 'Guest WC', 8, 8)
  await place(page, 'Guest WC', 8, 8)
  await expect(page.locator('.messages li')).toHaveCount(1)
})

test('a pinned room refuses to be moved', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await clickSheet(page, 6, 6.125)
  await page.getByRole('button', { name: 'Pin' }).click()
  const before = await pointsOf(page, 'Kitchen')
  await drag(page, await onSheet(page, 6, 6.125), await onSheet(page, 14, 14))
  await expect(page.locator('.messages')).toContainText('Kitchen is pinned')
  expect(await pointsOf(page, 'Kitchen')).toBe(before)
})

test('a proposed door is accepted with a click and disconnected with Delete', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await expect(page.locator('[data-proposal]')).toHaveCount(1)
  await expect(page.locator('[data-edge]')).toHaveCount(0)
  await page.locator('[data-proposal]').click()
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await expect(page.locator('[data-proposal]')).toHaveCount(0)
  await clickSheet(page, 17, 1.5)
  await clickSheet(page, 7.75, 5.125)
  await expect(page.locator('.door-selected')).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-edge]')).toHaveCount(0)
  await expect(page.locator('[data-proposal]')).toHaveCount(1)
})

test('an edge whose rooms share no wall is drawn as a tension', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await page.locator('[data-proposal]').click()
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await drag(page, await onSheet(page, 10.75, 5), await onSheet(page, 15, 18))
  await expect(page.locator('[data-tension]')).toHaveCount(1)
  await expect(page.locator('[data-edge]')).toHaveCount(0)
})

test('a room is unplaced back to the tray', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await clickSheet(page, 6, 6.125)
  await page.getByRole('button', { name: 'Unplace' }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(1)
})

test('each storey is drawn on its own, with the one below as a ghost', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  const kitchen = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Kitchen"]')) })
  await kitchen.getByLabel('Storey').selectOption({ label: 'First' })
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(0)
  await place(page, 'Dining Room', 8, 8)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('.ghost')).toHaveCount(1)
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(1)
})

test('a room picked in the bubbles is the room picked in the zoning', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.getByRole('button', { name: /Hold in place|Let go/ })).toBeEnabled()
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
})
