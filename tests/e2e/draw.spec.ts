import { expect, test, type Page } from '@playwright/test'
import { exported, textOf } from './exporting'
import { openSheet } from './plan'

type At = { x: number; y: number }

async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await openSheet(page)
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

function roomNamed(page: Page, name: string) {
  return page.locator('[data-room]').filter({ has: page.getByText(name, { exact: true }) })
}

/** The tool opened on a room of the tray, asked for by the small list the button puts up. */
async function tool(page: Page, button: 'Draw' | 'Circle', room: string): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click()
  await page.locator('[data-pick]').getByRole('button', { name: room, exact: true }).click()
  await expect(page.getByRole('button', { name: button, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
}

async function clickSheet(page: Page, x: number, y: number): Promise<void> {
  const at = await onSheet(page, x, y)
  await page.mouse.click(at.x, at.y)
}

/** A corner put down with `A` held and the wall reaching it bowed out through a dragged point. */
async function bowTo(page: Page, corner: At, through: At): Promise<void> {
  await page.keyboard.down('a')
  await page.mouse.move(corner.x, corner.y)
  await page.mouse.down()
  await page.mouse.move((corner.x + through.x) / 2, (corner.y + through.y) / 2)
  await page.mouse.move(through.x, through.y)
  await page.mouse.up()
  await page.keyboard.up('a')
}

async function cornersOf(page: Page, name: string): Promise<readonly (readonly number[])[]> {
  const points = await roomNamed(page, name).locator('polygon').getAttribute('points')
  return (points ?? '').split(' ').map((pair) => pair.split(',').map(Number))
}

function polygonArea(polygon: readonly (readonly number[])[]): number {
  let twice = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index] ?? []
    const b = polygon[(index + 1) % polygon.length] ?? []
    twice += (a[0] ?? 0) * (b[1] ?? 0) - (b[0] ?? 0) * (a[1] ?? 0)
  }
  return Math.abs(twice / 2)
}

