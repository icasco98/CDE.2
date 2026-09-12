import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSheet, tab } from './plan'

/** The forces run while the tab is open, so nothing on the sheet is measured until it stops. */
async function resting(page: Page) {
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
}

/**
 * The starting plot inside the Municipality setbacks. Twenty by twenty-five with the street to
 * the south is 1.5 m in on three sides and 2 m in on the street, so the buildable area runs from
 * 1.5 to 18.5 across and from 1.5 to 23 down: 365.5 m².
 */
const BUILDABLE = { left: 1.5, right: 18.5, top: 1.5, bottom: 23 }

/** The plot binds by the person's own tick, and that is what holds a bubble inside the line. */
async function bindPlot(page: Page) {
  await page.getByLabel('Hold rooms inside the plot').check()
}

async function openBubbles(page: Page) {
  await page.goto('/')
  await bindPlot(page)
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
}

/** A villa of this many storeys rebuilt from the household, so the program has a stair through it. */
async function openWithStair(page: Page, storeys: number) {
  await page.goto('/')
  await bindPlot(page)
  for (let more = 1; more < storeys; more++)
    await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
}

/**
 * A villa of two storeys with the parents downstairs, so the master bedroom stands on the ground
 * with the corridor it opens off, and the corridor upstairs is there for it to find.
 */
async function openUpstairsMaster(page: Page) {
  await page.goto('/')
  await bindPlot(page)
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByLabel('Master bedroom on the ground floor').check()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
}

/** A plot far larger than the program needs, so the forces rather than the setbacks decide. */
async function roomToSpare(page: Page) {
  await page.getByLabel('Width (m)').fill('40')
  await page.getByLabel('Depth (m)').fill('40')
}

/** A room by its name, which the bubble carries: a small one draws its initials, not its name. */
function roomNamed(page: Page, name: string) {
  return page.locator(`[data-room][data-name="${name}"]`)
}

function storeyShown(page: Page, name: string) {
  return page.getByRole('group', { name: 'Storey shown' }).getByRole('button', { name })
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

/**
 * A bubble, with a point on it that the pointer really reaches: the bubbles stand rim to rim on a
 * crowded plot, and a link draws over them, so the centre is not always the bubble's.
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
  return aimAt(page, roomNamed(page, name).first().locator('[data-bubble]'), name)
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

/** The same click, with the room left selected, which is what the buttons on the bar act on. */
async function selectBubble(page: Page, name: string) {
  await clickBubble(page, name)
  await expect(roomNamed(page, name).first()).toHaveClass(/bubble-selected/)
}

/** Joins two rooms by name through link mode, and leaves the mode again. */
async function link(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  await clickBubble(page, from)
  // The hint names the room the next click joins to, so the second is aimed once the first landed.
  await expect(page.locator('.bubbles-hint')).toContainText(from)
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

/**
 * Takes a link out: the press is dispatched on its grip rather than clicked, because the grip is a
 * line under the bubbles and a click would land on whichever of them covers it.
 */
async function unlink(page: Page, edgeId: string) {
  await page.locator(`[data-edge="${edgeId}"] .link-grip`).dispatchEvent('pointerdown')
  // An open link is drawn as two lines, so it is the group that is counted, not the strokes.
  await expect(page.locator('[data-edge]:has(.link-selected)')).toHaveCount(1)
  await page.locator('svg.bubbles-sheet').press('Delete')
  // The press was dispatched without a hand to lift, so the sheet is told the hand is up before
  // the next gesture: a press that is never let go would turn the next one into a pan.
  await page.locator('svg.bubbles-sheet').dispatchEvent('pointerup')
}

/**
 * Every edge of a room, by the name the program gave it. The autosave is what a test can read the
 * graph from, and it is written a moment after the last edit, so the room is waited for.
 */
async function edgesOfRoom(page: Page, name: string): Promise<readonly string[]> {
  await expect
    .poll(() =>
      page.evaluate((wanted) => {
        const saved = window.localStorage.getItem('cde.project')
        const rooms = (JSON.parse(saved ?? '{}').rooms ?? []) as { name: string }[]
        return rooms.some((room) => room.name === wanted)
      }, name),
    )
    .toBe(true)
  return page.evaluate((wanted) => {
    const saved = window.localStorage.getItem('cde.project')
    const project = JSON.parse(saved ?? '{}') as {
      rooms: { id: string; name: string }[]
      edges: { id: string; a: string; b: string }[]
    }
    const room = project.rooms.find((each) => each.name === wanted)?.id
    return project.edges.filter((edge) => edge.a === room || edge.b === room).map((e) => e.id)
  }, name)
}

/** The pairs the project holds as edges, by room name, as the autosave has them. */
async function linkedPairs(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const saved = window.localStorage.getItem('cde.project')
    if (!saved) return []
    const project = JSON.parse(saved) as {
      rooms: { id: string; name: string }[]
      edges: { a: string; b: string }[]
    }
    const nameOf = (id: string): string =>
      project.rooms.find((room) => room.id === id)?.name ?? 'Outside'
    return project.edges.map((edge) =>
      [nameOf(edge.a), nameOf(edge.b)].sort((one, other) => (one < other ? -1 : 1)).join(' to '),
    )
  })
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

test('the rebuild brings the default connections as edges, with nothing left to accept', async ({
  page,
}) => {
  await openBubbles(page)
  const edges = page.locator('[data-edge]')
  expect(await edges.count()).toBeGreaterThan(10)
  await expect(page.locator('[data-kind="main-door"]')).toHaveCount(1)
  await expect(page.locator('[data-kind="main-door"] .main-door-mark')).toHaveCount(1)
  // The rulebook's own sentence rides on the link its row asked for.
  await expect(page.locator('[data-edge] title').first()).not.toBeEmpty()
  // Nothing is offered any more: the proposals under the sheet and their button are gone.
  await expect(page.locator('.proposals')).toHaveCount(0)
  await expect(page.locator('[data-proposal]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept all proposals' })).toHaveCount(0)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')
})

