import { expect, test, type Locator, type Page } from '@playwright/test'

const page_ = '/playground/bubbles.html'

async function open(page: Page) {
  await page.goto(page_)
  await expect(page.locator('[data-bubble]')).toHaveCount(12)
}

async function settle(page: Page) {
  await page.getByRole('button', { name: 'Settle' }).click()
  await expect(page.locator('.bubbles-status')).toHaveText('Settled', { timeout: 30000 })
}

function positions(page: Page) {
  return page.$$eval('[data-bubble]', (circles) =>
    circles.map(
      (circle) =>
        `${circle.getAttribute('data-bubble')} ${circle.getAttribute('cx')} ${circle.getAttribute('cy')}`,
    ),
  )
}

function roomNamed(page: Page, name: string) {
  return page.locator('[data-room]').filter({ has: page.getByText(name, { exact: true }) })
}

async function centre(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to aim at')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

test('draws every room as a circle inside its storey band', async ({ page }) => {
  await open(page)
  await expect(page.locator('.band-label')).toHaveText(['Ground', 'Level 1'])
  await expect(page.getByText('Diwaniya', { exact: true })).toBeVisible()
  await expect(page.getByText('55 m²')).toBeVisible()
})

test('settles to the same picture from two fresh loads', async ({ page }) => {
  await open(page)
  await settle(page)
  const first = await positions(page)
  await open(page)
  await settle(page)
  expect(await positions(page)).toEqual(first)
  expect(first.length).toBe(12)
})

test('a dragged bubble follows the hand and is held in place', async ({ page }) => {
  await open(page)
  await settle(page)
  const bubble = page.locator('[data-bubble]').first()
  const id = await bubble.getAttribute('data-bubble')
  const before = await centre(bubble)
  await drag(page, before, { x: before.x + 120, y: before.y - 60 })
  const after = await centre(bubble)
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(80)
  await expect(page.locator(`[data-room="${id}"] .pin-mark`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Let go' })).toBeEnabled()
})

test('dragging from one bubble to another connects them', async ({ page }) => {
  await open(page)
  await settle(page)
  const links = await page.locator('[data-edge]').count()
  const from = await centre(roomNamed(page, 'Formal Living').locator('.reach'))
  const to = await centre(roomNamed(page, 'Diwaniya').locator('[data-bubble]'))
  await drag(page, from, to)
  await expect(page.locator('[data-edge]')).toHaveCount(links + 1)
})

test('a selected link is removed by pressing Delete', async ({ page }) => {
  await open(page)
  await settle(page)
  const links = await page.locator('[data-edge]').count()
  const grips = await page.locator('.link-grip').all()
  let clicked = false
  for (const grip of grips) {
    const at = await centre(grip)
    const onTop = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x as number, y as number)?.classList.contains('link-grip'),
      [at.x, at.y],
    )
    if (!onTop) continue
    await page.mouse.click(at.x, at.y)
    clicked = true
    break
  }
  expect(clicked).toBe(true)
  await expect(page.locator('.link-selected')).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-edge]')).toHaveCount(links - 1)
})
