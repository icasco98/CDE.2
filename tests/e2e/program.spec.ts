import { expect, test, type Page } from '@playwright/test'
import { tab } from './tabs'

/**
 * The brief is the owner's, not the tool's: a program entered on Requirements is the program the
 * Sheet draws, and a room added on the Sheet is a room of the brief from then on.
 */

/** Twelve kinds the room-type table brings nothing else along with, so the program is twelve rooms. */
const twelve = [
  'entry-foyer',
  'formal-living',
  'family-living',
  'dining-room',
  'kitchen',
  'guest-wc',
  'storage',
  'laundry',
  'office-study',
  'prayer-room',
  'bathroom',
  'courtyard',
]

const rowsOf = (page: Page) => page.locator('table.program tbody tr')

const blocks = (page: Page) => page.locator('.tray .item')

/** The name and the target area of every room of the brief, as Requirements holds them. */
async function programEntered(page: Page): Promise<{ name: string; target: number }[]> {
  return rowsOf(page).evaluateAll((rows) =>
    rows.map((row) => ({
      name: (row.querySelector('input[aria-label="Room name"]') as HTMLInputElement).value,
      target: Number(
        (row.querySelector('input[aria-label="Target area"]') as HTMLInputElement).value,
      ),
    })),
  )
}

/** The name and the area of every block of the Sheet's program column, in the order it draws them. */
async function programDrawn(page: Page): Promise<{ name: string; area: number }[]> {
  return blocks(page).evaluateAll((items) =>
    items.map((item) => ({
      name: item.querySelector('.n')?.textContent?.trim() ?? '',
      area: Number(/[\d.]+/.exec(item.querySelector('.a')?.textContent ?? '')?.[0] ?? NaN),
    })),
  )
}

async function enterTwelveRooms(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Project name').fill('Salwa House')
  for (const kind of twelve) {
    await page.getByLabel('Kind to add').selectOption(kind)
    await page.getByRole('button', { name: 'Add room' }).click()
  }
  await expect(rowsOf(page)).toHaveCount(12)
}

test('the twelve rooms entered in Requirements are the Sheet’s program, with their areas', async ({
  page,
}) => {
  await enterTwelveRooms(page)
  const entered = await programEntered(page)

  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()

  await expect(blocks(page)).toHaveCount(12)
  const drawn = await programDrawn(page)
  expect(drawn.map((block) => block.name)).toEqual(entered.map((room) => room.name))
  expect(drawn.map((block) => block.area)).toEqual(
    entered.map((room) => Math.round(room.target * 10) / 10),
  )
  // None of them is placed yet, so the sentence says the whole program is still to draw. Open
  // ground — the courtyard — is not building, so it is not in what the brief asks of the floor.
  const asked = entered
    .filter((room) => room.name !== 'Courtyard')
    .reduce((sum, room) => sum + room.target, 0)
  await expect(page.locator('.say')).toContainText(
    `0 m² placed of ${Math.round(asked * 10) / 10} m² asked`,
  )
})

test('a target changed in Requirements is the target the Sheet reads', async ({ page }) => {
  await enterTwelveRooms(page)
  const kitchen = rowsOf(page).filter({ has: page.locator('input[value="Kitchen"]') })
  await kitchen.getByLabel('Target area').fill('30')

  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  await expect(page.locator('.tray .item', { hasText: 'Kitchen' }).locator('.a')).toHaveText(
    '30 m²',
  )
})

test('a room added on the Sheet is a room of the brief in Requirements', async ({ page }) => {
  await enterTwelveRooms(page)
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()

  await page.locator('.add-room').getByLabel('Kind').selectOption('bedroom')
  await page.locator('.add-room').getByLabel('Name').fill('Girls Bedroom')
  await page.locator('.add-room').getByLabel('Size').selectOption('big')
  await page.getByRole('button', { name: '+ Add to the program' }).click()

  await expect(blocks(page)).toHaveCount(13)
  await expect(page.locator('.tray .item', { hasText: 'Girls Bedroom' })).toHaveCount(1)

  await tab(page, 'Requirements').click()
  await expect(rowsOf(page)).toHaveCount(13)
  const added = rowsOf(page).filter({ has: page.locator('input[value="Girls Bedroom"]') })
  await expect(added.getByLabel('Room kind')).toHaveValue('bedroom')
  await expect(added.getByLabel('Target area')).toHaveValue('22')
})

test('a room taken out on the Sheet is out of the brief, and the plot is the project’s', async ({
  page,
}) => {
  await enterTwelveRooms(page)
  await page.getByLabel('Width (m)').fill('30')
  await page.getByLabel('Depth (m)').fill('30')
  await page.getByLabel('North (degrees from up)').fill('40')

  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()

  // the plot is 30 by 30 with the Municipality's larger setback: 2 m from a neighbour's boundary
  await expect(page.locator('svg.sheet rect.plot')).toHaveAttribute('width', '30')
  await expect(page.locator('svg.sheet rect.buildable')).toHaveAttribute('x', '2')

  await page
    .locator('.tray .item', { hasText: 'Laundry' })
    .getByRole('button', { name: '×' })
    .click()
  await expect(blocks(page)).toHaveCount(11)

  await tab(page, 'Requirements').click()
  await expect(rowsOf(page)).toHaveCount(11)
  await expect(rowsOf(page).filter({ has: page.locator('input[value="Laundry"]') })).toHaveCount(0)
})

test('a saved sheet is reconciled with a brief it does not match: the brief wins', async ({
  page,
}) => {
  // the sample sheet is drawn on first, with no brief entered at all
  await page.goto('/')
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  const sample = await blocks(page).count()
  expect(sample).toBeGreaterThan(12)
  // the sheet is the owner's once it is saved, which is what a brief is later reconciled with
  await expect
    .poll(() => page.evaluate(() => !!window.localStorage.getItem('cde.sheet')))
    .toBe(true)

  // then a brief of twelve rooms arrives, and the sheet is opened again
  await tab(page, 'Requirements').click()
  for (const kind of twelve) {
    await page.getByLabel('Kind to add').selectOption(kind)
    await page.getByRole('button', { name: 'Add room' }).click()
  }
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()

  const drawn = await programDrawn(page)
  const entered = await (async () => {
    await tab(page, 'Requirements').click()
    const rooms = await programEntered(page)
    await tab(page, 'Sheet').click()
    return rooms
  })()
  expect(drawn.slice(0, 12).map((block) => block.name)).toEqual(entered.map((room) => room.name))
  // the sample's own rooms are kept aside on the sheet, and the sentence says how many
  await expect(page.locator('.tray .item.aside').first()).toBeVisible()
  await expect(page.locator('.say')).toContainText('the brief does not name')
})
