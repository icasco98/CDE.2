import { type Download, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** The Sheet, which is where the export buttons are: it opens on the sample plan. */
export async function openSheet(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
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
