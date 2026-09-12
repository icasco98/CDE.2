import { expect, test, type Page } from '@playwright/test'
import { openMass, openSheet, tab } from './plan'

type At = { x: number; y: number }

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

async function drag(page: Page, from: At, to: At): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

async function place(page: Page, name: string, x: number, y: number): Promise<void> {
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
  )
}

/** The default program, two rooms placed side by side on the ground, and the massing across the tab. */
async function openMassing(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await openSheet(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await expect(page.locator('svg.zoning-sheet [data-room]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Massing', exact: true }).click()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
}

/** The rooms in the order they are drawn, read off their hover labels. */
async function drawnOrder(page: Page): Promise<string[]> {
  return page.locator('svg.massing-sheet [data-room] > title').allTextContents()
}

function numberNamed(page: Page, name: string) {
  return page.locator(`[data-number="${name}"]`)
}

test('the placed rooms stand up as prisms', async ({ page }) => {
  await openMassing(page)
  await expect(page.locator('svg.massing-sheet [data-room]')).toHaveCount(2)
  // Four walls and a top for each room.
  await expect(page.locator('svg.massing-sheet [data-room] polygon')).toHaveCount(10)
  await expect(page.locator('.massing-unplaced')).toContainText('not placed')
})

test('a room clicked here is the room selected in the zoning', async ({ page }) => {
  await openMassing(page)
  const kitchen = page
    .locator('svg.massing-sheet [data-room]')
    .filter({ has: page.locator('title', { hasText: 'Kitchen' }) })
  await kitchen.click()
  await expect(kitchen).toHaveClass(/prism-selected/)
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(
    page.locator('[data-room]').filter({ has: page.getByText('Kitchen', { exact: true }) }),
  ).toHaveClass(/room-selected/)
})

test('a taller ground storey raises the building and its volume', async ({ page }) => {
  await openMassing(page)
  await expect(numberNamed(page, 'building-height')).toHaveText('3.5 m')
  const volume = await numberNamed(page, 'volume').textContent()
  await page.getByLabel('Height of Ground').fill('4')
  await expect(numberNamed(page, 'building-height')).toHaveText('4.0 m')
  await expect(numberNamed(page, 'volume')).not.toHaveText(volume ?? '')
  // Volume is the storey's outline area times its height, so it grows by exactly four over three and a half.
  const taller = Number((await numberNamed(page, 'volume').textContent())?.replace(/[^\d.]/g, ''))
  const before = Number(volume?.replace(/[^\d.]/g, ''))
  expect(taller / before).toBeCloseTo(4 / 3.5, 2)
})

test('a height under the clear minimum is warned about, and so is a house over 15 m', async ({
  page,
}) => {
  await openMassing(page)
  await page.getByLabel('Height of Ground').fill('2.5')
  await expect(page.locator('.massing-heights .warning')).toContainText('3 m clear minimum')
  await page.getByLabel('Height of Ground').fill('16')
  await expect(page.locator('.massing-heights p.warning')).toContainText('15 m maximum')
})

test('a storey added on the requirements screen brings a height field with it', async ({
  page,
}) => {
  await openMassing(page)
  await expect(page.getByLabel(/^Height of /)).toHaveCount(1)
  await tab(page, 'Requirements').click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  await openMass(page)
  await expect(page.getByLabel(/^Height of /)).toHaveCount(2)
  await expect(page.getByLabel('Height of First')).toHaveValue('3.5')
  await expect(page.locator('[data-storey="1"]')).toBeVisible()
})

test('the north-east and south-west views draw the same rooms in the other order', async ({
  page,
}) => {
  await openMassing(page)
  const fromNorthEast = await drawnOrder(page)
  expect(fromNorthEast).toHaveLength(2)
  await page.getByRole('button', { name: 'SW', exact: true }).click()
  const fromSouthWest = await drawnOrder(page)
  expect(fromSouthWest).toEqual([...fromNorthEast].reverse())
})

test('a drag on empty ground turns the view', async ({ page }) => {
  await openMassing(page)
  const before = await drawnOrder(page)
  const sheet = await page.locator('svg.massing-sheet').boundingBox()
  if (!sheet) throw new Error('there is no sheet')
  // A corner of the sheet, which the margin round the drawing keeps clear of the mass itself.
  const edge = { x: sheet.x + 20, y: sheet.y + 20 }
  await drag(page, edge, { x: edge.x + 400, y: edge.y })
  await expect(page.getByRole('button', { name: 'NE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(await drawnOrder(page)).toEqual([...before].reverse())
})
