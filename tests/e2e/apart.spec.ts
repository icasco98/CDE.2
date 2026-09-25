import { expect, test, type Page } from '@playwright/test'
import { centreOf, connect, drag, openVilla, reachOf, saved, selectRoom } from './bubbles'

/*
 * Keep apart, the opposite of a connection: set in the diagram like one, drawn unlike any edge,
 * kept in the project and its undo, and a warning that never refuses.
 */

const makes = (page: Page, what: 'Connection' | 'Keep apart') =>
  page.getByRole('group', { name: 'A drag makes' }).getByRole('button', { name: what }).click()

async function pairs(page: Page) {
  return (await saved(page)).apart ?? []
}

test('a drag in keep-apart mode keeps two rooms apart; Allow together and undo', async ({
  page,
}) => {
  await openVilla(page)
  await makes(page, 'Keep apart')
  await connect(page, 'Diwaniya', 'Family Living')
  await expect(page.locator('[data-apart]')).toHaveCount(1)
  await expect.poll(async () => (await pairs(page)).length).toBe(1)

  await page.locator('[data-apart] .apart-cross').dispatchEvent('pointerdown')
  await page.locator('svg.bubbles-sheet').dispatchEvent('pointerup')
  const panel = page.getByRole('region', { name: 'Keep apart' })
  await expect(panel).toContainText('Keep apart: Diwaniya ↔ Family Living')
  await panel.getByRole('button', { name: 'Allow together' }).click()
  await expect(page.locator('[data-apart]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-apart]')).toHaveCount(1)
})

test('a pair may be kept apart across storeys', async ({ page }) => {
  await openVilla(page)
  await makes(page, 'Keep apart')
  await page.mouse.move(
    (await centreOf(page, 'Garage bay 1')).x,
    (await centreOf(page, 'Garage bay 1')).y,
  )
  await drag(page, await reachOf(page, 'Garage bay 1', 0), await centreOf(page, 'Bedroom 1', 1))
  await expect(page.locator('[data-apart]')).toHaveCount(1)
})

test('connecting a pair kept apart is allowed and warned about', async ({ page }) => {
  await openVilla(page)
  await makes(page, 'Keep apart')
  await connect(page, 'Kitchen', 'Formal Living')
  await expect(page.locator('[data-apart]')).toHaveCount(1)
  await makes(page, 'Connection')
  await connect(page, 'Kitchen', 'Formal Living')
  await expect(page.locator('.messages')).toContainText(
    'Kitchen and Formal Living are to be kept apart; connected all the same.',
  )
  await expect.poll(async () => (await saved(page)).edges.length).toBeGreaterThan(0)
  await expect(page.locator('[data-apart]')).toHaveCount(1)
})

test('deleting a room takes its keep-apart pairs with it', async ({ page }) => {
  await openVilla(page)
  await makes(page, 'Keep apart')
  await connect(page, 'Kitchen', 'Formal Living')
  await expect(page.locator('[data-apart]')).toHaveCount(1)
  await selectRoom(page, 'Kitchen')
  await page.getByRole('button', { name: 'Delete room' }).click()
  await expect(page.locator('[data-apart]')).toHaveCount(0)
  await expect.poll(async () => (await pairs(page)).length).toBe(0)
})
