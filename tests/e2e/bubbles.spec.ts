import { expect, test } from '@playwright/test'
import {
  centreOf,
  drag,
  linkedPairs,
  openVilla,
  roomNamed,
  saved,
  selectRoom,
  storeyOf,
} from './bubbles'

/*
 * The bubble diagram as the connection graph: a column per storey, the tiers in rows, no plot and
 * no physics, and a nudge that is kept and means nothing else.
 */

test('the rebuild draws every storey side by side with the default connections as edges', async ({
  page,
}) => {
  await openVilla(page)
  await expect(page.getByRole('button', { name: 'Ground', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'First', exact: true })).toBeVisible()
  await expect(page.locator('.bubbles-sheet .plot, .buildable')).toHaveCount(0)
  expect(await page.locator('[data-edge]').count()).toBeGreaterThan(10)
  await expect(page.locator('[data-kind="main-door"]')).toHaveCount(1)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
  // The ground's rooms stand left of the first floor's.
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
    page.$$eval('.bubbles-sheet [data-room]', (groups) =>
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
  await drag(page, kitchen, { x: kitchen.x + 40, y: kitchen.y - 20 })
  const moved = await centreOf(page, 'Kitchen')
  expect(moved.x - kitchen.x).toBeCloseTo(40, -1)
  expect(await centreOf(page, 'Dining Room')).toEqual(dining)
  await expect
    .poll(async () => (await saved(page)).rooms.find((room) => room.name === 'Kitchen')?.bubble)
    .toBeDefined()
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: 'Bubbles', exact: true }).click()
  const after = await centreOf(page, 'Kitchen')
  expect(after.x).toBeCloseTo(moved.x, 0)
  expect(after.y).toBeCloseTo(moved.y, 0)
})

test("clicking a storey's name brings it forward and fades the others", async ({ page }) => {
  await openVilla(page)
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.getByRole('button', { name: 'First', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/bubble-dimmed/)
  await expect(roomNamed(page, 'Bedroom 1', 1)).not.toHaveClass(/bubble-dimmed/)
  await page.getByRole('button', { name: 'All storeys' }).click()
  await expect(roomNamed(page, 'Kitchen')).not.toHaveClass(/bubble-dimmed/)
})

test('a room sent upstairs takes its suite with it and changes column', async ({ page }) => {
  await openVilla(page, { masterOnGround: true })
  await expect.poll(() => linkedPairs(page)).toContain('Ground Hallway to Master Bedroom')
  await selectRoom(page, 'Master Bedroom')
  await page.getByRole('button', { name: 'To First' }).click()
  await expect(roomNamed(page, 'Master Bedroom', 1)).toHaveCount(1)
  await expect(roomNamed(page, 'Ensuite, Master Bedroom', 1)).toHaveCount(1)
  await expect.poll(() => linkedPairs(page)).toContain('First Hallway to Master Bedroom')
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Master Bedroom')).toBe('Ground')
  expect(await storeyOf(page, 'Ensuite, Master Bedroom')).toBe('Ground')
})

test('Delete takes a room and its edges, and one undo brings both back', async ({ page }) => {
  await openVilla(page)
  const rooms = await page.locator('.bubbles-sheet [data-room]').count()
  const links = await page.locator('[data-edge]').count()
  await selectRoom(page, 'Kitchen')
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('.bubbles-sheet [data-room]')).toHaveCount(rooms - 1)
  expect(await page.locator('[data-edge]').count()).toBeLessThan(links)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.bubbles-sheet [data-room]')).toHaveCount(rooms)
  await expect(page.locator('[data-edge]')).toHaveCount(links)
})

test('deleting the hallway upstairs brings the nudge, and Add hallway answers it', async ({
  page,
}) => {
  await openVilla(page)
  await selectRoom(page, 'First Hallway', 1)
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('.bubbles-nudge')).toHaveText(
    /First has three private rooms and no hallway\./,
  )
  await page.getByRole('button', { name: 'Add hallway on First' }).click()
  await expect(page.locator('.bubbles-nudge')).toHaveCount(0)
  await expect(roomNamed(page, 'First Hallway', 1)).toHaveCount(1)
})