test('a default connection the designer removes is not made again by adding a room', async ({
  page,
}) => {
  await openBubbles(page)
  await settle(page)
  await expect.poll(() => linkedPairs(page)).toContain('Dining Room to Kitchen')

  // The door between the kitchen and the dining room is the rulebook's D12. Taking it out says
  // this house does not want it, and a room added afterwards must not bring it back.
  const id = await page.evaluate(() => {
    const saved = window.localStorage.getItem('cde.project')
    const project = JSON.parse(saved ?? '{}') as {
      rooms: { id: string; name: string }[]
      edges: { id: string; a: string; b: string }[]
    }
    const named = (name: string) => project.rooms.find((room) => room.name === name)?.id
    const kitchen = named('Kitchen')
    const dining = named('Dining Room')
    return (
      project.edges.find(
        (edge) =>
          (edge.a === kitchen && edge.b === dining) || (edge.a === dining && edge.b === kitchen),
      )?.id ?? ''
    )
  })
  expect(id).not.toBe('')
  await unlink(page, id)
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')

  await page.getByRole('button', { name: 'Requirements' }).click()
  await page.getByRole('button', { name: 'Add room', exact: true }).click()
  await tab(page, 'Bubbles').click()
  await resting(page)
  await expect.poll(() => linkedPairs(page)).not.toContain('Dining Room to Kitchen')
})

test('the bubbles and the plan frame the same plot, and a zoom on one is on the other', async ({
  page,
}) => {
  await openBubbles(page)
  const fitted = await page.locator('svg.bubbles-sheet').getAttribute('viewBox')
  expect(fitted).toBeTruthy()
  await openSheet(page)
  expect(await page.locator('svg.zoning-sheet').getAttribute('viewBox')).toBe(fitted)

  // A wheel notch on the plan is on the bubbles when the tab is opened again.
  const sheet = await page.locator('svg.zoning-sheet').boundingBox()
  if (!sheet) throw new Error('the plan has no sheet')
  await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2)
  await page.mouse.wheel(0, -300)
  await expect(page.locator('svg.zoning-sheet')).not.toHaveAttribute('viewBox', fitted ?? '')
  const closer = await page.locator('svg.zoning-sheet').getAttribute('viewBox')
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg.bubbles-sheet')).toHaveAttribute('viewBox', closer ?? '')

  // And Fit on the bubbles is the whole plot on the plan again.
  await page.getByRole('button', { name: 'Fit' }).click()
  await openSheet(page)
  expect(await page.locator('svg.zoning-sheet').getAttribute('viewBox')).toBe(fitted)
})