test('an L drawn by hand becomes the room, and its area is what it encloses', async ({ page }) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  for (const [x, y] of [
    [2, 2],
    [8, 2],
    [8, 5],
    [5, 5],
    [5, 9],
    [2, 9],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await expect(page.locator('[data-draw-run]')).toBeVisible()
  await clickSheet(page, 2, 2)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '30.00')
  expect(await cornersOf(page, 'Kitchen')).toHaveLength(6)
  await expect(page.getByRole('button', { name: 'Draw', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('a wall bowed out into a bay measures more than the polygon that stands for it', async ({
  page,
}) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Diwaniya')
  await clickSheet(page, 2, 2)
  await clickSheet(page, 10, 2)
  await bowTo(page, await onSheet(page, 10, 8), await onSheet(page, 13, 5))
  await clickSheet(page, 2, 8)
  await page.locator('svg.zoning-sheet').press('Enter')
  const exact = Number(await roomNamed(page, 'Diwaniya').getAttribute('data-area'))
  const corners = await cornersOf(page, 'Diwaniya')
  // The rectangle is 8 by 6, and a half-round bay of radius 3 on its east wall adds 14.1 m².
  expect(exact).toBeGreaterThan(61.5)
  expect(exact).toBeLessThan(62.8)
  expect(corners.length).toBeGreaterThan(20)
  expect(exact - polygonArea(corners)).toBeGreaterThan(0.005)
})

test('a circle of radius 2.5 m measures 19.6 m² and exports as a true arc', async ({ page }) => {
  await openZoning(page)
  await tool(page, 'Circle', 'Guest WC')
  const centre = await onSheet(page, 10, 12)
  const rim = await onSheet(page, 12.5, 12)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move((centre.x + rim.x) / 2, centre.y)
  await page.mouse.move(rim.x, rim.y)
  await page.mouse.up()
  await expect(roomNamed(page, 'Guest WC')).toHaveAttribute('data-area', '19.63')
  await expect(page.getByText(/^19\.6 of /)).toBeVisible()
  expect((await cornersOf(page, 'Guest WC')).length).toBeGreaterThanOrEqual(48)

  const drawing = await textOf(await exported(page, 'Export DXF'))
  expect(drawing).toContain('0\nARC\n8\nS0-ROOMS\n')
  expect(drawing.split('0\nARC\n')).toHaveLength(2)
})

test('a click on the Circle tool gives the room its target area, and a drag still gives the dragged radius', async ({
  page,
}) => {
  await openZoning(page)
  await tool(page, 'Circle', 'Guest WC')
  await clickSheet(page, 10, 12)
  // sqrt(3 m² / π) is 0.98 m, which the 0.05 m step for a click lands on 1.00 m: π m², not 3.
  await expect(roomNamed(page, 'Guest WC')).toHaveAttribute('data-area', '3.14')
  await expect(page.getByText('3.1 of 3 m²')).toBeVisible()

  await tool(page, 'Circle', 'Kitchen')
  // Well clear of the Guest WC's own circle, so the drop lands with no room to ask about.
  const centre = await onSheet(page, 15, 20)
  const rim = await onSheet(page, 17.5, 20)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move((centre.x + rim.x) / 2, centre.y)
  await page.mouse.move(rim.x, rim.y)
  await page.mouse.up()
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '19.63')
})

test('a shape whose walls cross itself is refused with a sentence', async ({ page }) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  for (const [x, y] of [
    [2, 2],
    [8, 8],
    [8, 2],
    [2, 8],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await page.locator('svg.zoning-sheet').press('Enter')
  await expect(page.locator('.messages')).toContainText('its walls cross one another')
  await expect(page.locator('[data-room]')).toHaveCount(0)
})

test('Escape gives up a shape half drawn', async ({ page }) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  await clickSheet(page, 2, 2)
  await clickSheet(page, 8, 2)
  await expect(page.locator('[data-draw-run]')).toBeVisible()
  await page.locator('svg.zoning-sheet').press('Escape')
  await expect(page.locator('[data-draw-run]')).toHaveCount(0)
  await expect(page.locator('[data-room]')).toHaveCount(0)
})

test('a point dragged on a placed room changes its area, and undo puts it back', async ({
  page,
}) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  for (const [x, y] of [
    [2, 2],
    [8, 2],
    [8, 6],
    [2, 6],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await clickSheet(page, 2, 2)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '24.00')
  await clickSheet(page, 5, 4)
  await page.getByRole('button', { name: 'Edit points' }).click()
  await expect(page.locator('[data-vertex]')).toHaveCount(4)
  const from = await onSheet(page, 8, 6)
  const to = await onSheet(page, 11, 6)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, to.y)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '30.00')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '24.00')
})

test('a point is put in at a wall midpoint and taken out again', async ({ page }) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  for (const [x, y] of [
    [2, 2],
    [8, 2],
    [8, 6],
    [2, 6],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await clickSheet(page, 2, 2)
  await clickSheet(page, 5, 4)
  await page.getByRole('button', { name: 'Edit points' }).click()
  await page.locator('[data-add-vertex="0"]').click()
  await expect(page.locator('[data-vertex]')).toHaveCount(5)
  expect(await cornersOf(page, 'Kitchen')).toHaveLength(5)
  await page.locator('[data-vertex="1"]').click()
  await page.locator('svg.zoning-sheet').press('Delete')
  await expect(page.locator('[data-vertex]')).toHaveCount(4)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '24.00')
})

test('a shape drawn over a neighbour asks, and Carve takes the bite out of it', async ({
  page,
}) => {
  await openZoning(page)
  await tool(page, 'Draw', 'Kitchen')
  for (const [x, y] of [
    [2, 2],
    [8, 2],
    [8, 6],
    [2, 6],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await clickSheet(page, 2, 2)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '24.00')
  await tool(page, 'Draw', 'Dining Room')
  for (const [x, y] of [
    [6, 4],
    [12, 4],
    [12, 9],
    [6, 9],
  ]) {
    await clickSheet(page, x ?? 0, y ?? 0)
  }
  await clickSheet(page, 6, 4)
  await expect(page.locator('[data-ask]')).toBeVisible()
  await page.locator('[data-carve]').click()
  await expect(roomNamed(page, 'Dining Room')).toHaveAttribute('data-area', '30.00')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.00')
})
