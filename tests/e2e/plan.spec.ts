import { expect, test, type Page } from '@playwright/test'
import { openBoth, openMass, openSheet, tab } from './plan'

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

/** A room on the zoning half, by the name on its label. */
function roomNamed(page: Page, name: string) {
  return page
    .locator('svg.zoning-sheet [data-room]')
    .filter({ has: page.getByText(name, { exact: true }) })
}

async function pointsOf(page: Page, name: string): Promise<string | null> {
  return roomNamed(page, name).locator('polygon').getAttribute('points')
}

async function place(page: Page, name: string, x: number, y: number): Promise<void> {
  const tray = page
    .locator('[data-tray]')
    .filter({ hasText: new RegExp(`^${name}`) })
    .first()
  await tray.scrollIntoViewIfNeeded()
  const from = await tray.boundingBox()
  if (!from) throw new Error(`${name} is not in the tray`)
  await drag(
    page,
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    await onSheet(page, x, y),
  )
}

async function clickSheet(page: Page, x: number, y: number): Promise<void> {
  const at = await onSheet(page, x, y)
  await page.mouse.click(at.x, at.y)
}

/** The prism of one room in the massing half, found by the name on its hover label. */
function prismNamed(page: Page, name: string) {
  return page
    .locator('svg.massing-sheet [data-room]')
    .filter({ has: page.locator('title', { hasText: name }) })
}

