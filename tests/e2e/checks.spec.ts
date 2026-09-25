import { expect, test, type Page } from '@playwright/test'
import { connect, edgeBetween, openVilla } from './bubbles'

/*
 * The checks beside the diagram, read again on every edit: each warning says what is wrong, and
 * its rule and source are one click down.
 */

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' })

const makes = (page: Page, what: 'Connection' | 'Keep apart') =>
  page.getByRole('group', { name: 'A drag makes' }).getByRole('button', { name: what }).click()

test('the default villa names the rooms its front door does not reach, with rule and source', async ({
  page,
}) => {
  await openVilla(page)
  const unreached = checks(page).locator('[data-check="unreached"]')
  await expect(unreached).toContainText('Diwaniya')
  await expect(unreached).toContainText('not reached from the front door')
  await unreached.getByText('Rule and source').click()
  await expect(unreached).toContainText('reachability from the front door')
})

test('a private room joined to a public one is a tier skip until the edge goes', async ({
  page,
}) => {
  await openVilla(page)
  await expect(checks(page).locator('[data-check="tier-skip"]')).toHaveCount(0)
  await connect(page, 'Kitchen', 'Formal Living')
  await expect(checks(page).locator('[data-check="tier-skip"]')).toHaveText(
    /Kitchen, a private room, is joined to Formal Living, a public one\./,
  )
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(checks(page).locator('[data-check="tier-skip"]')).toHaveCount(0)
})

test('keeping a connected pair apart warns of the edge between them at once', async ({ page }) => {
  await openVilla(page)
  await expect
    .poll(async () => (await edgeBetween(page, 'Kitchen', 'Dining Room'))?.id)
    .toBeTruthy()
  await makes(page, 'Keep apart')
  await connect(page, 'Kitchen', 'Dining Room')
  await expect(checks(page).locator('[data-check="apart-joined"]')).toHaveText(
    /Kitchen and Dining Room are kept apart, and an edge joins them\./,
  )
})
