import { expect, test, type Locator, type Page } from '@playwright/test'

/** The forces run while the tab is open, so nothing on the sheet is measured until it stops. */
async function resting(page: Page) {
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
}

async function openBubbles(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
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
  await page.getByRole('button', { name: 'Settle now' }).click()
  await expect(page.getByText('Resting', { exact: true })).toBeVisible({ timeout: 15000 })
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
  await resting(page)
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

/** The metre a point on the screen is over. */
async function sheetPointOf(page: Page, at: { x: number; y: number }) {
  return page.evaluate(
    ([cx, cy]) => {
      const sheet = document.querySelector('svg.bubbles-sheet')
      const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
      if (!screen) throw new Error('there is no sheet')
      const point = new DOMPoint(cx, cy).matrixTransform(screen.inverse())
      return { x: point.x, y: point.y }
    },
    [at.x, at.y],
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
async function aimAt(page: Page, circle: Locator, what: string) {
  const id = await circle.getAttribute('data-bubble')
  const box = await circle.boundingBox()
  const [x, y] = await Promise.all([circle.getAttribute('cx'), circle.getAttribute('cy')])
  if (!id || !box) throw new Error(`${what} is not on the sheet`)
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
  if (!screen) throw new Error(`${what} is covered wherever it is aimed at`)
  const held = await sheetPointOf(page, screen)
  const sheet = { x: Number(x), y: Number(y) }
  // The hand holds the bubble where it took hold of it, so a drop is aimed by that offset, not by its centre.
  return { sheet, screen, grabbed: { x: sheet.x - held.x, y: sheet.y - held.y } }
}

async function bubbleAt(page: Page, name: string) {
  return aimAt(page, roomNamed(page, name).locator('[data-bubble]'), name)
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

/** Settles the picture at once, so the bubbles stand still while a gesture is aimed at one. */
async function settle(page: Page) {
  await page.getByRole('button', { name: 'Settle now' }).click()
  await resting(page)
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
  // A new link is a new pull, so the cloud answers it before anything is aimed at a bubble again.
  await resting(page)
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
  const to = await onSheet(page, kitchen.sheet.x, first.top + first.height / 2 - kitchen.grabbed.y)
  await drag(page, kitchen.screen, to)
  await resting(page)
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
  const to = await onSheet(
    page,
    kitchen.sheet.x,
    first.top + first.height * 0.96 - kitchen.grabbed.y,
  )
  await drag(page, kitchen.screen, to)
  await resting(page)
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
  const to = await onSheet(page, kitchen.sheet.x, first.top + first.height / 2 - kitchen.grabbed.y)
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

/** Every bubble as it is drawn on the screen: its middle and its radius, in pixels. */
async function circlesOn(page: Page) {
  return page.$$eval('[data-bubble]', (circles) =>
    circles.map((circle) => {
      const box = circle.getBoundingClientRect()
      return {
        id: circle.getAttribute('data-bubble') ?? '',
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        r: box.width / 2,
      }
    }),
  )
}

/** The worst two circles overlap by, in pixels; nought or less is a sheet nothing rests on. */
async function worstOverlap(page: Page): Promise<number> {
  const circles = await circlesOn(page)
  let worst = -Infinity
  for (const [index, a] of circles.entries())
    for (const b of circles.slice(index + 1))
      worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y))
  return worst
}

/** Where a bubble stands on the sheet, in metres, by the name of its room. */
async function sheetPlaceOf(page: Page, name: string) {
  const circle = roomNamed(page, name).locator('[data-bubble]')
  const [x, y] = await Promise.all([circle.getAttribute('cx'), circle.getAttribute('cy')])
  return { x: Number(x), y: Number(y) }
}

async function apart(page: Page, one: string, other: string): Promise<number> {
  const a = await sheetPlaceOf(page, one)
  const b = await sheetPlaceOf(page, other)
  return Math.hypot(a.x - b.x, a.y - b.y)
}

test('a bubble dragged through the cloud parts it while the hand is still down', async ({
  page,
}) => {
  await openBubbles(page)
  const kitchen = await bubbleAt(page, 'Kitchen')
  const circles = await circlesOn(page)
  const held = circles.find(
    (circle) => Math.hypot(circle.x - kitchen.screen.x, circle.y - kitchen.screen.y) < circle.r,
  )
  const nearest = circles
    .filter((circle) => circle.id !== held?.id)
    .sort(
      (a, b) =>
        Math.hypot(a.x - kitchen.screen.x, a.y - kitchen.screen.y) -
        Math.hypot(b.x - kitchen.screen.x, b.y - kitchen.screen.y),
    )[0]
  if (!nearest) throw new Error('the kitchen has no neighbour')
  const neighbour = page.locator(`[data-bubble="${nearest.id}"]`)
  const before = await neighbour.getAttribute('cx')

  await page.mouse.move(kitchen.screen.x, kitchen.screen.y)
  await page.mouse.down()
  await page.mouse.move(nearest.x, nearest.y, { steps: 8 })
  // Still holding: the neighbour has to have answered the forces by now.
  await expect(neighbour).not.toHaveAttribute('cx', before ?? '')
  await page.mouse.up()
})

test('a bubble dropped on another slides clear, and nothing rests on anything', async ({
  page,
}) => {
  await openBubbles(page)
  const diwaniya = await bubbleAt(page, 'Diwaniya')
  const kitchen = await bubbleAt(page, 'Kitchen')
  await drag(page, kitchen.screen, diwaniya.screen)
  await expect.poll(() => worstOverlap(page), { timeout: 1500 }).toBeLessThanOrEqual(1)
})

/**
 * How far the bubbles stand from the middle of the cloud, in metres on the sheet. Pixels will not
 * do: the sheet frames whatever is drawn, so a cloud that opens out is drawn no larger.
 */
async function reachOf(page: Page): Promise<number> {
  return page.$$eval('[data-bubble]', (circles) => {
    const at = circles.map((circle) => ({
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
    }))
    const middle = at.reduce(
      (total, one) => ({ x: total.x + one.x / at.length, y: total.y + one.y / at.length }),
      { x: 0, y: 0 },
    )
    return (
      at.reduce((total, one) => total + Math.hypot(one.x - middle.x, one.y - middle.y), 0) /
      at.length
    )
  })
}

test('Spread opens a tight cloud out and lets it settle again', async ({ page }) => {
  await openBubbles(page)
  const tight = await reachOf(page)
  await page.getByRole('button', { name: 'Spread' }).click()
  await expect.poll(() => reachOf(page), { timeout: 4000 }).toBeGreaterThan(tight * 1.5)
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
})

test('the weights stand beside the diagram, the last two marked as acting in zoning', async ({
  page,
}) => {
  await openBubbles(page)
  await expect(page.getByRole('slider', { name: 'User requirements' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Site constraints' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Environmental factors' })).toBeVisible()
  await expect(page.getByText('acts in zoning')).toHaveCount(2)
})

test('raising the user requirements weight parts the Diwaniya from the Master Bedroom', async ({
  page,
}) => {
  await openBubbles(page)
  const weight = page.getByRole('slider', { name: 'User requirements' })
  await weight.fill('0')
  await settle(page)
  // Put the two side by side first: the weight is read on the air between them, not on wherever
  // in the cloud each of them happened to settle.
  const diwaniya = await bubbleAt(page, 'Diwaniya')
  const master = await bubbleAt(page, 'Master Bedroom')
  await drag(page, master.screen, diwaniya.screen)
  await settle(page)
  const low = await apart(page, 'Diwaniya', 'Master Bedroom')

  await weight.fill('1')
  await settle(page)
  expect(await apart(page, 'Diwaniya', 'Master Bedroom')).toBeGreaterThan(low + 2)
})

test('a weight moved on the Bubbles tab is still there after a reload', async ({ page }) => {
  await openBubbles(page)
  const site = page.getByRole('slider', { name: 'Site constraints' })
  const before = await site.inputValue()
  await site.focus()
  await site.press('ArrowRight')
  await site.press('ArrowRight')
  const moved = await site.inputValue()
  expect(moved).not.toBe(before)

  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = window.localStorage.getItem('cde.project')
        return saved ? JSON.parse(saved).weights?.siteConstraints : undefined
      }),
    )
    .toBe(Number(moved))

  await page.reload()
  await expect(page.getByRole('slider', { name: 'Site constraints' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.getByRole('slider', { name: 'Site constraints' })).toHaveValue(moved)
})

/** The room's own pinned flag as the store saved it, which is what Hold in place sets. */
async function pinnedInStore(page: Page, name: string) {
  return page.evaluate((wanted) => {
    const saved = window.localStorage.getItem('cde.project')
    if (!saved) return undefined
    const rooms = JSON.parse(saved).rooms as { name: string; pinned: boolean }[] | undefined
    return rooms?.find((room) => room.name === wanted)?.pinned
  }, name)
}

test('a drag holds a bubble only while the hand is on it, and Hold in place lasts', async ({
  page,
}) => {
  await openBubbles(page)
  const drop = await bubbleAt(page, 'Formal Living')
  const kitchen = await bubbleAt(page, 'Kitchen')
  await drag(page, kitchen.screen, { x: drop.screen.x, y: drop.screen.y - 40 })
  await resting(page)
  await expect(page.getByRole('button', { name: 'Hold in place' })).toBeEnabled()
  await expect(roomNamed(page, 'Kitchen').locator('.pin-mark')).toHaveCount(0)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(false)

  await page.getByRole('button', { name: 'Hold in place' }).click()
  await expect(roomNamed(page, 'Kitchen').locator('.pin-mark')).toHaveCount(1)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(true)

  const again = await bubbleAt(page, 'Kitchen')
  await drag(page, again.screen, { x: again.screen.x + 60, y: again.screen.y })
  await resting(page)
  await expect(roomNamed(page, 'Kitchen').locator('.pin-mark')).toHaveCount(1)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(true)
})

/** Every bubble's place on the sheet, in metres, by the id it is drawn under. */
async function placesOn(page: Page) {
  return page.$$eval('[data-bubble]', (circles) =>
    circles
      .map(
        (circle) =>
          `${circle.getAttribute('data-bubble')} ${circle.getAttribute('cx')} ${circle.getAttribute('cy')}`,
      )
      .sort(),
  )
}

test('a diagram left at rest opens at rest, and no bubble moves on arrival', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  const before = await placesOn(page)

  await page.getByRole('button', { name: 'Requirements' }).click()
  await expect(page.locator('svg.bubbles-sheet')).toHaveCount(0)
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()

  // Not "settles again quickly": at rest the moment it is drawn, and not a bubble out of place.
  expect(await page.locator('.bubbles-status').textContent()).toBe('Resting')
  expect(await placesOn(page)).toEqual(before)
})

/** A villa of this many storeys rebuilt from the household, so the program has a stair through it. */
async function openWithStair(page: Page, storeys: number) {
  await page.goto('/')
  for (let more = 1; more < storeys; more++)
    await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
}

/** The id a room is drawn under, taken from any twin of it. */
async function roomIdOf(page: Page, name: string): Promise<string> {
  const id = await roomNamed(page, name).first().getAttribute('data-room')
  if (!id) throw new Error(`${name} is not on the sheet`)
  return id
}

function twin(page: Page, id: string, storey: number) {
  return page.locator(`[data-room="${id}"][data-twin="${storey}"]`)
}

/** Where one twin stands on the sheet, in metres. */
async function twinPlace(page: Page, id: string, storey: number) {
  const circle = twin(page, id, storey).locator('[data-bubble]')
  const [x, y] = await Promise.all([circle.getAttribute('cx'), circle.getAttribute('cy')])
  return { x: Number(x), y: Number(y) }
}

async function twinAt(page: Page, id: string, storey: number) {
  return aimAt(page, twin(page, id, storey).locator('[data-bubble]'), `twin ${storey} of ${id}`)
}

/** Joins a room to one twin of another through link mode, and leaves the mode again. */
async function linkToTwin(page: Page, from: string, id: string, storey: number) {
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await clickBubble(page, from)
  const at = (await twinAt(page, id, storey)).screen
  await page.mouse.click(at.x, at.y)
  await page.locator('svg.bubbles-sheet').press('Escape')
  await resting(page)
}

/** The two ends of a stair's span as the program row asks for them. */
async function setSpan(page: Page, name: string, from: string, to: string) {
  await page.getByRole('button', { name: 'Requirements' }).click()
  const row = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator(`[value="${name}"]`)) })
  await row.getByLabel('From').selectOption({ label: from })
  await row.getByLabel('To').selectOption({ label: to })
  await page.getByRole('button', { name: 'Bubbles' }).click()
  await resting(page)
}

