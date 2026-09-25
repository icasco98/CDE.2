import { expect, test, type Page } from '@playwright/test'
import {
  centreOf,
  connect,
  drag,
  edgeBetween,
  linkedPairs,
  openVilla,
  roomNamed,
  selectRoom,
} from './bubbles'

/*
 * The bubble diagram's camera: the wheel zooms about the pointer, a drag on the background pans, a
 * click there still lets the selection go, Fit shows the whole, and every gesture on a room or a
 * line works the same at any zoom.
 */

const sheet = (page: Page) => page.locator('svg.bubbles-sheet')

async function viewBox(page: Page) {
  const [x, y, width, height] = ((await sheet(page).getAttribute('viewBox')) ?? '')
    .split(' ')
    .map(Number)
  return { x: x!, y: y!, width: width!, height: height! }
}

/** Screen pixels per unit of the diagram, as the browser draws it now. */
const pixels = (page: Page) =>
  sheet(page).evaluate((svg) => {
    const screen = (svg as SVGSVGElement).getScreenCTM()!
    return Math.hypot(screen.a, screen.b)
  })

/** A point on the diagram's background: low in the first column, under every room. */
async function background(page: Page) {
  const box = (await sheet(page).boundingBox())!
  return { x: box.x + 40, y: box.y + box.height - 20 }
}

/** The wheel turned over a room until the diagram is drawn `times` closer. */
async function zoomOver(page: Page, name: string, times: number) {
  const at = await centreOf(page, name)
  await page.mouse.move(at.x, at.y)
  // One notch of 100 pixels draws the sheet 1.1 times closer.
  await page.mouse.wheel(0, (-100 * Math.log(times)) / Math.log(1.1))
  return at
}

test('the wheel zooms about the pointer, a drag on the background pans, and Fit shows the whole', async ({
  page,
}) => {
  await openVilla(page)
  const whole = await viewBox(page)
  const at = await zoomOver(page, 'Kitchen', 2)
  await expect.poll(async () => (await viewBox(page)).width).toBeCloseTo(whole.width / 2, 3)
  const kitchen = await centreOf(page, 'Kitchen')
  expect(Math.hypot(kitchen.x - at.x, kitchen.y - at.y)).toBeLessThan(2)

  const zoomed = await viewBox(page)
  const from = await background(page)
  await drag(page, from, { x: from.x + 60, y: from.y - 30 })
  const panned = await viewBox(page)
  expect(panned.x).toBeLessThan(zoomed.x)
  expect(panned.y).toBeGreaterThan(zoomed.y)
  const moved = await centreOf(page, 'Kitchen')
  expect(moved.x - kitchen.x).toBeCloseTo(60, -1)

  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  expect(await viewBox(page)).toEqual(whole)
})

test('a click on the background lets the selection go, and a drag there keeps it', async ({
  page,
}) => {
  await openVilla(page)
  await zoomOver(page, 'Kitchen', 1.5)
  await selectRoom(page, 'Kitchen')
  const from = await background(page)
  await drag(page, from, { x: from.x + 40, y: from.y - 20 })
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/bubble-selected/)
  await page.mouse.click(from.x + 40, from.y - 20)
  await expect(roomNamed(page, 'Kitchen')).not.toHaveClass(/bubble-selected/)
})

test('at three times closer a drag from the ring connects, a drag nudges, and a line selects', async ({
  page,
}) => {
  await openVilla(page)
  const whole = await viewBox(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Family Living to Kitchen')
  await zoomOver(page, 'Kitchen', 3)
  await expect.poll(async () => (await viewBox(page)).width).toBeCloseTo(whole.width / 3, 3)

  await connect(page, 'Kitchen', 'Family Living')
  await expect.poll(() => linkedPairs(page)).toContain('Family Living to Kitchen')

  const across = async () => Number(await roomNamed(page, 'Family Living').getAttribute('data-x'))
  const before = await across()
  const family = await centreOf(page, 'Family Living')
  await drag(page, family, { x: family.x - 30, y: family.y })
  expect((before - (await across())) * (await pixels(page))).toBeCloseTo(30, 0)

  const edge = await edgeBetween(page, 'Kitchen', 'Family Living')
  const grip = (await page.locator(`[data-edge="${edge!.id}"] .link-grip`).boundingBox())!
  await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await expect(page.getByRole('region', { name: 'Connection' })).toContainText(
    'Kitchen ↔ Family Living',
  )
})
