import { expect, test, type Page } from '@playwright/test'

type At = { x: number; y: number }

async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
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

async function centreOf(page: Page, selector: string): Promise<At> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`nothing to aim at: ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: At, to: At, modifier?: 'Alt'): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.up()
  if (modifier) await page.keyboard.up(modifier)
}

/** A room by the name on its label, as the store gave it. */
function roomNamed(page: Page, name: string) {
  return page.locator('[data-room]').filter({ has: page.getByText(name, { exact: true }) })
}

async function place(page: Page, name: string, x: number, y: number, modifier?: 'Alt') {
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
    modifier,
  )
}

async function clickSheet(page: Page, x: number, y: number): Promise<void> {
  const at = await onSheet(page, x, y)
  await page.mouse.click(at.x, at.y)
}

async function pointsOf(page: Page, name: string): Promise<string | null> {
  return roomNamed(page, name).locator('polygon').getAttribute('points')
}

test('a room dragged out of the tray is placed at its target size', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '0.0')
  await expect(page.getByText('20.6 of 20 m²')).toBeVisible()
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(0)
})

test('a placed room is dragged about the sheet, and undo puts it back', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  const before = await pointsOf(page, 'Kitchen')
  await drag(page, await onSheet(page, 5, 5.125), await onSheet(page, 12, 12))
  const after = await pointsOf(page, 'Kitchen')
  expect(after).not.toBe(before)
  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await pointsOf(page, 'Kitchen')).toBe(before)
})

test('a room is turned by its handle and by the quarter-turn button', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 8, 8.125)
  await clickSheet(page, 8, 8.125)
  await expect(page.locator('[data-rotate-handle]')).toBeVisible()
  await drag(page, await centreOf(page, '[data-rotate-handle]'), await onSheet(page, 14, 8.125))
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '90.0')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
  await page.getByRole('button', { name: 'Rotate 90°' }).click()
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '180.0')
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
})

test('a room is resized by a corner handle and the label follows', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 8, 8.125)
  await clickSheet(page, 8, 8.125)
  await drag(
    page,
    await centreOf(page, '[data-resize-handle="1,1"]'),
    await onSheet(page, 12.25, 12.25),
  )
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '42.00')
  await expect(page.getByText('42 of 20 m²')).toBeVisible()
})

test('a drop with Alt held carves the room under it', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Dining Room', 8, 8)
  await expect(roomNamed(page, 'Dining Room')).toHaveAttribute('data-area', '24.00')
  await place(page, 'Guest WC', 8, 5.75, 'Alt')
  await expect(page.locator('[data-room]')).toHaveCount(2)
  await expect(roomNamed(page, 'Dining Room')).toHaveAttribute('data-area', '23.00')
})

test('a drop on top of another room is refused and said out loud', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Dining Room', 8, 8)
  await place(page, 'Guest WC', 8, 8)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await expect(page.locator('.messages')).toContainText('Dining Room')
  await expect(page.locator('[data-tray]').filter({ hasText: /^Guest WC/ })).toHaveCount(1)
  await place(page, 'Guest WC', 8, 8)
  await place(page, 'Guest WC', 8, 8)
  await expect(page.locator('.messages li')).toHaveCount(1)
})

test('a pinned room refuses to be moved', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await clickSheet(page, 6, 6.125)
  await page.getByRole('button', { name: 'Pin' }).click()
  const before = await pointsOf(page, 'Kitchen')
  await drag(page, await onSheet(page, 6, 6.125), await onSheet(page, 14, 14))
  await expect(page.locator('.messages')).toContainText('Kitchen is pinned')
  expect(await pointsOf(page, 'Kitchen')).toBe(before)
})

test('a proposed door is accepted with a click and disconnected with Delete', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await expect(page.locator('[data-proposal]')).toHaveCount(1)
  await expect(page.locator('[data-edge]')).toHaveCount(0)
  await page.locator('[data-proposal]').click()
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await expect(page.locator('[data-proposal]')).toHaveCount(0)
  await clickSheet(page, 17, 1.5)
  await clickSheet(page, 7.75, 5.125)
  await expect(page.locator('.door-selected')).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-edge]')).toHaveCount(0)
  await expect(page.locator('[data-proposal]')).toHaveCount(1)
})

test('an edge whose rooms share no wall is drawn as a tension', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  await place(page, 'Dining Room', 10.75, 5)
  await page.locator('[data-proposal]').click()
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await drag(page, await onSheet(page, 10.75, 5), await onSheet(page, 15, 18))
  await expect(page.locator('[data-tension]')).toHaveCount(1)
  await expect(page.locator('[data-edge]')).toHaveCount(0)
})

test('a room is unplaced back to the tray', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await clickSheet(page, 6, 6.125)
  await page.getByRole('button', { name: 'Unplace' }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(1)
})

test('each storey is drawn on its own, with the one below as a ghost', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  const kitchen = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Kitchen"]')) })
  await kitchen.getByLabel('Storey').selectOption({ label: 'First' })
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(0)
  await place(page, 'Dining Room', 8, 8)
  await expect(page.locator('[data-room]')).toHaveCount(1)
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('.ghost')).toHaveCount(1)
  await expect(page.locator('[data-tray]').filter({ hasText: /^Kitchen/ })).toHaveCount(1)
})

test('a room picked in the bubbles is the room picked in the zoning', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 6, 6.125)
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.getByRole('button', { name: /Hold in place|Let go/ })).toBeEnabled()
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
})

/** The sheet's viewBox as it stands: four numbers in metres. */
async function viewBox(page: Page): Promise<string> {
  const shown = await page.locator('svg.zoning-sheet').getAttribute('viewBox')
  if (!shown) throw new Error('the sheet has no viewBox')
  return shown
}

function widthOf(shown: string): number {
  return Number(shown.split(' ')[2])
}

/** The metre under a point on the screen, read out of the viewBox as the sheet draws it. */
async function metreUnder(page: Page, at: At): Promise<At> {
  return page.evaluate(
    ([cx = 0, cy = 0]) => {
      const sheet = document.querySelector('svg.zoning-sheet')
      if (!(sheet instanceof SVGSVGElement)) throw new Error('there is no sheet')
      const [minX = 0, minY = 0, width = 1, height = 1] = (sheet.getAttribute('viewBox') ?? '')
        .split(' ')
        .map(Number)
      const box = sheet.getBoundingClientRect()
      const style = getComputedStyle(sheet)
      const edge = (side: string): number => parseFloat(style.getPropertyValue(side)) || 0
      // The drawing sits inside the sheet's border, and is centred there: one pixel covers the
      // same metres across as down, because the sheet meets its box whole.
      const across = box.width - edge('border-left-width') - edge('border-right-width')
      const down = box.height - edge('border-top-width') - edge('border-bottom-width')
      const middleX = box.x + edge('border-left-width') + across / 2
      const middleY = box.y + edge('border-top-width') + down / 2
      const perPixel = Math.max(width / across, height / down)
      return {
        x: minX + width / 2 + (cx - middleX) * perPixel,
        y: minY + height / 2 + (cy - middleY) * perPixel,
      }
    },
    [at.x, at.y],
  )
}

/** Wheels the sheet by a factor about a metre on it, and waits for the drawing to follow. */
async function zoomBy(page: Page, factor: number, x: number, y: number): Promise<void> {
  const before = await viewBox(page)
  const at = await onSheet(page, x, y)
  await page.mouse.move(at.x, at.y)
  await page.mouse.wheel(0, (-100 * Math.log(factor)) / Math.log(1.1))
  await expect(page.locator('svg.zoning-sheet')).not.toHaveAttribute('viewBox', before)
}

/** A fresh project in the same page, so a sequence can be run twice over from the same start. */
async function startOver(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.clear())
  await openZoning(page)
}

/** A room as the screen has it: how deep it stands in pixels, and how high the sheet is. */
async function roomOnScreen(page: Page, name: string): Promise<{ tall: number; sheet: number }> {
  return page.evaluate((wanted) => {
    const sheet = document.querySelector('svg.zoning-sheet')
    if (!(sheet instanceof SVGSVGElement)) throw new Error('there is no sheet')
    const group = [...document.querySelectorAll('[data-room]')].find(
      (room) => room.querySelector('.room-name')?.textContent === wanted,
    )
    const shape = group?.querySelector('polygon')
    if (!shape) throw new Error(`${wanted} is not on the sheet`)
    const style = getComputedStyle(sheet)
    const border = (side: string): number => parseFloat(style.getPropertyValue(side)) || 0
    return {
      tall: shape.getBBox().height * (sheet.getScreenCTM()?.a ?? 1),
      sheet:
        sheet.getBoundingClientRect().height -
        border('border-top-width') -
        border('border-bottom-width'),
    }
  }, name)
}

/** The two lines of a room's label, in pixels on the screen rather than metres on the sheet. */
async function labelPixels(page: Page, name: string): Promise<{ name: number; area: number }> {
  return page.evaluate((wanted) => {
    const sheet = document.querySelector('svg.zoning-sheet')
    if (!(sheet instanceof SVGSVGElement)) throw new Error('there is no sheet')
    const perMetre = sheet.getScreenCTM()?.a ?? 1
    const group = [...document.querySelectorAll('[data-room]')].find(
      (room) => room.querySelector('.room-name')?.textContent === wanted,
    )
    const line = (selector: string): number => {
      const text = group?.querySelector(selector)
      if (!text) throw new Error(`${wanted} has no ${selector}`)
      return parseFloat(getComputedStyle(text).fontSize) * perMetre
    }
    return { name: line('.room-name'), area: line('.room-area') }
  }, name)
}

test('the wheel draws the sheet closer and holds the metre under the pointer', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 5, 5.125)
  // Whole pixels, so the wheel lands on the metre the test reads and not half a pixel off it.
  const aimed = await onSheet(page, 7, 9)
  const pointer = { x: Math.round(aimed.x), y: Math.round(aimed.y) }
  await page.mouse.move(pointer.x, pointer.y)
  const before = await viewBox(page)
  const under = await metreUnder(page, pointer)
  await page.mouse.wheel(0, -300)
  await expect(page.locator('svg.zoning-sheet')).not.toHaveAttribute('viewBox', before)
  const after = await viewBox(page)
  expect(widthOf(after)).toBeLessThan(widthOf(before))
  const still = await metreUnder(page, pointer)
  expect(Math.abs(still.x - under.x)).toBeLessThan(0.01)
  expect(Math.abs(still.y - under.y)).toBeLessThan(0.01)
})

test('a drag on empty sheet pans, and the selection is untouched', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 10, 12.125)
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
  await zoomBy(page, 3, 10, 12.5)
  const before = await viewBox(page)
  const from = await onSheet(page, 12.5, 15.5)
  await drag(page, from, { x: from.x - 120, y: from.y - 60 })
  expect(await viewBox(page)).not.toBe(before)
  expect(widthOf(await viewBox(page))).toBeCloseTo(widthOf(before), 6)
  await expect(roomNamed(page, 'Kitchen')).toHaveClass(/room-selected/)
})

test('Fit and the 0 key put the whole plot back on the sheet', async ({ page }) => {
  await openZoning(page)
  const fitted = await viewBox(page)
  await zoomBy(page, 4, 6, 6)
  expect(await viewBox(page)).not.toBe(fitted)
  await page.getByRole('button', { name: 'Fit' }).click()
  expect(await viewBox(page)).toBe(fitted)
  await zoomBy(page, 4, 6, 6)
  await page.locator('svg.zoning-sheet').press('0')
  expect(await viewBox(page)).toBe(fitted)
})

test('the + and - keys draw the sheet closer and further off', async ({ page }) => {
  await openZoning(page)
  const fitted = await viewBox(page)
  await page.locator('svg.zoning-sheet').press('+')
  const closer = await viewBox(page)
  expect(widthOf(closer)).toBeLessThan(widthOf(fitted))
  await page.locator('svg.zoning-sheet').press('-')
  expect(widthOf(await viewBox(page))).toBeCloseTo(widthOf(fitted), 6)
})

/** Place, connect, move, turn and resize, with what the store holds at the end of it. */
async function everyGesture(page: Page): Promise<Record<string, unknown>> {
  await place(page, 'Kitchen', 8, 7.625)
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-area', '20.63')
  await place(page, 'Dining Room', 8, 11.5)
  await expect(page.locator('[data-proposal]')).toHaveCount(1)
  await page.locator('[data-proposal]').click()
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await drag(page, await onSheet(page, 8, 7.625), await onSheet(page, 5, 6.625))
  await drag(page, await centreOf(page, '[data-rotate-handle]'), await onSheet(page, 9, 6.625))
  await expect(roomNamed(page, 'Kitchen')).toHaveAttribute('data-rotation', '90.0')
  await drag(
    page,
    await centreOf(page, '[data-resize-handle="1,1"]'),
    await onSheet(page, 4.375, 8.875),
  )
  return {
    kitchen: await roomNamed(page, 'Kitchen').locator('polygon').getAttribute('points'),
    area: await roomNamed(page, 'Kitchen').getAttribute('data-area'),
    rotation: await roomNamed(page, 'Kitchen').getAttribute('data-rotation'),
    dining: await roomNamed(page, 'Dining Room').locator('polygon').getAttribute('points'),
    edges: await page.locator('[data-edge]').count(),
    tensions: await page.locator('[data-tension]').count(),
    proposals: await page.locator('[data-proposal]').count(),
  }
}

test('every gesture lands where it does at fit with the sheet drawn three times closer', async ({
  page,
}) => {
  await openZoning(page)
  const atFit = await everyGesture(page)
  expect(atFit.rotation).toBe('90.0')
  await startOver(page)
  await zoomBy(page, 3, 5, 5)
  expect(widthOf(await viewBox(page))).toBeCloseTo(25 / 3, 2)
  expect(await everyGesture(page)).toEqual(atFit)
})

test('a 6 m² ensuite is read close up and never shouts at fit', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Ensuite, Master Bedroom', 10, 12)
  await expect(roomNamed(page, 'Ensuite, Master Bedroom')).toHaveAttribute('data-area', '6.00')
  await expect(page.getByText('6 of 6 m²')).toBeVisible()
  const atFit = await labelPixels(page, 'Ensuite, Master Bedroom')
  expect(atFit.name).toBeLessThanOrEqual(14)
  expect(atFit.area).toBeLessThanOrEqual(14)

  const small = await roomOnScreen(page, 'Ensuite, Master Bedroom')
  await zoomBy(page, small.sheet / 3 / small.tall, 10, 12)
  const filled = await roomOnScreen(page, 'Ensuite, Master Bedroom')
  expect(filled.tall).toBeGreaterThan(filled.sheet / 3.1)

  const close = await labelPixels(page, 'Ensuite, Master Bedroom')
  expect(close.name).toBeGreaterThanOrEqual(12)
  expect(close.area).toBeGreaterThanOrEqual(12)
})

test('drawing the sheet closer does not draw the rooms again', async ({ page }) => {
  await openZoning(page)
  await place(page, 'Kitchen', 8, 8.125)
  await page.evaluate(() => {
    const sheet = document.querySelector('svg.zoning-sheet')
    if (!sheet) throw new Error('there is no sheet')
    const changes: string[] = []
    ;(window as unknown as { roomChanges: string[] }).roomChanges = changes
    const watch = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target
        const element = node instanceof Element ? node : node.parentElement
        if (element?.closest('[data-room]')) changes.push(record.type)
      }
    })
    watch.observe(sheet, { attributes: true, childList: true, subtree: true, characterData: true })
  })
  await zoomBy(page, 3, 8, 8)
  const changes = await page.evaluate(
    () => (window as unknown as { roomChanges: string[] }).roomChanges.length,
  )
  expect(changes).toBe(0)
})

test('a stair added to a two-storey program stands on both storeys at one place', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Kind to add').selectOption('stair')
  await page.getByRole('button', { name: 'Add room' }).click()
  // The storey comes after the stair, so the stair is stretched onto it rather than made with it.
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Zoning' }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()

  await place(page, 'Stair', 6, 6)
  const onGround = await pointsOf(page, 'Stair')
  expect(onGround).not.toBeNull()

  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(roomNamed(page, 'Stair')).toHaveCount(1)
  expect(await pointsOf(page, 'Stair')).toBe(onGround)
})