test('a stair is drawn on every floor it serves, its twins one above the other', async ({
  page,
}) => {
  await openWithStair(page, 2)
  const stair = await roomIdOf(page, 'Stair')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)
  await expect(twin(page, stair, 0).locator('.bubble-span').first()).toHaveText('Ground to First')

  const bands = await bandsOf(page)
  const [ground, first] = bands
  if (!ground || !first) throw new Error('there are no bands')
  const below = await twinPlace(page, stair, 0)
  const above = await twinPlace(page, stair, 1)
  expect(above.x).toBeCloseTo(below.x, 6)
  expect(above.y).toBeCloseTo(below.y - ground.height, 6)
  expect(below.y).toBeGreaterThan(ground.top)
  expect(below.y).toBeLessThan(ground.top + ground.height)
  expect(above.y).toBeGreaterThan(first.top)
  expect(above.y).toBeLessThan(first.top + first.height)
})

test('dragging one twin of a stair carries the other in the same frame', async ({ page }) => {
  await openWithStair(page, 2)
  const stair = await roomIdOf(page, 'Stair')
  const bands = await bandsOf(page)
  const ground = bands[0]
  if (!ground) throw new Error('there is no Ground band')
  const before = await twinPlace(page, stair, 1)
  const held = await twinAt(page, stair, 0)

  await page.mouse.move(held.screen.x, held.screen.y)
  await page.mouse.down()
  await page.mouse.move(held.screen.x + 90, held.screen.y, { steps: 6 })
  // Still holding: the twin upstairs has to have come along with the hand by now.
  const below = await twinPlace(page, stair, 0)
  const above = await twinPlace(page, stair, 1)
  expect(Math.abs(above.x - before.x)).toBeGreaterThan(2)
  expect(above.x).toBeCloseTo(below.x, 6)
  expect(above.y).toBeCloseTo(below.y - ground.height, 6)
  await page.mouse.up()
})

