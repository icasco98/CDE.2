import { expect, test, type Page } from '@playwright/test'

async function openBubbles(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
}

/** A mark can sit under a later proposal's thread, so the one clicked is one that is really on top. */
async function clickAProposal(page: Page) {
  for (const mark of await page.locator('[data-proposal] .proposal-mark').all()) {
    const box = await mark.boundingBox()
    if (!box) continue
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const onTop = await page.evaluate(
      ([x, y]) =>
        document.elementFromPoint(x as number, y as number)?.classList.contains('proposal-mark'),
      [at.x, at.y],
    )
    if (!onTop) continue
    await page.mouse.click(at.x, at.y)
    return true
  }
  return false
}

test('the program from the requirements screen appears as bubbles and settles', async ({
  page,
}) => {
  await openBubbles(page)
  const bubbles = page.locator('svg g[data-room]')
  expect(await bubbles.count()).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Settle' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible({ timeout: 15000 })
})

test('a proposed connection becomes an edge when it is clicked', async ({ page }) => {
  await openBubbles(page)
  const proposals = page.locator('[data-proposal]')
  const drawn = await proposals.count()
  expect(drawn).toBeGreaterThan(0)
  const edges = await page.locator('[data-edge]').count()

  expect(await clickAProposal(page)).toBe(true)
  await expect(page.locator('[data-edge]')).toHaveCount(edges + 1)
  await expect(proposals).toHaveCount(drawn - 1)
})

test('accepting every proposal is one step, and one undo brings them all back', async ({
  page,
}) => {
  await openBubbles(page)
  const accept = page.getByRole('button', { name: 'Accept all proposals' })
  const outside = page.locator('.proposals li')
  await expect(accept).toBeVisible()
  const drawn = await page.locator('[data-proposal]').count()
  const spoken = await outside.count()
  expect(spoken).toBeGreaterThan(0)

  await accept.click()
  await expect(page.locator('[data-proposal]')).toHaveCount(0)
  await expect(outside).toHaveCount(0)
  await expect(accept).toBeHidden()

  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-proposal]')).toHaveCount(drawn)
  await expect(outside).toHaveCount(spoken)
})

test('a proposed connection says which rule asked for it', async ({ page }) => {
  await openBubbles(page)
  const reason = page.locator('[data-proposal] title').first()
  await expect(reason).not.toBeEmpty()
  await expect(page.locator('.proposals li').first()).toContainText(':')
})

/** The same program on two storeys, so a bubble has another band to be dropped in. */
async function openTwoStoreys(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('.band-label')).toHaveText(['Ground', 'First'])
}

/** Each storey's band as it is drawn, in metres down the sheet, storey 0 first. */
async function bandsOf(page: Page): Promise<{ top: number; height: number }[]> {
  return page.$$eval('svg.bubbles-sheet rect.band', (rects) =>
    rects.map((rect) => ({
      top: Number(rect.getAttribute('y')),
      height: Number(rect.getAttribute('height')),
    })),
  )
}