test('a bubble dragged past the buildable line comes to rest inside it', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  const kitchen = await bubbleAt(page, 'Kitchen')
  // Past the line the setbacks leave, and past the plot's own edge, but still on the sheet.
  await drag(page, kitchen.screen, await onSheet(page, 24, 22))
  await resting(page)

  const circle = roomNamed(page, 'Kitchen').first().locator('[data-bubble]')
  const [x, y, r] = await Promise.all([
    circle.getAttribute('cx'),
    circle.getAttribute('cy'),
    circle.getAttribute('r'),
  ])
  const radius = Number(r)
  expect(Number(x)).toBeLessThanOrEqual(BUILDABLE.right - radius + 0.01)
  expect(Number(x)).toBeGreaterThanOrEqual(BUILDABLE.left + radius - 0.01)
  expect(Number(y)).toBeLessThanOrEqual(BUILDABLE.bottom - radius + 0.01)
  expect(Number(y)).toBeGreaterThanOrEqual(BUILDABLE.top + radius - 0.01)
})

test('every bubble rests inside the buildable line on a project just opened', async ({ page }) => {
  // Nothing is ticked and nothing is dragged: the setbacks are the Municipality's, so the line
  // holds the bubbles from the first frame, on a plot the person has not said anything about.
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await settle(page)

  const circles = await page.$$eval('[data-bubble]', (shapes) =>
    shapes.map((shape) => ({
      x: Number(shape.getAttribute('cx')),
      y: Number(shape.getAttribute('cy')),
      r: Number(shape.getAttribute('r')),
    })),
  )
  expect(circles.length).toBeGreaterThan(10)
  for (const circle of circles) {
    expect(circle.x - circle.r).toBeGreaterThanOrEqual(BUILDABLE.left - 0.01)
    expect(circle.x + circle.r).toBeLessThanOrEqual(BUILDABLE.right + 0.01)
    expect(circle.y - circle.r).toBeGreaterThanOrEqual(BUILDABLE.top - 0.01)
    expect(circle.y + circle.r).toBeLessThanOrEqual(BUILDABLE.bottom + 0.01)
  }
})

test('the legend paints each category in the fill its bubbles wear', async ({ page }) => {
  await openBubbles(page)
  const fillOf = (selector: string) => page.$eval(selector, (mark) => getComputedStyle(mark).fill)
  for (const category of ['reception', 'shared', 'private', 'service']) {
    const swatch = await fillOf(`.legend .legend-swatch.category-${category}`)
    expect(swatch).not.toBe('rgb(0, 0, 0)')
    expect(swatch).toBe(await fillOf(`svg.bubbles-sheet .bubble-shape.category-${category}`))
  }
  // The mark for a room held in place is its own, and not a category's.
  const pin = await fillOf('.legend .pin-mark')
  expect(pin).not.toBe('rgb(0, 0, 0)')
  expect(pin).toBe(await fillOf('svg.bubbles-sheet .pin-mark, .legend .pin-mark'))
})

test('the legend stands beside the sheet and covers no bubble', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  const legend = await page.locator('.legend').boundingBox()
  if (!legend) throw new Error('there is no legend')
  for (const circle of await page.locator('[data-bubble]').all()) {
    const box = await circle.boundingBox()
    if (!box) continue
    const apart =
      box.x > legend.x + legend.width ||
      legend.x > box.x + box.width ||
      box.y > legend.y + legend.height ||
      legend.y > box.y + box.height
    expect(apart).toBe(true)
  }
})

