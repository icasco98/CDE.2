import { expect, test } from '@playwright/test'

test('the program from the requirements screen appears as bubbles and settles', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await page.getByRole('button', { name: 'Bubbles' }).click()
  const bubbles = page.locator('svg g[data-room]')
  await expect(bubbles.first()).toBeVisible()
  expect(await bubbles.count()).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Settle' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible({ timeout: 15000 })
})
