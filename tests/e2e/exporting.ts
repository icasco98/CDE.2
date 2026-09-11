import { type Download, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openSheet } from './plan'

type At = { x: number; y: number }

export async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await openSheet(page)
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

export async function place(page: Page, name: string, x: number, y: number): Promise<void> {
  const tray = page
    .locator('[data-tray]')
    .filter({ hasText: new RegExp(`^${name}`) })
    .first()
  const from = await tray.boundingBox()
  if (!from) throw new Error(`${name} is not in the tray`)
  const to = await onSheet(page, x, y)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

export async function exported(page: Page, button: string): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ])
  return download
}

/** A PDF this tool writes is Latin-1 throughout, and a DXF is ASCII, so both read as text. */
export async function textOf(download: Download): Promise<string> {
  return readFileSync(await download.path(), 'latin1')
}