test('a plot too small for the program says so on both screens before a bubble is moved', async ({
  page,
}) => {
  await page.goto('/')
  await bindPlot(page)
  await page.getByLabel('Width (m)').fill('12')
  await page.getByLabel('Depth (m)').fill('12')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  const totals = page.locator('.totals .fit').first()
  await expect(totals).toContainText('over by')
  await expect(totals).toContainText('buildable')

  await tab(page, 'Bubbles').click()
  await expect(page.locator('.bubbles-fit dd').first()).toContainText('over by')
  await expect(page.locator('.bubbles-fit .fit-over')).toHaveCount(1)
})

test('the fit line says what the ground has to spare when it fits', async ({ page }) => {
  await openBubbles(page)
  await expect(page.locator('.bubbles-fit dd').first()).toContainText('365.5 m² buildable')
  await expect(page.locator('.bubbles-fit dd').first()).toContainText('to spare')
  await page.getByRole('button', { name: 'Requirements' }).click()
  await expect(page.locator('.totals .fit').first()).toContainText('365.5 m² buildable')
})

test('All draws the storey above faint over the ground, a stair at one point on both', async ({
  page,
}) => {
  await openWithStair(page, 2)
  await settle(page)
  await expect(storeyShown(page, 'All')).toHaveAttribute('aria-pressed', 'true')
  await expect(roomNamed(page, 'Kitchen').first()).not.toHaveClass(/bubble-dimmed/)
  await expect(roomNamed(page, 'Master Bedroom').first()).toHaveClass(/bubble-dimmed/)

  const stair = await roomNamed(page, 'Stair').first().getAttribute('data-room')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)
  const places = await page.$$eval(`[data-room="${stair}"] [data-bubble]`, (circles) =>
    circles.map((circle) => `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`),
  )
  expect(places[0]).toBe(places[1])
})

test('the storey group draws one storey at a time on the one plot', async ({ page }) => {
  await openWithStair(page, 2)
  const stair = await roomNamed(page, 'Stair').first().getAttribute('data-room')

  await storeyShown(page, 'First').click()
  await expect(roomNamed(page, 'Kitchen')).toHaveCount(0)
  await expect(roomNamed(page, 'Master Bedroom').first()).not.toHaveClass(/bubble-dimmed/)
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(1)
  await expect(page.locator(`[data-room="${stair}"][data-twin="1"]`)).toHaveCount(1)

  await storeyShown(page, 'Ground').click()
  await expect(roomNamed(page, 'Kitchen')).toHaveCount(1)
  await expect(roomNamed(page, 'Master Bedroom')).toHaveCount(0)
  await expect(page.locator(`[data-room="${stair}"][data-twin="0"]`)).toHaveCount(1)
})

test('a name goes on two lines rather than giving way to initials', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  // A 24 m² dining room is about 95 px across at a fit on this plot, which is room enough for
  // its name broken at the space, so it is not asked to wear "DR".
  const dining = roomNamed(page, 'Dining Room')
  await expect(dining.locator('.bubble-name')).toHaveText(['Dining', 'Room'])
  await expect(dining.locator('.bubble-mark')).toHaveCount(0)
  // No two rooms wear the same initials, whatever else is on the plot.
  const marks = await page.$$eval('.bubble-mark', (texts) =>
    texts.map((text) => text.textContent ?? ''),
  )
  expect(marks.length).toBeGreaterThan(0)
  expect(new Set(marks).size).toBe(marks.length)
})

test('a room too small for its name wears its initials and says the name on hover', async ({
  page,
}) => {
  await openBubbles(page)
  await settle(page)
  // The Guest WC is 3 m², a bubble two metres across: its name will not go inside it at fit zoom.
  const wc = page.locator('[data-room]').filter({ has: page.getByText('GW', { exact: true }) })
  await expect(wc).toHaveCount(1)
  await expect(wc.locator('.bubble-name')).toHaveCount(0)
  const full = wc.locator('.bubble-full')
  await expect(full).toHaveText('Guest WC')
  await expect(full).toBeHidden()
  await wc.locator('[data-bubble]').hover()
  await expect(full).toBeVisible()
})

