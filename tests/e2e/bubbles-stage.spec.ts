import { expect, test, type Page } from '@playwright/test'

async function openBubbles(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
}

/** A mark can sit under a later proposal's thread, so the one clicked is one that is really on top. */
async function clickAProposal(page: Page) {
  for (const mark of await page.locator('[data-proposal] .proposal-mark').all()) {
    const box = await mark.boundingBox()
    if (!box) continue
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const onTop = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x as number, y as number)?.classList.contains('proposal-mark'),
      [at.x, at.y],
    )
    if (!onTop) continue
    await page.mouse.click(at.x, at.y)
    return true
  }
  return false
}

test('the program from the requirements screen appears as bubbles and settles', async ({
  page,
}) => {
  await openBubbles(page)
  const bubbles = page.locator('svg g[data-room]')
  expect(await bubbles.count()).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Settle' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible({ timeout: 15000 })
})

test('a proposed connection becomes an edge when it is clicked', async ({ page }) => {
  await openBubbles(page)
  const proposals = page.locator('[data-proposal]')
  const drawn = await proposals.count()
  expect(drawn).toBeGreaterThan(0)
  const edges = await page.locator('[data-edge]').count()

  expect(await clickAProposal(page)).toBe(true)
  await expect(page.locator('[data-edge]')).toHaveCount(edges + 1)
  await expect(proposals).toHaveCount(drawn - 1)
})

test('accepting every proposal is one step, and one undo brings them all back', async ({
  page,
}) => {
  await openBubbles(page)
  const accept = page.getByRole('button', { name: 'Accept all proposals' })
  const outside = page.locator('.proposals li')
  await expect(accept).toBeVisible()
  const drawn = await page.locator('[data-proposal]').count()
  const spoken = await outside.count()
  expect(spoken).toBeGreaterThan(0)

  await accept.click()
  await expect(page.locator('[data-proposal]')).toHaveCount(0)
  await expect(outside).toHaveCount(0)
  await expect(accept).toBeHidden()

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-proposal]')).toHaveCount(drawn)
  await expect(outside).toHaveCount(spoken)
})

test('a proposed connection says which rule asked for it', async ({ page }) => {
  await openBubbles(page)
  const reason = page.locator('[data-proposal] title').first()
  await expect(reason).not.toBeEmpty()
  await expect(page.locator('.proposals li').first()).toContainText(':')
})
