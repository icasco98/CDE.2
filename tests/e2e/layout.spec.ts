import { expect, test, type Page } from '@playwright/test'
import { openSheet } from './plan'

type Corner = readonly [number, number]

/**
 * The house the reference case reads: two storeys, the program rebuilt from the household with
 * the rulebook's default connections as edges, the plot binding and the bubbles settled, which is
 * the state a person reaches the Zoning tab in.
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

/**
 * Every drawn room read off the page as a polygon in screen pixels, and the pairs of them that
 * share real area. The outlines are taken through each shape's own screen matrix, so whatever the
 * sheet's camera is doing, two rooms are compared where a person sees them.
 */
async function overlapping(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const rooms = [...document.querySelectorAll('svg.zoning-sheet [data-room]')].flatMap(
      (group) => {
        const shape = group.querySelector('polygon.room-shape')
        if (!(shape instanceof SVGPolygonElement)) return []
        const screen = shape.getScreenCTM()
        if (!screen) return []
        const corners: Corner[] = []
        for (let i = 0; i < shape.points.numberOfItems; i++) {
          const point = shape.points.getItem(i)
          const at = new DOMPoint(point.x, point.y).matrixTransform(screen)
          corners.push([at.x, at.y])
        }
        return [{ name: group.querySelector('.room-name')?.textContent ?? '', corners }]
      },
    )

    const span = (corners: readonly Corner[], nx: number, ny: number) => {
      let min = Infinity
      let max = -Infinity
      for (const [x, y] of corners) {
        const d = x * nx + y * ny
        min = Math.min(min, d)
        max = Math.max(max, d)
      }
      return { min, max }
    }
    /** Half a pixel of slack, so two rooms drawn wall to wall are not read as lying over each other. */
    const slack = 0.5
    const separated = (a: readonly Corner[], b: readonly Corner[]) => {
      for (const outline of [a, b])
        for (let i = 0; i < outline.length; i++) {
          const p = outline[i]
          const q = outline[(i + 1) % outline.length]
          if (!p || !q) continue
          const length = Math.hypot(q[1] - p[1], q[0] - p[0])
          if (!length) continue
          const nx = (q[1] - p[1]) / length
          const ny = -(q[0] - p[0]) / length
          const one = span(a, nx, ny)
          const other = span(b, nx, ny)
          if (one.max < other.min + slack || other.max < one.min + slack) return true
        }
      return false
    }

    const found: string[] = []
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]
        const b = rooms[j]
        if (a && b && !separated(a.corners, b.corners)) found.push(`${a.name} over ${b.name}`)
      }
    return found
  })
}

test('one press lays the whole ground floor out, and one undo puts it back in the tray', async ({
  page,
}) => {
  await openZoning(page)
  const tray = page.locator('[data-tray]')
  const waiting = await tray.count()
  expect(waiting).toBeGreaterThan(8)
  await expect(page.locator('[data-room]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Lay out from bubbles' }).click()

  await expect(page.locator('[data-room]')).toHaveCount(waiting)
  await expect(tray).toHaveCount(0)
  expect(await overlapping(page)).toEqual([])
  expect(await page.locator('[data-door]').count()).toBeGreaterThan(0)
  expect(await page.locator('[data-tension]').count()).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(tray).toHaveCount(waiting)
})

test('the same press stands the stair on the floor above and lays the rooms around it', async ({
  page,
}) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Lay out from bubbles' }).click()
  const ground = await page.locator('[data-room]').count()
  const stair = await page
    .locator('[data-room]')
    .filter({ has: page.getByText('Stair', { exact: true }) })
    .first()
    .locator('polygon')
    .getAttribute('points')
  expect(stair).not.toBeNull()

  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.locator('[data-tray]')).toHaveCount(0)
  expect(await page.locator('[data-room]').count()).toBeGreaterThan(0)
  expect(await page.locator('[data-room]').count()).toBeLessThan(ground)
  expect(await overlapping(page)).toEqual([])
  // A stair is one room drawn on every floor it reaches, so its outline upstairs is the one below.
  expect(
    await page
      .locator('[data-room]')
      .filter({ has: page.getByText('Stair', { exact: true }) })
      .first()
      .locator('polygon')
      .getAttribute('points'),
  ).toBe(stair)
})

test('the button is closed once every room has a place', async ({ page }) => {
  await openZoning(page)
  const button = page.getByRole('button', { name: 'Lay out from bubbles' })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', 'Every room already stands on the sheet.')
})