test('a room sent upstairs takes what belongs with it and leaves the rest', async ({ page }) => {
  await openUpstairsMaster(page)
  await settle(page)
  await expect.poll(() => linkedPairs(page)).toContain('Ground Hallway to Master Bedroom')

  await selectBubble(page, 'Master Bedroom')
  await page.getByRole('button', { name: 'To First' }).click()
  await resting(page)

  // The suite goes up whole: the ensuite is the master bedroom's own and moves with it.
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Master Bedroom')).toBe('First')
  expect(await storeyOf(page, 'Ensuite, Master Bedroom')).toBe('First')

  const pairs = await linkedPairs(page)
  // The corridor it opened off is on the floor it has left, so that door goes; the corridor
  // upstairs is what the rulebook wants a bedroom on that floor to open off, so that door comes.
  expect(pairs).not.toContain('Ground Hallway to Master Bedroom')
  expect(pairs).toContain('First Hallway to Master Bedroom')
  expect(pairs).toContain('Ensuite, Master Bedroom to Master Bedroom')
})

test('the whole move is one step to undo', async ({ page }) => {
  await openUpstairsMaster(page)
  await settle(page)
  const before = await linkedPairs(page)

  await selectBubble(page, 'Master Bedroom')
  await page.getByRole('button', { name: 'To First' }).click()
  await resting(page)
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'Master Bedroom')).toBe('First')

  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await storeyOf(page, 'Master Bedroom')).toBe('Ground')
  expect(await storeyOf(page, 'Ensuite, Master Bedroom')).toBe('Ground')
  await expect.poll(() => linkedPairs(page)).toEqual(before)
})

test('a stair will not change floors that way', async ({ page }) => {
  await openWithStair(page, 2)
  await settle(page)
  await selectBubble(page, 'Stair')
  await page.getByRole('button', { name: 'To First' }).click()
  await expect(page.locator('.messages')).toContainText('set its span in the program')
  await page.getByRole('button', { name: 'Requirements' }).click()
  // A stair's row says which storeys it spans rather than which one it stands on.
  await expect(
    page
      .locator('table.program tbody tr')
      .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Stair"]')) })
      .getByLabel('From'),
  ).toHaveValue('0')
})

test('a room sent upstairs from the program moves the same way', async ({ page }) => {
  await openUpstairsMaster(page)
  await page.getByRole('button', { name: 'Requirements' }).click()
  const master = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Master Bedroom"]')) })
  await master.getByLabel('Storey').selectOption({ label: 'First' })
  expect(await storeyOf(page, 'Ensuite, Master Bedroom')).toBe('First')
  await expect.poll(() => linkedPairs(page)).toContain('First Hallway to Master Bedroom')
})

test('Delete takes a room and its links, and one undo brings both back', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  const rooms = await page.locator('svg g[data-room]').count()
  const links = await page.locator('[data-edge]').count()
  await selectBubble(page, 'Kitchen')
  await expect(page.getByRole('button', { name: 'Delete room' })).toBeEnabled()
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('svg g[data-room]')).toHaveCount(rooms - 1)
  expect(await page.locator('[data-edge]').count()).toBeLessThan(links)
  await page.keyboard.press('Control+z')
  await expect(page.locator('svg g[data-room]')).toHaveCount(rooms)
  await expect(page.locator('[data-edge]')).toHaveCount(links)
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

/** Where a bubble stands on the sheet, in metres, by the name of its room. */
async function sheetPlaceOf(page: Page, name: string) {
  const circle = roomNamed(page, name).first().locator('[data-bubble]')
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
  const before = await placesOn(page)
  const across = await onSheet(page, 4, 20)

  await page.mouse.move(kitchen.screen.x, kitchen.screen.y)
  await page.mouse.down()
  await page.mouse.move(across.x, across.y, { steps: 8 })
  // Still holding: the cloud the kitchen has been dragged into has to have answered by now, and
  // it is the others that must have moved, not only the bubble under the hand.
  await expect
    .poll(async () => {
      const now = await placesOn(page)
      return now.filter((place, index) => place !== before[index]).length
    })
    .toBeGreaterThan(1)
  await page.mouse.up()
})

