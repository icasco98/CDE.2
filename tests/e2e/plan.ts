import { expect, type Page } from '@playwright/test'

/** A point on the screen, in pixels. */
export type At = { x: number; y: number }

/**
 * The zoning and the massing live on one tab now, so a test says which half it wants across the
 * whole width. The tab itself is asked for through the nav, because the massing has a view preset
 * of the same name.
 */
export function tab(page: Page, name: string) {
  return page.locator('nav.tabs').getByRole('button', { name, exact: true })
}

/** Which half of the Plan tab is shown, asked for on that tab's own bar. */
export function half(page: Page, name: string) {
  return page.locator('.plan-bar').getByRole('button', { name, exact: true })
}

/** The Plan tab with the sheet across the whole width, the massing not drawn beside it. */
export async function openSheet(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await half(page, 'Sheet').click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
}

/** The Plan tab with the massing across the whole width. */
export async function openMass(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await half(page, 'Massing').click()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
}

/** Both halves side by side, which is how the tab opens. */
export async function openBoth(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await half(page, 'Both').click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
}

/** Where a point in sheet metres lands on the screen. */
export async function onSheet(page: Page, x: number, y: number): Promise<At> {
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

export async function drag(page: Page, from: At, to: At): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

/** A room dragged out of the tray onto the sheet, at a point given in plot metres. */
export async function place(page: Page, name: string, x: number, y: number): Promise<void> {
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

/**
 * A click somewhere really inside a shape. A zone is an orthogonal outline, not a rectangle, so
 * the middle of its box can be in another room; a point of the shape itself is found first.
 */
export async function clickInside(page: Page, selector: string): Promise<void> {
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