test('a link drawn to a twin is an edge on that twin’s own floor', async ({ page }) => {
  await openWithStair(page, 2)
  const stair = await roomIdOf(page, 'Stair')
  await settle(page)

  await linkToTwin(page, 'Entry', stair, 0)
  await expect(page.locator('[data-edge]')).toHaveCount(1)
  await expect(page.locator('[data-edge]').first()).toHaveAttribute('data-storey', '0')

  await linkToTwin(page, 'Bedroom 1', stair, 1)
  await expect(page.locator('[data-edge]')).toHaveCount(2)
  await expect(page.locator('[data-edge]').nth(1)).toHaveAttribute('data-storey', '1')
})

test('the storey filter shows the twin of that floor and dims the rest', async ({ page }) => {
  await openWithStair(page, 2)
  const stair = await roomIdOf(page, 'Stair')
  await page
    .getByRole('group', { name: 'Storey shown' })
    .getByRole('button', { name: 'First' })
    .click()
  await expect(twin(page, stair, 1)).not.toHaveClass(/bubble-dimmed/)
  await expect(twin(page, stair, 0)).toHaveClass(/bubble-dimmed/)
})

test('a twin dropped in a band the stair does not stand on is refused, and comes back', async ({
  page,
}) => {
  await openWithStair(page, 2)
  await settle(page)
  const stair = await roomIdOf(page, 'Stair')
  const bands = await bandsOf(page)
  const ground = bands[0]
  if (!ground) throw new Error('there is no Ground band')
  const above = await twinAt(page, stair, 1)
  // Straight down by one band, which carries the twin on First into the Ground band and the room's
  // own place below the sheet: the whole stair would have to change floors for that to be taken.
  const top = await onSheet(page, above.sheet.x, ground.top)
  const bottom = await onSheet(page, above.sheet.x, ground.top + ground.height)
  await drag(page, above.screen, {
    x: above.screen.x,
    y: above.screen.y + (bottom.y - top.y),
  })
  await expect(page.locator('.messages')).toContainText('set its span in the program')
  await resting(page)

  const back = await twinPlace(page, stair, 1)
  expect(back.y).toBeGreaterThan(bands[1]!.top)
  expect(back.y).toBeLessThan(bands[1]!.top + bands[1]!.height)
  await page.getByRole('button', { name: 'Requirements' }).click()
  await expect(
    page
      .locator('table.program tbody tr')
      .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Stair"]')) })
      .getByLabel('From'),
  ).toHaveValue('0')
})