/** Where a point in sheet metres lands on the screen. */
async function onSheet(page: Page, x: number, y: number) {
  return page.evaluate(
    ([mx, my]) => {
      const sheet = document.querySelector('svg.bubbles-sheet')
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

/**
 * A bubble, with a point on it that the pointer really reaches: the bubbles pile up before they
 * are settled, and a proposal's thread draws over them, so the centre is not always the bubble's.
 */
async function bubbleAt(page: Page, name: string) {
  const circle = roomNamed(page, name).locator('[data-bubble]')
  const id = await circle.getAttribute('data-bubble')
  const box = await circle.boundingBox()
  const [x, y] = await Promise.all([circle.getAttribute('cx'), circle.getAttribute('cy')])
  if (!id || !box) throw new Error(`${name} is not on the sheet`)
  const screen = await page.evaluate(
    ([shape, wanted]: [{ x: number; y: number; width: number; height: number }, string]) => {
      for (const down of [0, -0.3, 0.3, -0.5, 0.5])
        for (const across of [0, -0.3, 0.3, -0.5, 0.5]) {
          const at = {
            x: shape.x + (shape.width / 2) * (1 + across),
            y: shape.y + (shape.height / 2) * (1 + down),
          }
          if (document.elementFromPoint(at.x, at.y)?.getAttribute('data-bubble') === wanted)
            return at
        }
      return null
    },
    [box, id] as [{ x: number; y: number; width: number; height: number }, string],
  )
  if (!screen) throw new Error(`${name} is covered wherever it is aimed at`)
  return { sheet: { x: Number(x), y: Number(y) }, screen }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

/** Settles the picture, so the bubbles are spread out rather than piled on one another. */
async function settle(page: Page) {
  await page.getByRole('button', { name: 'Settle' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible({ timeout: 30000 })
}

/** A click that lands on the bubble itself, wherever on it that happens to be. */
async function clickBubble(page: Page, name: string) {
  const at = (await bubbleAt(page, name)).screen
  await page.mouse.click(at.x, at.y)
}

/** Joins two rooms by name through link mode, and leaves the mode again. */
async function link(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await clickBubble(page, from)
  await clickBubble(page, to)
  await page.locator('svg.bubbles-sheet').press('Escape')
}

/** The storey the program table gives a room, by the name in its row. */
async function storeyOf(page: Page, name: string): Promise<string> {
  return page.locator('table.program tbody tr').evaluateAll((rows, wanted) => {
    for (const row of rows) {
      const named = row.querySelector('input[aria-label="Room name"]')
      const storey = row.querySelector('select[aria-label="Storey"]')
      if (!(named instanceof HTMLInputElement) || !(storey instanceof HTMLSelectElement)) continue
      if (named.value === wanted) return storey.options[storey.selectedIndex]?.text ?? ''
    }
    return ''
  }, name)
}

test('a bubble dropped in the First band puts the room upstairs in the program', async ({
  page,
}) => {
  await openTwoStoreys(page)
  const bands = await bandsOf(page)
  const first = bands[1]
  if (!first) throw new Error('there is no First storey')
  const kitchen = await bubbleAt(page, 'Kitchen')
  const to = await onSheet(page, kitchen.sheet.x, first.top + first.height / 2)
  await drag(page, kitchen.screen, to)
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Kitchen')).toBe('First')
})

test('a bubble let go at the very edge of the First band stays on the Ground', async ({ page }) => {
  await openTwoStoreys(page)
  const bands = await bandsOf(page)
  const ground = bands[0]
  const first = bands[1]
  if (!ground || !first) throw new Error('there are no bands')
  const kitchen = await bubbleAt(page, 'Kitchen')
  const to = await onSheet(page, kitchen.sheet.x, first.top + first.height * 0.96)
  await drag(page, kitchen.screen, to)
  expect((await bubbleAt(page, 'Kitchen')).sheet.y).toBeGreaterThan(ground.top)
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Kitchen')).toBe('Ground')
})

test('a linked room says why it cannot go upstairs', async ({ page }) => {
  await openTwoStoreys(page)
  await settle(page)
  await link(page, 'Kitchen', 'Dining Room')
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  const bands = await bandsOf(page)
  const first = bands[1]
  if (!first) throw new Error('there is no First storey')
  const kitchen = await bubbleAt(page, 'Kitchen')
  const to = await onSheet(page, kitchen.sheet.x, first.top + first.height / 2)
  await drag(page, kitchen.screen, to)
  await expect(page.locator('.messages')).toContainText('Unlink it to move it')
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Kitchen')).toBe('Ground')
})

test('Delete takes a room and its links, and one undo brings both back', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  await link(page, 'Kitchen', 'Dining Room')
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  const rooms = await page.locator('svg g[data-room]').count()
  await clickBubble(page, 'Kitchen')
  await expect(page.getByRole('button', { name: 'Delete room' })).toBeEnabled()
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('svg g[data-room]')).toHaveCount(rooms - 1)
  await expect(page.locator('[data-edge]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
  await page.keyboard.press('Control+z')
  await expect(page.locator('svg g[data-room]')).toHaveCount(rooms)
  await expect(page.locator('[data-edge]')).toHaveCount(1)
})
