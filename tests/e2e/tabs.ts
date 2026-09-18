import { type Page } from '@playwright/test'

/** A stage asked for by name through the nav, so a view preset of the same name is not hit. */
export function tab(page: Page, name: string) {
  return page.locator('nav.tabs').getByRole('button', { name, exact: true })
}