/** The middle of a room's roof on the screen, which is what the hand slides the room by. */
async function roofOf(page: Page, name: string): Promise<At> {
  const box = await prismNamed(page, name).locator('.face-top').boundingBox()
  if (!box) throw new Error(`${name} has no roof drawn`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The middle of a room's roof read off its own corners, which is the point a turn is about. */
async function roofCentre(page: Page, name: string): Promise<At> {
  return page.evaluate((wanted) => {
    const group = [...document.querySelectorAll('svg.massing-sheet [data-room]')].find(
      (prism) => prism.querySelector('title')?.textContent?.startsWith(wanted) ?? false,
    )
    const top = group?.querySelector('.face-top')
    if (!(top instanceof SVGPolygonElement)) throw new Error(`${wanted} has no roof drawn`)
    const screen = top.getScreenCTM()
    if (!screen) throw new Error('the massing is not drawn')
    let x = 0
    let y = 0
    for (let at = 0; at < top.points.numberOfItems; at++) {
      const corner = top.points.getItem(at)
      const on = new DOMPoint(corner.x, corner.y).matrixTransform(screen)
      x += on.x
      y += on.y
    }
    return { x: x / top.points.numberOfItems, y: y / top.points.numberOfItems }
  }, name)
}

/** Picks a room in the massing by pressing its roof and letting go without moving. */
async function pickPrism(page: Page, name: string): Promise<void> {
  const roof = await roofOf(page, name)
  await page.mouse.click(roof.x, roof.y)
  await expect(prismNamed(page, name)).toHaveClass(/prism-selected/)
}

/** A corner of the massing, which the margin round the drawing keeps clear of the mass itself. */
async function emptyGround(page: Page): Promise<At> {
  const sheet = await page.locator('svg.massing-sheet').boundingBox()
  if (!sheet) throw new Error('there is no massing')
  return { x: sheet.x + 6, y: sheet.y + 6 }
}

function massingBox(page: Page) {
  return page.locator('svg.massing-sheet')
}

async function widthOfMassing(page: Page): Promise<number> {
  const shown = await massingBox(page).getAttribute('viewBox')
  return Number((shown ?? '').split(' ')[2])
}

/** The default program with two rooms side by side on the ground, and both halves on the tab. */
async function openTwoRooms(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await openSheet(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await expect(page.locator('svg.zoning-sheet [data-room]')).toHaveCount(2)
  await openBoth(page)
  await expect(page.locator('svg.massing-sheet [data-room]')).toHaveCount(2)
}

/** The same, with the Kitchen alone, so a turn has the whole sheet to turn in. */
async function openOneRoom(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await openSheet(page)
  await place(page, 'Kitchen', 10, 12)
  await openBoth(page)
  await expect(page.locator('svg.massing-sheet [data-room]')).toHaveCount(1)
}

test('a room slid by its roof in the massing moves on the sheet as the hand moves', async ({
  page,
}) => {
  await openTwoRooms(page)
  const before = await pointsOf(page, 'Kitchen')
  const roof = await roofOf(page, 'Kitchen')
  // Right and up the screen from the north-east is south along the sheet, away from the Dining Room.
  await page.mouse.move(roof.x, roof.y)
  await page.mouse.down()
  await page.mouse.move(roof.x + 25, roof.y - 12)
  await page.mouse.move(roof.x + 50, roof.y - 25)
  // Still held: the sheet is drawing the room where the hand has it, not waiting for the drop.
  const during = await pointsOf(page, 'Kitchen')
  expect(during).not.toBe(before)
  await page.mouse.up()
  expect(await pointsOf(page, 'Kitchen')).toBe(during)
})

test('a room let go over its neighbour in the massing is refused and says so', async ({ page }) => {
  await openTwoRooms(page)
  const before = await pointsOf(page, 'Kitchen')
  await drag(page, await roofOf(page, 'Kitchen'), await roofOf(page, 'Dining Room'))
  await expect(page.locator('.messages')).toContainText('would overlap Dining Room')
  await expect(page.locator('.messages')).toContainText('on the sheet to carve')
  await expect(page.locator('[data-ask]')).toHaveCount(0)
  expect(await pointsOf(page, 'Kitchen')).toBe(before)
})

test('a room turned by the handle over its roof turns on the sheet in whole steps', async ({
  page,
}) => {
  await openOneRoom(page)
  await pickPrism(page, 'Kitchen')
  await expect(page.locator('[data-turn-handle]')).toHaveCount(1)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '0.0')

  const handle = await page.locator('[data-turn-handle]').boundingBox()
  if (!handle) throw new Error('the turn handle is not drawn')
  const grip = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  await drag(page, grip, { x: grip.x + 90, y: grip.y + 30 })

  const turned = await roomNamed(page, 'Kitchen').getAttribute('data-rotation')
  expect(turned).not.toBe('0.0')
  expect(Number(turned) % 15).toBe(0)
})

test('the three buttons give the tab to one half or share it between them', async ({ page }) => {
  await openTwoRooms(page)
  await expect(page.getByRole('button', { name: 'Both', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
  await expect(page.locator('svg.massing-sheet')).toHaveCount(0)

  await page.getByRole('button', { name: 'Massing', exact: true }).click()
  await expect(page.locator('svg.zoning-sheet')).toHaveCount(0)
  await expect(page.locator('svg.massing-sheet')).toBeVisible()

  await page.getByRole('button', { name: 'Both', exact: true }).click()
  const sheet = await page.locator('.plan-sheet').boundingBox()
  const massing = await page.locator('.plan-massing').boundingBox()
  if (!sheet || !massing) throw new Error('a half is not drawn')
  // Sixty forty, so the sheet is the wider of the two without the massing being a sliver.
  expect(sheet.width).toBeGreaterThan(massing.width)
  expect(massing.width / (sheet.width + massing.width)).toBeCloseTo(0.4, 1)
})

test('a storey chosen in either half is the storey the other half shows', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  await openBoth(page)
  const onSheetHalf = page.locator('.plan-sheet .zoning-storeys')
  const onMassHalf = page.locator('.plan-massing .zoning-storeys')

  await onMassHalf.getByRole('button', { name: 'First', exact: true }).click()
  await expect(onSheetHalf.getByRole('button', { name: 'First', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(onMassHalf.getByRole('button', { name: 'Ground', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  await onSheetHalf.getByRole('button', { name: 'Ground', exact: true }).click()
  await expect(onMassHalf.getByRole('button', { name: 'Ground', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the storey in view is lit in the massing and the others stand back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  const upstairs = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Bedroom 1"]')) })
  await upstairs.getByLabel('Storey').selectOption({ label: 'First' })
  await openSheet(page)
  await place(page, 'Kitchen', 5, 5.125)
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await place(page, 'Bedroom 1', 12, 12)
  await openBoth(page)
  await expect(page.locator('svg.massing-sheet [data-storey-lit="true"]')).toHaveCount(1)
  await expect(page.locator('svg.massing-sheet [data-storey-lit="false"]')).toHaveCount(1)
  await page.locator('.plan-sheet .zoning-storeys').getByRole('button', { name: 'Ground' }).click()
  await expect(
    prismNamed(page, 'Kitchen').and(page.locator('[data-storey-lit="true"]')),
  ).toHaveCount(1)
})

test('the Plan preset looks straight down with north up the screen', async ({ page }) => {
  await openTwoRooms(page)
  await page.locator('.massing-views').getByRole('button', { name: 'Plan', exact: true }).click()
  const way = await page.evaluate(() => {
    const stem = document.querySelector('svg.massing-sheet .north-stem')
    if (!(stem instanceof SVGPolylineElement)) throw new Error('north is not drawn')
    const screen = stem.getScreenCTM()
    const foot = stem.points.getItem(0)
    const tip = stem.points.getItem(1)
    if (!screen) throw new Error('the massing is not drawn')
    const from = new DOMPoint(foot.x, foot.y).matrixTransform(screen)
    const to = new DOMPoint(tip.x, tip.y).matrixTransform(screen)
    return { across: to.x - from.x, down: to.y - from.y }
  })
  expect(way.down).toBeLessThan(-10)
  expect(Math.abs(way.across)).toBeLessThan(1)
})

test('a drag down the massing tilts the view without turning it', async ({ page }) => {
  await openTwoRooms(page)
  const ground = await emptyGround(page)
  const before = await massingBox(page).getAttribute('viewBox')
  await drag(page, ground, { x: ground.x, y: ground.y + 120 })
  // A drag straight down leaves the azimuth where it was, so NE lets go only because of the tilt.
  await expect(page.getByRole('button', { name: 'NE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(await massingBox(page).getAttribute('viewBox')).not.toBe(before)
  await page.locator('.massing-views').getByRole('button', { name: 'NE', exact: true }).click()
  await expect(page.getByRole('button', { name: 'NE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the mass turns about the room that is picked and holds it under the same pixel', async ({
  page,
}) => {
  await openTwoRooms(page)
  await pickPrism(page, 'Kitchen')
  const before = await roofCentre(page, 'Kitchen')
  const ground = await emptyGround(page)
  await drag(page, ground, { x: ground.x + 260, y: ground.y })
  await expect(page.getByRole('button', { name: 'NE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  const after = await roofCentre(page, 'Kitchen')
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)
})

test('the wheel draws the massing closer', async ({ page }) => {
  await openTwoRooms(page)
  const before = await widthOfMassing(page)
  const roof = await roofOf(page, 'Kitchen')
  await page.mouse.move(roof.x, roof.y)
  await page.mouse.wheel(0, -300)
  await expect(massingBox(page)).not.toHaveAttribute('viewBox', `${await widthOfMassing(page)} x`)
  expect(await widthOfMassing(page)).toBeLessThan(before)
  await page.locator('.massing-views').getByRole('button', { name: 'Fit', exact: true }).click()
  expect(await widthOfMassing(page)).toBeCloseTo(before, 3)
})

test('a door is opened and closed again from the sheet, and an open edge is picked there', async ({
  page,
}) => {
  await openTwoRooms(page)
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  // The rulebook gave these two a door when the program was rebuilt, so the sheet carries one
  // already: this test is about picking it and turning it into an opening.
  await expect(page.locator('[data-edge][data-door="door"]')).toHaveCount(1)

  // Nothing picked, so the room's own handles are not standing over the wall the door is on; the
  // mark itself is a hairline, so it is aimed at by the metre of wall it stands on.
  await clickSheet(page, 17, 1.5)
  await clickSheet(page, 7.75, 5.125)
  await expect(page.locator('.door-selected')).toHaveCount(1)
  await page.getByRole('button', { name: 'Make it open' }).click()
  await expect(page.locator('[data-join]')).toHaveCount(1)
  await expect(page.locator('[data-edge][data-door="open"]')).toHaveCount(1)

  // Nothing picked, so the dotted line left of the wall is what the next click finds.
  await clickSheet(page, 17, 1.5)
  await expect(page.locator('.vanished-selected')).toHaveCount(0)
  await clickSheet(page, 7.75, 5.125)
  await expect(page.locator('.vanished-selected')).toHaveCount(1)

  await page.getByRole('button', { name: 'Make it a door' }).click()
  await expect(page.locator('[data-join]')).toHaveCount(0)
  await expect(page.locator('[data-edge][data-door="door"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.locator('[data-edge]')).toHaveCount(0)
})

test('the tab opens on the Plan, with the sheet and the massing together', async ({ page }) => {
  await page.goto('/')
  await expect(tab(page, 'Plan')).toBeVisible()
  await tab(page, 'Plan').click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
})

test('the handle between the halves gives one of them more of the tab', async ({ page }) => {
  await openTwoRooms(page)
  const before = await page.locator('svg.zoning-sheet').boundingBox()
  const handle = await page.locator('.plan-handle').boundingBox()
  if (!before || !handle) throw new Error('the tab is not split')
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + 40 },
    { x: handle.x + handle.width / 2 - 200, y: handle.y + 40 },
  )
  const after = await page.locator('svg.zoning-sheet').boundingBox()
  if (!after) throw new Error('the sheet is gone')
  expect(after.width).toBeLessThan(before.width - 100)

  // What the hand set is what Both goes back to, so the massing keeps the room it was given.
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.getByRole('button', { name: 'Both', exact: true }).click()
  const again = await page.locator('svg.zoning-sheet').boundingBox()
  expect(again?.width).toBeCloseTo(after.width, 0)
})

test('a room picked in the massing is the room picked on the sheet', async ({ page }) => {
  await openTwoRooms(page)
  await pickPrism(page, 'Dining Room')
  await expect(roomNamed(page, 'Dining Room')).toHaveClass(/room-selected/)
  await openMass(page)
  await expect(prismNamed(page, 'Dining Room')).toHaveClass(/prism-selected/)
})

test('a handle on the sheet keeps its size on the screen when the window changes height', async ({
  page,
}) => {
  await openTwoRooms(page)
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await clickSheet(page, 5, 5.125)
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)

  const handle = page.locator('svg.zoning-sheet .resize-handle').first()
  const before = await handle.boundingBox()
  const sheetBefore = (await page.locator('svg.zoning-sheet').boundingBox())?.height ?? 0

  await page.setViewportSize({ width: 1280, height: 980 })
  await expect
    .poll(async () => (await page.locator('svg.zoning-sheet').boundingBox())?.height ?? 0)
    .toBeGreaterThan(sheetBefore + 100)
  const after = await handle.boundingBox()
  if (!before || !after) throw new Error('the handle is not drawn')

  // The sheet is deeper, so the plan is drawn larger; the handle is the same target it was.
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
})
