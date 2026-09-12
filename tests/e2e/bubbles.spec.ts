import { expect, test, type Locator, type Page } from '@playwright/test'

const page_ = '/playground/bubbles.html'

/** The forces run while the tab is open, so nothing on the sheet is measured until it stops. */
async function resting(page: Page) {
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
}

/** The sample's twelve rooms, one of them a stair drawn on both the storeys it spans. */
const TWINS = 13

async function open(page: Page) {
  await page.goto(page_)
  await expect(page.locator('[data-bubble]')).toHaveCount(TWINS)
  await resting(page)
}

async function settle(page: Page) {
  await page.getByRole('button', { name: 'Settle now' }).click()
  await resting(page)
}

function positions(page: Page) {
  return page.$$eval('[data-bubble]', (circles) =>
    circles.map(
      (circle) =>
        `${circle.getAttribute('data-bubble')} ${circle.getAttribute('data-x')} ${circle.getAttribute('data-y')}`,
    ),
  )
}

/** A room by its name, which the bubble carries: a small one draws its initials, not its name. */
function roomNamed(page: Page, name: string) {
  return page.locator(`[data-room][data-name="${name}"]`)
}

async function centre(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to aim at')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

test('draws every room as a circle on the plot, inside the buildable line', async ({ page }) => {
  await open(page)
  await expect(page.locator('svg.bubbles-sheet .plot')).toHaveCount(1)
  await expect(page.locator('svg.bubbles-sheet [data-buildable]')).toHaveCount(1)
  await expect(page.locator('svg.bubbles-sheet .north')).toHaveCount(1)
  await expect(page.locator('svg.bubbles-sheet .scale-bar')).toHaveCount(1)
  await expect(roomNamed(page, 'Diwaniya').locator('.bubble-name')).toHaveText('Diwaniya')
  await expect(roomNamed(page, 'Diwaniya').locator('.bubble-area')).toHaveText('55 m²')
})

test('draws the front door as a link to the street with a mark at the outside end', async ({
  page,
}) => {
  await open(page)
  const door = page.locator('[data-kind="main-door"]')
  await expect(door).toHaveCount(1)
  await expect(door.locator('.main-door-mark')).toHaveCount(1)
})

test('settles to the same picture from two fresh loads', async ({ page }) => {
  await open(page)
  await settle(page)
  const first = await positions(page)
  await open(page)
  await settle(page)
  expect(await positions(page)).toEqual(first)
  expect(first.length).toBe(TWINS)
})

/** Where a bubble stands on the sheet, in metres, so a camera that moves does not read as a drag. */
async function placeOf(page: Page, id: string) {
  const circle = page.locator(`[data-bubble="${id}"]`)
  const [x, y] = await Promise.all([circle.getAttribute('data-x'), circle.getAttribute('data-y')])
  return { x: Number(x), y: Number(y) }
}

test('a dragged bubble follows the hand, and stays where the hand drops it', async ({ page }) => {
  await open(page)
  await settle(page)
  const bubble = page.locator('[data-bubble]').first()
  const id = await bubble.getAttribute('data-bubble')
  if (!id) throw new Error('no bubble to drag')
  const before = await placeOf(page, id)
  const from = await centre(bubble)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + from.x + 120) / 2, from.y - 30)
  await page.mouse.move(from.x + 120, from.y - 60)
  const held = await placeOf(page, id)
  expect(Math.hypot(held.x - before.x, held.y - before.y)).toBeGreaterThan(2)
  await page.mouse.up()
  await resting(page)
  // Where it is dropped it stays: the drop holds it, the pin mark says so, and Let go is the
  // button that hands it back to the forces.
  await expect(page.locator(`[data-room="${id}"] .pin-mark`)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Let go' })).toBeEnabled()
  const dropped = await placeOf(page, id)
  expect(Math.hypot(dropped.x - held.x, dropped.y - held.y)).toBeLessThan(0.5)
})

test('dragging from one bubble to another connects them', async ({ page }) => {
  await open(page)
  await settle(page)
  const links = await page.locator('[data-edge]').count()
  const from = await centre(roomNamed(page, 'Formal Living').locator('.reach'))
  const to = await centre(roomNamed(page, 'Diwaniya').locator('[data-bubble]'))
  await drag(page, from, to)
  await expect(page.locator('[data-edge]')).toHaveCount(links + 1)
})