/**
 * How far the bubbles stand from the middle of the cloud, in metres on the sheet. Pixels will not
 * do: the sheet frames the plot, so a cloud that opens out is drawn no larger.
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

test('Spread opens a cloud out and lets it settle again', async ({ page }) => {
  // On a plot with room to spare, so the breeze has somewhere to open the cloud out to: the
  // buildable line always holds the bubbles, and a plot the program fills holds them where they are.
  await page.goto('/')
  await roomToSpare(page)
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await resting(page)
  const tight = await reachOf(page)
  await page.getByRole('button', { name: 'Spread' }).click()
  await expect.poll(() => reachOf(page), { timeout: 5000 }).toBeGreaterThan(tight * 1.2)
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
  // On a plot with room to spare: the gradient is read on the air between two rooms, and a plot
  // the program fills would hold them apart by its own walls whatever the weight said.
  await page.goto('/')
  await roomToSpare(page)
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await resting(page)
  const weight = page.getByRole('slider', { name: 'User requirements' })
  await weight.fill('0')
  await settle(page)
  const diwaniya = await bubbleAt(page, 'Diwaniya')
  const master = await bubbleAt(page, 'Master Bedroom')
  await drag(page, master.screen, diwaniya.screen)
  await settle(page)
  const low = await apart(page, 'Diwaniya', 'Master Bedroom')

  await weight.fill('1')
  await settle(page)
  expect(await apart(page, 'Diwaniya', 'Master Bedroom')).toBeGreaterThan(low + 1)
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
  await tab(page, 'Bubbles').click()
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
  await settle(page)
  const drop = await bubbleAt(page, 'Formal Living')
  const kitchen = await bubbleAt(page, 'Kitchen')
  await drag(page, kitchen.screen, { x: drop.screen.x, y: drop.screen.y - 40 })
  await resting(page)
  await expect(page.getByRole('button', { name: 'Hold in place' })).toBeEnabled()
  await expect(roomNamed(page, 'Kitchen').first().locator('.pin-mark')).toHaveCount(0)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(false)

  await page.getByRole('button', { name: 'Hold in place' }).click()
  await expect(roomNamed(page, 'Kitchen').first().locator('.pin-mark')).toHaveCount(1)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(true)

  const again = await bubbleAt(page, 'Kitchen')
  await drag(page, again.screen, { x: again.screen.x + 60, y: again.screen.y })
  await resting(page)
  await expect(roomNamed(page, 'Kitchen').first().locator('.pin-mark')).toHaveCount(1)
  await expect.poll(() => pinnedInStore(page, 'Kitchen')).toBe(true)
})

test('a diagram left at rest opens at rest, and no bubble moves on arrival', async ({ page }) => {
  await openBubbles(page)
  await settle(page)
  const before = await placesOn(page)

  await page.getByRole('button', { name: 'Requirements' }).click()
  await expect(page.locator('svg.bubbles-sheet')).toHaveCount(0)
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()

  // Not "settles again quickly": at rest the moment it is drawn, and not a bubble out of place.
  expect(await page.locator('.bubbles-status').textContent()).toBe('Resting')
  expect(await placesOn(page)).toEqual(before)
})

/** The id a room is drawn under, taken from any twin of it. */
async function roomIdOf(page: Page, name: string): Promise<string> {
  const id = await roomNamed(page, name).first().getAttribute('data-room')
  if (!id) throw new Error(`${name} is not on the sheet`)
  return id
}

/** The two ends of a stair's span as the program row asks for them. */
async function setSpan(page: Page, name: string, from: string, to: string) {
  await page.getByRole('button', { name: 'Requirements' }).click()
  const row = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator(`[value="${name}"]`)) })
  await row.getByLabel('From').selectOption({ label: from })
  await row.getByLabel('To').selectOption({ label: to })
  await tab(page, 'Bubbles').click()
  await resting(page)
}

test('a link drawn to a stair upstairs is an edge on that storey', async ({ page }) => {
  await openWithStair(page, 2)
  await settle(page)
  const stair = await roomIdOf(page, 'Stair')
  await storeyShown(page, 'First').click()
  const before = await page.locator('[data-edge][data-storey="1"]').count()
  await link(page, 'Master Bedroom', 'Stair')
  expect(await page.locator('[data-edge][data-storey="1"]').count()).toBe(before + 1)
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(1)
})

