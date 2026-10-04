import { expect, test } from '@playwright/test'
import {
  centreOf,
  drag,
  connectionBetween,
  connectedPairs,
  openVilla,
  zoneNamed,
  saved,
  selectZone,
  storeyOf,
} from './bubbles'

/*
 * The bubble diagram as the connection graph: a column per storey, the tiers in rows, no plot and
 * no physics, and a nudge that is kept and means nothing else.
 */

test('the rebuild draws every storey side by side with the default connections drawn', async ({
  page,
}) => {
  await openVilla(page)
  await expect(page.getByRole('button', { name: 'Ground', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'First', exact: true })).toBeVisible()
  await expect(page.locator('.bubbles-sheet .plot, .buildable')).toHaveCount(0)
  expect(await page.locator('[data-connection]').count()).toBeGreaterThan(10)
  await expect(page.locator('[data-kind="main-door"]')).toHaveCount(1)
  await expect.poll(() => connectedPairs(page)).toContain('Dining Room to Kitchen')
  // The ground's zones stand left of the first floor's.
  const entry = await centreOf(page, 'Entry', 0)
  const bedroom = await centreOf(page, 'Bedroom 1', 1)
  expect(bedroom.x).toBeGreaterThan(entry.x)
})

test('the tiers stand in rows: the public at the bottom, the private at the top', async ({
  page,
}) => {
  await openVilla(page)
  const entry = await centreOf(page, 'Entry')
  const dining = await centreOf(page, 'Dining Room')
  const kitchen = await centreOf(page, 'Kitchen')
  expect(entry.y).toBeGreaterThan(dining.y)
  expect(dining.y).toBeGreaterThan(kitchen.y)
})

test('the same program draws the same diagram twice', async ({ page }) => {
  await openVilla(page)
  const places = () =>
    page.$$eval('.bubbles-sheet [data-zone]', (groups) =>
      groups.map(
        (g) =>
          `${g.getAttribute('data-name')} ${g.getAttribute('data-x')} ${g.getAttribute('data-y')}`,
      ),
    )
  const first = await places()
  await openVilla(page)
  expect(await places()).toEqual(first)
})

test('a nudge moves one bubble, is kept after a reload, and moves nothing else', async ({
  page,
}) => {
  await openVilla(page)
  const kitchen = await centreOf(page, 'Kitchen')
  const dining = await centreOf(page, 'Dining Room')
  const across = async () => Number(await zoneNamed(page, 'Kitchen').getAttribute('data-x'))
  const from = await across()
  await drag(page, kitchen, { x: kitchen.x + 40, y: kitchen.y - 20 })
  const moved = await centreOf(page, 'Kitchen')
  expect(moved.x - kitchen.x).toBeCloseTo(40, -1)
  expect(await centreOf(page, 'Dining Room')).toEqual(dining)
  // The rebuild's own autosave may land mid-drag, so wait for the save of the nudge as dropped.
  const nudge = (await across()) - from
  await expect
    .poll(async () => (await saved(page)).zones.find((zone) => zone.name === 'Kitchen')?.bubble?.x)
    .toBeCloseTo(nudge, 6)
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Bubbles', exact: true }).click()
  const after = await centreOf(page, 'Kitchen')
  expect(after.x).toBeCloseTo(moved.x, 0)
  expect(after.y).toBeCloseTo(moved.y, 0)
})

test("a circle's area follows its zone's, and the legend's key is drawn at the same scale", async ({
  page,
}) => {
  await openVilla(page)
  await expect.poll(async () => (await saved(page)).zones.length).toBeGreaterThan(5)
  const project = await saved(page)
  const areaOf = (name: string) => project.zones.find((zone) => zone.name === name)!.targetArea
  const radiusOf = async (name: string) =>
    (await zoneNamed(page, name).locator('.bubble-shape').boundingBox())!.width / 2
  const diwaniya = await radiusOf('Diwaniya')
  const dining = await radiusOf('Dining Room')
  expect(diwaniya / dining).toBeCloseTo(Math.sqrt(areaOf('Diwaniya') / areaOf('Dining Room')), 1)
  const key = page.locator('.legend-key')
  const area = Number(await key.getAttribute('data-key-area'))
  await expect(key).toContainText(`= ${area} m²`)
  const drawn = (await key.locator('circle').boundingBox())!.width / 2
  expect(drawn / diwaniya).toBeCloseTo(Math.sqrt(area / areaOf('Diwaniya')), 1)
})

