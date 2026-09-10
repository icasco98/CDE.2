import { expect, test } from '@playwright/test'

test('the app opens and shows its name', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Conceptual Design Engine' })).toBeVisible()
})