test('a selected link is removed by pressing Delete', async ({ page }) => {
  await open(page)
  await settle(page)
  const links = await page.locator('[data-edge]').count()
  const grips = await page.locator('.link-grip').all()
  let clicked = false
  for (const grip of grips) {
    const at = await centre(grip)
    const onTop = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x as number, y as number)?.classList.contains('link-grip'),
      [at.x, at.y],
    )
    if (!onTop) continue
    await page.mouse.click(at.x, at.y)
    clicked = true
    break
  }
  expect(clicked).toBe(true)
  await expect(page.locator('.link-selected')).toHaveCount(1)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-edge]')).toHaveCount(links - 1)
})

/** The sheet's viewBox as it stands: four numbers in metres. */
async function viewBox(page: Page): Promise<string> {
  const shown = await page.locator('svg.bubbles-sheet').getAttribute('viewBox')
  if (!shown) throw new Error('the sheet has no viewBox')
  return shown
}

function widthOf(shown: string): number {
  return Number(shown.split(' ')[2])
}

/** The metre under a point on the screen, read out of the viewBox as the sheet draws it. */
async function metreUnder(page: Page, at: { x: number; y: number }) {
  return page.evaluate(
    ([cx = 0, cy = 0]) => {
      const sheet = document.querySelector('svg.bubbles-sheet')
      if (!(sheet instanceof SVGSVGElement)) throw new Error('there is no sheet')
      const [minX = 0, minY = 0, width = 1, height = 1] = (sheet.getAttribute('viewBox') ?? '')
        .split(' ')
        .map(Number)
      const box = sheet.getBoundingClientRect()
      const style = getComputedStyle(sheet)
      const edge = (side: string): number => parseFloat(style.getPropertyValue(side)) || 0
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

/** A point on the sheet with nothing but the plot under it, so a press there is a pan. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  const found = await page.evaluate(() => {
    const sheet = document.querySelector('svg.bubbles-sheet')
    if (!sheet) throw new Error('there is no sheet')
    const box = sheet.getBoundingClientRect()
    for (let down = 0.12; down < 0.95; down += 0.08) {
      for (let across = 0.04; across < 0.96; across += 0.04) {
        const x = Math.round(box.x + box.width * across)
        const y = Math.round(box.y + box.height * down)
        const on = document.elementFromPoint(x, y)
        if (on === sheet || on?.classList.contains('plot')) return { x, y }
      }
    }
    return null
  })
  if (!found) throw new Error('the sheet is covered from edge to edge')
  return found
}

/** Selects a link by clicking the one grip that is really on top, and says which edge it is. */
async function selectALink(page: Page): Promise<string> {
  for (const grip of await page.locator('.link-grip').all()) {
    const at = await centre(grip)
    const onTop = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x as number, y as number)?.classList.contains('link-grip'),
      [at.x, at.y],
    )
    if (!onTop) continue
    await page.mouse.click(at.x, at.y)
    const id = await page.locator('.link-selected').locator('xpath=..').getAttribute('data-edge')
    if (!id) throw new Error('no link was selected')
    return id
  }
  throw new Error('no link could be clicked')
}

test('the wheel draws the sheet closer and holds the metre under the pointer', async ({ page }) => {
  await open(page)
  const aimed = await centre(page.locator('[data-bubble]').first())
  const pointer = { x: Math.round(aimed.x), y: Math.round(aimed.y) }
  await page.mouse.move(pointer.x, pointer.y)
  const before = await viewBox(page)
  const under = await metreUnder(page, pointer)
  await page.mouse.wheel(0, -300)
  await expect(page.locator('svg.bubbles-sheet')).not.toHaveAttribute('viewBox', before)
  const after = await viewBox(page)
  expect(widthOf(after)).toBeLessThan(widthOf(before))
  const still = await metreUnder(page, pointer)
  expect(Math.abs(still.x - under.x)).toBeLessThan(0.01)
  expect(Math.abs(still.y - under.y)).toBeLessThan(0.01)
})

test('a drag on empty sheet pans, and Fit puts the whole diagram back', async ({ page }) => {
  await open(page)
  const fitted = await viewBox(page)
  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, -300)
  await expect(page.locator('svg.bubbles-sheet')).not.toHaveAttribute('viewBox', fitted)
  const closer = await viewBox(page)
  const empty = await emptySpot(page)
  await drag(page, empty, { x: empty.x - 90, y: empty.y - 40 })
  const panned = await viewBox(page)
  expect(panned).not.toBe(closer)
  expect(widthOf(panned)).toBeCloseTo(widthOf(closer), 6)
  await page.getByRole('button', { name: 'Fit' }).click()
  expect(await viewBox(page)).toBe(fitted)
  await page.locator('svg.bubbles-sheet').press('+')
  expect(widthOf(await viewBox(page))).toBeLessThan(widthOf(fitted))
  await page.locator('svg.bubbles-sheet').press('0')
  expect(await viewBox(page)).toBe(fitted)
})

