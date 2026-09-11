import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { deserialize } from '../../src/model'

const rowsOf = (page: Page) => page.locator('table.program tbody tr')

async function enterRequirements(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Project name').fill('Al Bidaa House')

  await page.getByLabel('Width (m)').fill('20')
  await page.getByLabel('Depth (m)').fill('25')
  await page.getByLabel('North (degrees from up)').fill('12')
  await page.getByLabel('South side').check()

  await page.getByLabel('Family size').fill('6')
  await page.getByLabel('Bedrooms').fill('4')
  await page.getByLabel('Cars').fill('2')
  await page.getByLabel('Live-in maid').check()
  await page.getByRole('checkbox', { name: 'Driver', exact: true }).check()

  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
}

test('a person enters a plot, a household and a program, and it is still there after a reload', async ({
  page,
}) => {
  await enterRequirements(page)

  await expect(page.getByText('Plot area')).toContainText('500 m²')
  const rooms = rowsOf(page)
  expect(await rooms.count()).toBeGreaterThanOrEqual(12)

  const diwaniya = rooms.nth(1)
  await expect(diwaniya.getByLabel('Room name')).toHaveValue('Diwaniya')
  await expect(diwaniya.getByLabel('Target area')).toHaveValue('52.5')

  await diwaniya.getByLabel('Target area').fill('8')
  await expect(diwaniya.getByText('Below the legal floor of 10 m²')).toBeVisible()

  await page.getByRole('button', { name: 'Add storey' }).click()
  await rooms.nth(0).getByLabel('Storey').selectOption({ label: 'First' })
  await expect(rooms.nth(0).getByLabel('Storey')).toHaveValue('1')

  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem('cde.project')?.includes('Al Bidaa House')),
    )
    .toBe(true)

  const before = await rooms.count()
  await page.reload()

  await expect(page.getByLabel('Project name')).toHaveValue('Al Bidaa House')
  await expect(page.getByLabel('Width (m)')).toHaveValue('20')
  await expect(page.getByLabel('Depth (m)')).toHaveValue('25')
  await expect(page.getByLabel('North (degrees from up)')).toHaveValue('12')
  await expect(page.getByLabel('South side')).toBeChecked()
  await expect(page.getByLabel('Family size')).toHaveValue('6')
  await expect(page.getByLabel('Live-in maid')).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Driver', exact: true })).toBeChecked()
  await expect(rowsOf(page)).toHaveCount(before)
  await expect(rowsOf(page).nth(1).getByLabel('Target area')).toHaveValue('8')
  await expect(rowsOf(page).nth(0).getByLabel('Storey')).toHaveValue('1')
})

test('a person saves the project to a file that reads back with the same rooms', async ({
  page,
}) => {
  await enterRequirements(page)

  const names = await rowsOf(page)
    .getByLabel('Room name')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save file' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('al-bidaa-house.json')

  const path = await download.path()
  const read = deserialize(readFileSync(path, 'utf8'))
  if (!read.ok) throw new Error(read.problems.map((problem) => problem.message).join(', '))
  expect(read.value.name).toBe('Al Bidaa House')
  expect(read.value.rooms.map((room) => room.name)).toEqual(names)
})

const opened = {
  id: 'project_opened',
  name: 'Opened House',
  storeys: 1,
  plot: { on: true, polygon: [], north: 0, street: [] },
  rooms: [
    {
      id: 'room_1',
      name: 'Diwaniya',
      type: 'diwaniya',
      storey: 0,
      storeysSpanned: 1,
      targetArea: 50,
      pinned: false,
    },
  ],
  edges: [],
  weights: {},
  actors: [],
  version: 1,
}

test('undo, redo, opening a file and refusing one that cannot be read', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  const before = await rowsOf(page).count()

  expect(before).toBeGreaterThan(12)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rowsOf(page)).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect(rowsOf(page)).toHaveCount(before)
  await page.keyboard.press('Control+z')
  await expect(rowsOf(page)).toHaveCount(0)

  await page.locator('.file-button input').setInputFiles({
    name: 'opened.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(opened)),
  })
  await expect(page.getByLabel('Project name')).toHaveValue('Opened House')
  await expect(rowsOf(page)).toHaveCount(1)
  await expect(page.getByLabel('Hold rooms inside the plot')).toBeChecked()

  await page.locator('.file-button input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not json'),
  })
  await expect(page.getByText('broken.json cannot be opened')).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('broken.json cannot be opened')).toHaveCount(0)

  await page.getByRole('button', { name: 'New project' }).click()
  await expect(rowsOf(page)).toHaveCount(0)
})