test('hovering a zone makes its connections bold and fades the rest; selecting it keeps that', async ({
  page,
}) => {
  await openVilla(page)
  const sheet = page.locator('svg.bubbles-sheet')
  const opacity = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((node) => Number(getComputedStyle(node).opacity))
  await expect.poll(async () => (await saved(page)).connections.length).toBeGreaterThan(5)
  const pair = await connectionBetween(page, 'Kitchen', 'Dining Room')
  const project = await saved(page)
  const kitchen = project.zones.find((zone) => zone.name === 'Kitchen')!.id
  const elsewhere = project.connections.find(
    (connection) => connection.a !== kitchen && connection.b !== kitchen,
  )!

  const at = await centreOf(page, 'Kitchen')
  await page.mouse.move(at.x, at.y)
  await expect(sheet).toHaveClass(/bubbles-focusing/)
  await expect(page.locator(`[data-connection="${pair!.id}"]`)).toHaveClass(/line-near/)
  await expect(zoneNamed(page, 'Dining Room')).toHaveClass(/bubble-near/)
  await expect.poll(() => opacity(`[data-connection="${elsewhere.id}"]`)).toBeLessThan(0.3)
  await expect.poll(() => opacity(`[data-connection="${pair!.id}"]`)).toBe(1)
  const bold = await page
    .locator(`[data-connection="${pair!.id}"] .connection`)
    .first()
    .evaluate((line) => parseFloat(getComputedStyle(line).strokeWidth))
  expect(bold).toBeGreaterThan(3)

  await page.mouse.move(5, 5)
  await expect(sheet).not.toHaveClass(/bubbles-focusing/)
  await expect.poll(() => opacity(`[data-connection="${elsewhere.id}"]`)).toBe(1)

  await selectZone(page, 'Kitchen')
  await page.mouse.move(5, 5)
  await expect(sheet).toHaveClass(/bubbles-focusing/)
  await expect(page.locator(`[data-connection="${pair!.id}"]`)).toHaveClass(/line-near/)
})

test("clicking a storey's name brings it forward and fades the others", async ({ page }) => {
  await openVilla(page)
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.getByRole('button', { name: 'First', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(zoneNamed(page, 'Kitchen')).toHaveClass(/bubble-dimmed/)
  await expect(zoneNamed(page, 'Bedroom 1', 1)).not.toHaveClass(/bubble-dimmed/)
  await page.getByRole('button', { name: 'All storeys' }).click()
  await expect(zoneNamed(page, 'Kitchen')).not.toHaveClass(/bubble-dimmed/)
})

test('a zone sent upstairs takes its suite with it and changes column', async ({ page }) => {
  await openVilla(page, { masterOnGround: true })
  await expect.poll(() => connectedPairs(page)).toContain('Ground Hallway to Master Bedroom')
  await selectZone(page, 'Master Bedroom')
  await page.getByRole('button', { name: 'To First' }).click()
  await expect(zoneNamed(page, 'Master Bedroom', 1)).toHaveCount(1)
  await expect(zoneNamed(page, 'Ensuite, Master Bedroom', 1)).toHaveCount(1)
  await expect.poll(() => connectedPairs(page)).toContain('First Hallway to Master Bedroom')
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Master Bedroom')).toBe('Ground')
  expect(await storeyOf(page, 'Ensuite, Master Bedroom')).toBe('Ground')
})

test('Delete takes a zone and its connections, and one undo brings both back', async ({ page }) => {
  await openVilla(page)
  const zones = await page.locator('.bubbles-sheet [data-zone]').count()
  const connections = await page.locator('[data-connection]').count()
  await selectZone(page, 'Kitchen')
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('.bubbles-sheet [data-zone]')).toHaveCount(zones - 1)
  expect(await page.locator('[data-connection]').count()).toBeLessThan(connections)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.bubbles-sheet [data-zone]')).toHaveCount(zones)
  await expect(page.locator('[data-connection]')).toHaveCount(connections)
})

test('deleting the hallway upstairs brings the nudge, and Add hallway answers it', async ({
  page,
}) => {
  await openVilla(page)
  await selectZone(page, 'First Hallway', 1)
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('.bubbles-nudge')).toHaveText(
    /First has three private-tier zones and no hallway\./,
  )
  await page.getByRole('button', { name: 'Add hallway on First' }).click()
  await expect(page.locator('.bubbles-nudge')).toHaveCount(0)
  await expect(zoneNamed(page, 'First Hallway', 1)).toHaveCount(1)
})