test('a stair set from First to Second is drawn in the upper bands only', async ({ page }) => {
  await openWithStair(page, 3)
  const stair = await roomIdOf(page, 'Stair')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(3)

  await setSpan(page, 'Stair', 'First', 'Second')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)
  await expect(twin(page, stair, 0)).toHaveCount(0)
  await expect(twin(page, stair, 1)).toHaveCount(1)
  await expect(twin(page, stair, 2).locator('.bubble-span').first()).toHaveText('First to Second')
})

/** Where a point in metres on the zoning sheet lands on the screen. */
async function onZoningSheet(page: Page, x: number, y: number) {
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

test('a stair from Ground to Second is three twins here and one prism in the massing', async ({
  page,
}) => {
  await openWithStair(page, 3)
  const stair = await roomIdOf(page, 'Stair')
  await setSpan(page, 'Stair', 'Ground', 'First')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)

  await setSpan(page, 'Stair', 'Ground', 'Second')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(3)
  await expect(twin(page, stair, 2).locator('.bubble-span').first()).toHaveText('Ground to Second')

  await page.getByRole('button', { name: 'Zoning' }).click()
  const tray = page
    .locator('[data-tray]')
    .filter({ hasText: /^Stair/ })
    .first()
  const from = await tray.boundingBox()
  if (!from) throw new Error('the Stair is not in the tray')
  await drag(
    page,
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    await onZoningSheet(page, 5, 5),
  )
  await expect(page.locator('svg.zoning-sheet [data-room]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Massing' }).click()
  // One room standing through three storeys is one prism, not three: four walls and a roof.
  await expect(page.locator('svg.massing-sheet [data-room]')).toHaveCount(1)
  await expect(page.locator('svg.massing-sheet [data-room] polygon')).toHaveCount(5)
  for (const storey of [0, 1, 2])
    await expect(page.locator(`[data-storey="${storey}"] td`).first()).not.toHaveText('0.0 m²')
})
