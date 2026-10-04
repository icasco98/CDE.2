import { expect, test, type Page } from '@playwright/test'
import {
  centreOf,
  connect,
  drag,
  connectionBetween,
  linkedPairs,
  openVilla,
  reachOf,
} from './bubbles'
import { tab } from './tabs'

/*
 * Connections by hand on the bubble diagram: a drag adds one, a click on it shows where it came
 * from and changes its kind or takes it out, and a default taken out stays out.
 */

/** Selects a connection by pressing its grip, which lies under the bubbles and is aimed at directly. */
async function selectConnection(page: Page, id: string) {
  await page.locator(`[data-connection="${id}"] .link-grip`).dispatchEvent('pointerdown')
  await page.locator('svg.bubbles-sheet').dispatchEvent('pointerup')
  await expect(page.getByRole('region', { name: 'Connection' })).toBeVisible()
}

test('a drag from one zone to another connects them, added by hand', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Formal Living to Kitchen')
  await connect(page, 'Kitchen', 'Formal Living')
  await expect.poll(() => linkedPairs(page)).toContain('Formal Living to Kitchen')
  const connection = await connectionBetween(page, 'Kitchen', 'Formal Living')
  expect(connection?.kind).toBe('door')
  await selectConnection(page, connection!.id)
  const panel = page.getByRole('region', { name: 'Connection' })
  await expect(panel).toContainText('Kitchen ↔ Formal Living')
  await expect(panel).toContainText('Added by hand.')
})

test('a default connection says its rulebook row, turns open, and one undo turns it back', async ({
  page,
}) => {
  await openVilla(page)
  await expect
    .poll(async () => (await connectionBetween(page, 'Kitchen', 'Dining Room'))?.id)
    .toBeTruthy()
  const connection = await connectionBetween(page, 'Kitchen', 'Dining Room')
  await selectConnection(page, connection!.id)
  const panel = page.getByRole('region', { name: 'Connection' })
  await expect(panel).toContainText('Rulebook D12: U3: the kitchen serves the dining room')
  await panel.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.locator(`[data-connection="${connection!.id}"]`)).toHaveAttribute(
    'data-kind',
    'open',
  )
  await expect(panel.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The row is the pair's, whatever kind the connection has since been given.
  await expect(panel).toContainText('Rulebook D12')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator(`[data-connection="${connection!.id}"]`)).toHaveAttribute(
    'data-kind',
    'door',
  )
})

test('a default taken out is not made again when a zone is added', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  const connection = await connectionBetween(page, 'Kitchen', 'Dining Room')
  await selectConnection(page, connection!.id)
  await page.getByRole('button', { name: 'Delete connection' }).click()
  await expect(page.locator(`[data-connection="${connection!.id}"]`)).toHaveCount(0)
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')

  await tab(page, 'Requirements').click()
  await page.getByRole('button', { name: 'Add zone', exact: true }).click()
  await tab(page, 'Bubbles').click()
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')
})

test('a drag to Outside gives a zone its own door to the street', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Kitchen to Outside')
  const outside = await page.locator('.bubbles-sheet .outside[data-storey="0"] rect').boundingBox()
  await drag(page, await reachOf(page, 'Kitchen'), {
    x: outside!.x + outside!.width / 2,
    y: outside!.y + outside!.height / 2,
  })
  await expect.poll(() => linkedPairs(page)).toContain('Kitchen to Outside')
})

test('a drag to a zone on another storey is refused with the reason', async ({ page }) => {
  await openVilla(page)
  await expect.poll(async () => (await linkedPairs(page)).length).toBeGreaterThan(10)
  const pairs = await linkedPairs(page)
  await drag(page, await reachOf(page, 'Kitchen', 0), await centreOf(page, 'Bedroom 1', 1))
  await expect(page.locator('.messages')).toContainText('a stair is the way from one storey')
  expect(await linkedPairs(page)).toEqual(pairs)
})

test('a deleted suggestion stays deleted after a reload, and Restore brings it back', async ({
  page,
}) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  const connection = await connectionBetween(page, 'Kitchen', 'Dining Room')
  await selectConnection(page, connection!.id)
  await page.getByRole('button', { name: 'Delete connection' }).click()
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')
  await page.waitForTimeout(700)
  await page.reload()
  await tab(page, 'Bubbles').click()
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')
  await page.getByRole('button', { name: 'Restore suggested connections' }).click()
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  await expect(page.getByRole('button', { name: 'Restore suggested connections' })).toBeDisabled()
})

test('a right-click on a zone restores its deleted suggestions and no other zone’s', async ({
  page,
}) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  for (const [a, b] of [
    ['Kitchen', 'Dining Room'],
    ['Formal Living', 'Entry'],
  ] as const) {
    const connection = await connectionBetween(page, a, b)
    await selectConnection(page, connection!.id)
    await page.getByRole('button', { name: 'Delete connection' }).click()
  }
  await expect.poll(() => linkedPairs(page)).not.toContain('Entry to Formal Living')
  await page
    .locator('.bubbles-sheet [data-zone][data-name="Kitchen"] circle.bubble-shape')
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Restore suggested connections for this zone' }).click()
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  expect(await linkedPairs(page)).not.toContain('Entry to Formal Living')
})