test('link mode joins two rooms by two clicks', async ({ page }) => {
  await open(page)
  await settle(page)
  const links = await page.locator('[data-edge]').count()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await expect(page.locator('.bubbles-hint')).toContainText('Click one room')
  const kitchen = await centre(roomNamed(page, 'Kitchen').locator('[data-bubble]'))
  await page.mouse.click(kitchen.x, kitchen.y)
  await expect(page.locator('.bubbles-hint')).toContainText('Kitchen')
  const other = await centre(roomNamed(page, 'Formal Living').locator('[data-bubble]'))
  await page.mouse.click(other.x, other.y)
  await expect(page.locator('[data-edge]')).toHaveCount(links + 1)
  await page.locator('svg.bubbles-sheet').press('Escape')
  await expect(page.locator('.bubbles-hint')).toContainText('Every storey at once')
})

test('a selected link says its kind and is turned from a door into an opening', async ({
  page,
}) => {
  await open(page)
  await settle(page)
  const edge = await selectALink(page)
  await expect(page.locator(`[data-edge="${edge}"]`)).toHaveAttribute('data-kind', 'door')
  await expect(page.locator('.bubbles-kind')).toContainText('Link: door')
  await page.getByRole('button', { name: 'Make it open' }).click()
  await expect(page.locator(`[data-edge="${edge}"]`)).toHaveAttribute('data-kind', 'open')
  await expect(page.getByRole('button', { name: 'Make it a door' })).toBeEnabled()
})

test('a selected room goes on Delete, and its links go with it', async ({ page }) => {
  await open(page)
  await settle(page)
  const bubble = roomNamed(page, 'Dining').locator('[data-bubble]')
  const id = await bubble.getAttribute('data-bubble')
  const links = await page.locator('[data-edge]').count()
  const at = await centre(bubble)
  await page.mouse.click(at.x, at.y)
  await expect(page.getByRole('button', { name: 'Delete room' })).toBeEnabled()
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator(`[data-room="${id}"]`)).toHaveCount(0)
  // The sample joins the dining room to the family living room and to the kitchen.
  await expect(page.locator('[data-edge]')).toHaveCount(links - 2)
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
})

test('the storey group draws one storey on the plot, and All greys the one above', async ({
  page,
}) => {
  await open(page)
  await settle(page)
  await page
    .getByRole('group', { name: 'Storey shown' })
    .getByRole('button', { name: 'First' })
    .click()
  await expect(roomNamed(page, 'Kitchen')).toHaveCount(0)
  await expect(roomNamed(page, 'Master Bedroom')).not.toHaveClass(/bubble-dimmed/)
  await page
    .getByRole('group', { name: 'Storey shown' })
    .getByRole('button', { name: 'All' })
    .click()
  await expect(roomNamed(page, 'Kitchen')).not.toHaveClass(/bubble-dimmed/)
  // Every storey at once: the ground is the floor the hand works on and the one above is faint.
  await expect(roomNamed(page, 'Master Bedroom')).toHaveClass(/bubble-dimmed/)
  await expect(page.locator('.link-dimmed').first()).toBeVisible()
})

test('the legend stands beside the sheet and names every mark on it', async ({ page }) => {
  await open(page)
  await expect(page.locator('.legend-label')).toHaveText([
    'Reception',
    'Shared',
    'Private',
    'Service',
    'Open',
    'Held in place',
    'Door',
    'Open',
    'Front door',
    'Buildable line',
  ])
  // Beside the drawing, never over it: the legend is not in the sheet at all.
  await expect(page.locator('svg.bubbles-sheet .legend')).toHaveCount(0)
})
