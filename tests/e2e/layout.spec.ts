import { expect, test, type Page } from '@playwright/test'
import { openSheet } from './plan'

/**
 * The house the morph is read on: two storeys, the program rebuilt from the household with the
 * rulebook's default connections as edges, the plot binding and the bubbles settled, which is the
 * state a person reaches the Plan tab in.
 */
async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()

  await page.getByRole('button', { name: 'Bubbles', exact: true }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Settle now' }).click()
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })

  await openSheet(page)
}

type Zone = { id: string; corners: [number, number][] }

/** Every zone as the sheet draws it, in plot metres, which is what the sheet's own units are. */
async function zonesOn(page: Page): Promise<Zone[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet [data-zone]')].flatMap((group) => {
      const shape = group.querySelector('polygon')
      if (!(shape instanceof SVGPolygonElement)) return []
      const corners: [number, number][] = []
      for (let i = 0; i < shape.points.numberOfItems; i++) {
        const point = shape.points.getItem(i)
        corners.push([point.x, point.y])
      }
      return [{ id: group.getAttribute('data-zone') ?? '', corners }]
    }),
  )
}

/** Where every door mark sits and which way its wall runs, in the same metres. */
async function doorsOn(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet [data-zone-door]')].map((line) => {
      const read = (name: string): number => Number(line.getAttribute(name) ?? 0)
      return { x1: read('x1'), y1: read('y1'), x2: read('x2'), y2: read('y2') }
    }),
  )
}

/** How far each zone has opened, so the animation can be caught part way and at its end. */
async function opened(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet clipPath circle')].map((circle) =>
      Number(circle.getAttribute('r') ?? 0),
    ),
  )
}

/**
 * A click somewhere really inside a shape. A zone is an orthogonal outline, not a rectangle, so
 * the middle of its box can be in another room; a point of the shape itself is found first.
 */
async function clickInside(page: Page, selector: string): Promise<void> {
  const at = await page.evaluate((which) => {
    const shape = document.querySelector(which)
    if (!(shape instanceof SVGPolygonElement)) return null
    const screen = shape.getScreenCTM()
    if (!screen) return null
    const box = shape.getBBox()
    for (let part = 0.5; part > 0.02; part /= 2)
      for (let x = box.x + part; x < box.x + box.width; x += part)
        for (let y = box.y + part; y < box.y + box.height; y += part)
          if (shape.isPointInFill(new DOMPoint(x, y))) {
            const on = new DOMPoint(x, y).matrixTransform(screen)
            return { x: on.x, y: on.y }
          }
    return null
  }, selector)
  if (!at) throw new Error(`${selector} has nothing to click`)
  await page.mouse.click(at.x, at.y)
}

function inside(corners: readonly [number, number][], x: number, y: number): boolean {
  let held = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i] as [number, number]
    const b = corners[j] as [number, number]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      held = !held
  }
  return held
}

test('Morph divides the storey among its bubbles, with no overlap and no gap', async ({ page }) => {
  await openZoning(page)
  await expect(page.locator('[data-zone]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Morph' }).click()
  const zones = await zonesOn(page)
  expect(zones.length).toBeGreaterThan(8)

  // No two zones lie over one another, sampled over the whole plot at a tenth of a metre.
  const over: string[] = []
  for (let x = 0.05; x < 20; x += 0.1)
    for (let y = 0.05; y < 25; y += 0.1) {
      const holding = zones.filter((zone) => inside(zone.corners, x, y))
      if (holding.length > 1) over.push(`${holding[0]?.id} and ${holding[1]?.id} at ${x},${y}`)
    }
  expect(over.slice(0, 3)).toEqual([])

  // And no gap: a step either side of every door lands in a zone, so the two rooms really meet.
  const doors = await doorsOn(page)
  expect(doors.length).toBeGreaterThan(4)
  const gaps: string[] = []
  for (const door of doors) {
    const run = Math.hypot(door.x2 - door.x1, door.y2 - door.y1) || 1
    const across: [number, number] = [-(door.y2 - door.y1) / run, (door.x2 - door.x1) / run]
    const middle: [number, number] = [(door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2]
    for (const side of [-1, 1]) {
      const at: [number, number] = [
        middle[0] + across[0] * side * 0.2,
        middle[1] + across[1] * side * 0.2,
      ]
      if (!zones.some((zone) => inside(zone.corners, at[0], at[1])))
        gaps.push(`${at[0].toFixed(2)},${at[1].toFixed(2)}`)
    }
  }
  expect(gaps).toEqual([])

  // Every link on the storey is a door, nothing is shut off from the entry or the street, and
  // both garage bays keep their run: the second stands in tandem behind the first, on one drive.
  await expect(page.locator('[data-zone-tension]')).toHaveCount(0)
  await expect(page.locator('[data-unreached]')).toHaveCount(0)
  await expect(page.locator('[data-bay-blocked]')).toHaveCount(0)
})

test('Accept places every room in one step and one Undo unplaces them all', async ({ page }) => {
  await openZoning(page)
  const waiting = await page.locator('[data-tray]').count()
  expect(waiting).toBeGreaterThan(8)

  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  await expect(page.locator('[data-room]')).toHaveCount(waiting)
  await expect(page.locator('[data-tray]')).toHaveCount(0)
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  expect(await page.locator('[data-door]').count()).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]')).toHaveCount(waiting)
})