test('a stair set from First to Second is drawn on the upper storeys only', async ({ page }) => {
  await openWithStair(page, 3)
  const stair = await roomIdOf(page, 'Stair')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(3)

  // A stair that leaves the ground takes its doors on the ground with it, which the graph will
  // not have, so the links the rulebook gave it go first.
  for (const id of await edgesOfRoom(page, 'Stair')) await unlink(page, id)
  await setSpan(page, 'Stair', 'First', 'Second')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)
  await expect(page.locator(`[data-room="${stair}"][data-twin="0"]`)).toHaveCount(0)
  await expect(page.locator(`[data-room="${stair}"][data-twin="1"]`)).toHaveCount(1)
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

test('a stair from Ground to Second is three bubbles here and one prism in the massing', async ({
  page,
}) => {
  await openWithStair(page, 3)
  const stair = await roomIdOf(page, 'Stair')
  for (const id of await edgesOfRoom(page, 'Stair')) await unlink(page, id)
  await setSpan(page, 'Stair', 'Ground', 'First')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(2)

  await setSpan(page, 'Stair', 'Ground', 'Second')
  await expect(page.locator(`[data-room="${stair}"]`)).toHaveCount(3)

  await openSheet(page)
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

  await page.getByRole('button', { name: 'Massing', exact: true }).click()
  // One room standing through three storeys is one prism, not three: four walls and a roof.
  await expect(page.locator('svg.massing-sheet [data-room]')).toHaveCount(1)
  await expect(page.locator('svg.massing-sheet [data-room] polygon')).toHaveCount(5)
})

/** The button on the bar, which the one on a nudge does not answer to: that one names its storey. */
function addHallwayButton(page: Page) {
  return page.getByRole('button', { name: 'Add hallway', exact: true })
}

test('the hallway upstairs is linked to every bedroom on its own floor', async ({ page }) => {
  await openWithStair(page, 2)
  await expect(page.locator('.bubbles-nudge')).toHaveCount(0)
  const pairs = await linkedPairs(page)
  for (const bedroom of ['Master Bedroom', 'Bedroom 1', 'Bedroom 2'])
    expect(pairs).toContain(
      [bedroom, 'First Hallway'].sort((one, other) => (one < other ? -1 : 1)).join(' to '),
    )
})

test('deleting the hallway upstairs brings the nudge, and Add hallway answers it', async ({
  page,
}) => {
  await openWithStair(page, 2)
  await settle(page)

  await storeyShown(page, 'First').click()
  await selectBubble(page, 'First Hallway')
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(page.locator('.bubbles-nudge')).toHaveText(
    /First has three private rooms and no hallway\./,
  )

  await addHallwayButton(page).click()
  await expect(page.locator('.bubbles-nudge')).toHaveCount(0)
  await expect(roomNamed(page, 'First Hallway')).toHaveCount(1)
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(await storeyOf(page, 'First Hallway')).toBe('First')
})

test('with every storey showing, Add hallway takes the lowest floor without one', async ({
  page,
}) => {
  await openWithStair(page, 2)
  await settle(page)
  // Both floors have one after the rebuild, so there is no floor left for the button to serve.
  await expect(addHallwayButton(page)).toBeDisabled()
  await expect(addHallwayButton(page)).toHaveAttribute(
    'title',
    'Every storey has a hallway; add another from the program.',
  )

  await selectBubble(page, 'Ground Hallway')
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(roomNamed(page, 'Ground Hallway')).toHaveCount(0)

  await addHallwayButton(page).click()
  await expect(roomNamed(page, 'Ground Hallway')).toHaveCount(1)
  await expect(addHallwayButton(page)).toBeDisabled()
  // The program reads as a rebuild would have written it, corridor behind the stair and all.
  await page.getByRole('button', { name: 'Requirements' }).click()
  expect(
    await page
      .locator('table.program tbody tr input[aria-label="Room name"]')
      .evaluateAll((inputs) =>
        inputs.slice(0, 4).map((input) => (input as HTMLInputElement).value),
      ),
  ).toEqual(['Entry', 'Stair', 'Ground Hallway', 'First Hallway'])
})
