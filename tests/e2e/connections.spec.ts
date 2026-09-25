import { expect, test, type Page } from '@playwright/test'
import { centreOf, connect, drag, edgeBetween, linkedPairs, openVilla, reachOf } from './bubbles'
import { tab } from './tabs'

/*
 * Connections by hand on the bubble diagram: a drag adds one, a click on it shows where it came
 * from and changes its kind or takes it out, and a default taken out stays out.
 */

/** Selects an edge by pressing its grip, which lies under the bubbles and is aimed at directly. */
async function selectEdge(page: Page, id: string) {
  await page.locator(`[data-edge="${id}"] .link-grip`).dispatchEvent('pointerdown')
  await page.locator('svg.bubbles-sheet').dispatchEvent('pointerup')
  await expect(page.getByRole('region', { name: 'Connection' })).toBeVisible()
}

test('a drag from one room to another connects them, added by hand', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Formal Living to Kitchen')
  await connect(page, 'Kitchen', 'Formal Living')
  await expect.poll(() => linkedPairs(page)).toContain('Formal Living to Kitchen')
  const edge = await edgeBetween(page, 'Kitchen', 'Formal Living')
  expect(edge?.kind).toBe('door')
  await selectEdge(page, edge!.id)
  const panel = page.getByRole('region', { name: 'Connection' })
  await expect(panel).toContainText('Kitchen ↔ Formal Living')
  await expect(panel).toContainText('Added by hand.')
})

test('a default connection says its rulebook row, turns open, and one undo turns it back', async ({
  page,
}) => {
  await openVilla(page)
  await expect
    .poll(async () => (await edgeBetween(page, 'Kitchen', 'Dining Room'))?.id)
    .toBeTruthy()
  const edge = await edgeBetween(page, 'Kitchen', 'Dining Room')
  await selectEdge(page, edge!.id)
  const panel = page.getByRole('region', { name: 'Connection' })
  await expect(panel).toContainText('Rulebook D12: U3: the kitchen serves the dining room')
  await panel.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.locator(`[data-edge="${edge!.id}"]`)).toHaveAttribute('data-kind', 'open')
  await expect(panel.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // The row is the pair's, whatever kind the edge has since been given.
  await expect(panel).toContainText('Rulebook D12')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator(`[data-edge="${edge!.id}"]`)).toHaveAttribute('data-kind', 'door')
})

test('a default taken out is not made again when a room is added', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  const edge = await edgeBetween(page, 'Kitchen', 'Dining Room')
  await selectEdge(page, edge!.id)
  await page.getByRole('button', { name: 'Delete connection' }).click()
  await expect(page.locator(`[data-edge="${edge!.id}"]`)).toHaveCount(0)
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')

  await tab(page, 'Requirements').click()
  await page.getByRole('button', { name: 'Add room', exact: true }).click()
  await tab(page, 'Bubbles').click()
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')
})

test('a drag to Outside gives a room its own door to the street', async ({ page }) => {
  await openVilla(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Kitchen to Outside')
  const outside = await page.locator('.bubbles-sheet .outside[data-storey="0"] rect').boundingBox()
  await drag(page, await reachOf(page, 'Kitchen'), {
    x: outside!.x + outside!.width / 2,
    y: outside!.y + outside!.height / 2,
  })
  await expect.poll(() => linkedPairs(page)).toContain('Kitchen to Outside')
})

test('a drag to a room on another storey is refused with the reason', async ({ page }) => {
  await openVilla(page)
  await expect.poll(async () => (await linkedPairs(page)).length).toBeGreaterThan(10)
  const pairs = await linkedPairs(page)
  await drag(page, await reachOf(page, 'Kitchen', 0), await centreOf(page, 'Bedroom 1', 1))
  await expect(page.locator('.messages')).toContainText('a stair is the way from one storey')
  expect(await linkedPairs(page)).toEqual(pairs)
})