test('Back writes nothing, and Escape is Back', async ({ page }) => {
  await openZoning(page)
  const waiting = await page.locator('[data-tray]').count()

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]')).toHaveCount(waiting)

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  await expect(page.locator('[data-room]')).toHaveCount(0)
})

test('morphing twice without touching a bubble gives the same zones', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  const first = await zonesOn(page)
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await page.getByRole('button', { name: 'Morph' }).click()
  expect(await zonesOn(page)).toEqual(first)
})

test('the zones grow out of their bubbles, and are a cut under reduced motion', async ({
  page,
}) => {
  await openZoning(page)
  // The cut first, which is the same zones at their full size, and so the size to grow to.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Morph' }).click()
  const full = Math.max(...(await opened(page)))
  expect(full).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Back to bubbles' }).click()

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Every frame the browser draws while the zones open, so the budget is measured and not assumed.
  await page.evaluate(() => {
    const counted = { frames: 0 }
    ;(window as unknown as { counted: { frames: number } }).counted = counted
    const tick = (): void => {
      counted.frames += 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByRole('button', { name: 'Morph' }).click()
  // Caught part way: the widest circle still has more than a metre of its zone to open.
  expect(Math.max(...(await opened(page)))).toBeLessThan(full - 1)
  await expect.poll(async () => Math.max(...(await opened(page)))).toBeCloseTo(full, 1)
  const frames = await page.evaluate(
    () => (window as unknown as { counted: { frames: number } }).counted.frames,
  )
  // The zones take about nine tenths of a second to open; fifty frames in it is sixty a second
  // less the frame or two a browser drops while it starts.
  expect(frames).toBeGreaterThan(50)
})

test('a plot too small for the program shows the spill hatched and counted', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByLabel('Width (m)').fill('14')
  await page.getByLabel('Depth (m)').fill('16')

  await page.getByRole('button', { name: 'Bubbles', exact: true }).click()
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
  await openSheet(page)
  await page.getByRole('button', { name: 'Morph' }).click()

  await expect(page.locator('[data-spill]')).toHaveCount(1)
  await expect(page.locator('[data-fit]')).toContainText('outside the buildable line')
})

test('a storey already drawn is asked about before it is replaced', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()
  const placed = await page.locator('[data-room]').count()

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-replace]')).toContainText(`Replace the ${placed} placed rooms`)
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  // The question is answered by Replace; the proposal it then draws is answered by Accept.
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Replace' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await expect(page.locator('[data-room]')).toHaveCount(placed)
})

test('the accepted zones take the gestures any footprint does', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  const kitchen = page.locator('[data-room][data-name="Kitchen"]')
  await clickInside(page, '[data-room][data-name="Kitchen"] polygon')
  await expect(kitchen).toHaveClass(/room-selected/)
  const before = Number(await kitchen.getAttribute('data-area'))
  expect(before).toBeGreaterThan(0)

  // A wall between two zones is grabbed and moved, which is the gesture G0 built for footprints.
  const grip = await page.locator('[data-wall] .wall-grip').first().boundingBox()
  expect(grip).not.toBeNull()
  const from = {
    x: (grip?.x ?? 0) + (grip?.width ?? 0) / 2,
    y: (grip?.y ?? 0) + (grip?.height ?? 0) / 2,
  }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 6 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Align to north' }).click()
  await expect(page.locator('[data-room]').first()).toBeVisible()
  expect(Number(await kitchen.getAttribute('data-area'))).toBeGreaterThan(0)
})
