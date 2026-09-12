import { expect, type Page } from '@playwright/test'

/**
 * The zoning and the massing live on one tab now, so a test says which half it wants across the
 * whole width. The tab itself is asked for through the nav, because the massing has a view preset
 * of the same name.
 */
export function tab(page: Page, name: string) {
  return page.locator('nav.tabs').getByRole('button', { name, exact: true })
}

/** The Plan tab with the sheet across the whole width, the massing not drawn beside it. */
export async function openSheet(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
}

/** The Plan tab with the massing across the whole width. */
export async function openMass(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await page.getByRole('button', { name: 'Massing', exact: true }).click()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
}

/** Both halves side by side, which is how the tab opens. */
export async function openBoth(page: Page): Promise<void> {
  await tab(page, 'Plan').click()
  await page.getByRole('button', { name: 'Both', exact: true }).click()
  await expect(page.locator('svg.zoning-sheet')).toBeVisible()
  await expect(page.locator('svg.massing-sheet')).toBeVisible()
}
