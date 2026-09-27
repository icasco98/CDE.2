import { expect, test, type Page } from '@playwright/test'
import { edgeBetween, openVilla } from './bubbles'

/*
 * The matrix window: every pair of rooms once, each cell editable through the same actions and
 * the same undo as the diagram behind it.
 */

const matrix = (page: Page) => page.getByRole('dialog', { name: 'Matrix' })

/** The cell of a pair, whichever of the two stands lower in the list. */
async function cell(page: Page, one: string, other: string) {
  const either = matrix(page).getByRole('button', { name: `${one} and ${other}`, exact: true })
  return (await either.count()) > 0
    ? either
    : matrix(page).getByRole('button', { name: `${other} and ${one}`, exact: true })
}

async function setPair(page: Page, one: string, other: string, choice: string) {
  await (await cell(page, one, other)).click()
  await matrix(page)
    .getByRole('group', { name: 'Set the pair' })
    .getByRole('button', { name: choice, exact: true })
    .click()
}

test('a cell shows the pair, and a door turned open there is open in the diagram', async ({
  page,
}) => {
  await openVilla(page)
  await expect
    .poll(async () => (await edgeBetween(page, 'Kitchen', 'Dining Room'))?.id)
    .toBeTruthy()
  const edge = await edgeBetween(page, 'Kitchen', 'Dining Room')
  await page.getByRole('button', { name: 'Matrix' }).click()
  await expect(matrix(page)).toBeVisible()
  await expect(await cell(page, 'Kitchen', 'Dining Room')).toHaveText('D')
  await setPair(page, 'Kitchen', 'Dining Room', 'Open')
  await expect(await cell(page, 'Kitchen', 'Dining Room')).toHaveText('O')
  await matrix(page).getByRole('button', { name: 'Close' }).click()
  await expect(page.locator(`[data-edge="${edge!.id}"]`)).toHaveAttribute('data-kind', 'open')
})

test('keep apart set in the matrix is drawn in the diagram, and Nothing clears it in one undo step', async ({
  page,
}) => {
  await openVilla(page)
  await page.getByRole('button', { name: 'Matrix' }).click()
  await setPair(page, 'Diwaniya', 'Family Living', 'Keep apart')
  await expect(await cell(page, 'Diwaniya', 'Family Living')).toHaveText('✕')
  await expect(page.locator('[data-apart]')).toHaveCount(1)

  await setPair(page, 'Kitchen', 'Dining Room', 'Nothing')
  await expect(await cell(page, 'Kitchen', 'Dining Room')).toHaveText('')
  await page.keyboard.press('Control+z')
  await expect(await cell(page, 'Kitchen', 'Dining Room')).toHaveText('D')
  await page.keyboard.press('Escape')
  await expect(matrix(page)).toHaveCount(0)
})

test('two rooms on storeys no stair joins may be kept apart but not connected', async ({
  page,
}) => {
  await openVilla(page)
  await page.getByRole('button', { name: 'Matrix' }).click()
  await (await cell(page, 'Kitchen', 'Bedroom 1')).click()
  const choices = matrix(page).getByRole('group', { name: 'Set the pair' })
  await expect(choices.getByRole('button', { name: 'Door', exact: true })).toBeDisabled()
  await expect(choices.getByRole('button', { name: 'Keep apart', exact: true })).toBeEnabled()
})
