import { expect, test, type Page } from '@playwright/test'
import { connect, edgeBetween, openVilla, saved } from './bubbles'

/*
 * The checks beside the diagram, read again on every edit: each warning says what is wrong, and
 * its rule and source are one click down.
 */

const checks = (page: Page) => page.getByRole('region', { name: 'Checks' })

const makes = (page: Page, what: 'Connection' | 'Keep apart') =>
  page.getByRole('group', { name: 'A drag makes' }).getByRole('button', { name: what }).click()

test('the diwaniya is reached by its own street door, and named once that door goes, with rule and source', async ({
  page,
}) => {
  await openVilla(page)
  await expect(checks(page)).not.toContainText('Diwaniya')
  const street = async () => {
    const project = await saved(page)
    const diwaniya = project.rooms.find((room) => room.name === 'Diwaniya')?.id
    return project.edges.find(
      (edge) =>
        (edge.a === 'EXTERIOR' && edge.b === diwaniya) ||
        (edge.b === 'EXTERIOR' && edge.a === diwaniya),
    )
  }
  await expect.poll(async () => (await street())?.id).toBeTruthy()
  const edge = await street()
  await page.locator(`[data-edge="${edge!.id}"] .link-grip`).dispatchEvent('pointerdown')
  await page.locator('svg.bubbles-sheet').dispatchEvent('pointerup')
  await page.getByRole('button', { name: 'Delete connection' }).click()
  const unreached = checks(page).locator('[data-check="unreached"]')
  await expect(unreached).toContainText(
    'Diwaniya and Diwaniya WC are not reached from any entrance.',
  )
  await unreached.getByText('Rule and source').click()
  await expect(unreached).toContainText('reachability from the entrances')
})

test('two storeys and no stair: the checks say so', async ({ page }) => {
  await openVilla(page)
  await expect(checks(page)).not.toContainText('No stair connects the storeys.')
  await page.locator('.bubbles-sheet [data-room][data-name="Stair"]').first().click()
  await page.locator('svg.bubbles-sheet').press('Delete')
  await expect(checks(page).locator('[data-check="no-stair"]')).toHaveText(
    /No stair connects the storeys\./,
  )
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
