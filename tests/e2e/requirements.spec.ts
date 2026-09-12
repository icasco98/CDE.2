import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { deserialize } from '../../src/model'

const rowsOf = (page: Page) => page.locator('table.program tbody tr')

/** A program row by the name it carries, which is the name the rebuild gave it. */
function rowNamed(page: Page, name: string) {
  return rowsOf(page).filter({
    has: page.getByLabel('Room name').and(page.locator(`[value="${name}"]`)),
  })
}

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

  // The three weights stand beside the diagram they change, on the Bubbles tab, not here.
  await expect(page.getByRole('slider', { name: 'Site constraints' })).toHaveCount(0)

  const diwaniya = rowNamed(page, 'Diwaniya')
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
  await expect(rowNamed(page, 'Diwaniya').getByLabel('Target area')).toHaveValue('8')
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

test('two storeys put the bedrooms upstairs, and a bedroom added brings its ensuite', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()

  await expect(rowNamed(page, 'Stair')).toHaveCount(1)
  await expect(rowNamed(page, 'Master Bedroom').getByLabel('Storey')).toHaveValue('1')
  await expect(rowNamed(page, 'Ensuite, Master Bedroom').getByLabel('Storey')).toHaveValue('1')
  await expect(rowNamed(page, 'Bedroom 2').getByLabel('Storey')).toHaveValue('1')
  await expect(rowNamed(page, 'Kitchen').getByLabel('Storey')).toHaveValue('0')

  await page.getByLabel('Master bedroom on the ground floor').check()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await expect(
    rowNamed(page, 'Master Bedroom').getByLabel('Storey').locator('option:checked'),
  ).toHaveText('Ground')
  await expect(rowNamed(page, 'Ensuite, Master Bedroom').getByLabel('Storey')).toHaveValue('0')
  await expect(rowNamed(page, 'Bedroom 1').getByLabel('Storey')).toHaveValue('1')

  const before = await rowsOf(page).count()
  await page.getByLabel('Kind to add').selectOption('bedroom')
  await page.getByRole('button', { name: 'Add room' }).click()
  await expect(rowsOf(page)).toHaveCount(before + 2)
  await expect(rowNamed(page, 'Ensuite, Bedroom').getByLabel('Storey')).toHaveValue('1')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rowsOf(page)).toHaveCount(before)
  await expect(rowNamed(page, 'Ensuite, Bedroom')).toHaveCount(0)
})

test('a two-storey rebuild lays a hallway on each floor, sized from that floor', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()

  await expect(rowNamed(page, 'Ground Hallway').getByLabel('Storey')).toHaveValue('0')
  await expect(rowNamed(page, 'First Hallway').getByLabel('Storey')).toHaveValue('1')
  // A tenth of the 214 m² downstairs and of the 82 m² of bedrooms and ensuites upstairs.
  await expect(rowNamed(page, 'Ground Hallway').getByLabel('Target area')).toHaveValue('21.4')
  await expect(rowNamed(page, 'First Hallway').getByLabel('Target area')).toHaveValue('8.2')
})

test('a storey added and undone takes the stair back down with it', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Kind to add').selectOption('stair')
  await page.getByRole('button', { name: 'Add room' }).click()
  await page.getByLabel('Kind to add').selectOption('bedroom')
  await page.getByRole('button', { name: 'Add room' }).click()

  const stair = rowNamed(page, 'Stair')
  const bedroom = rowNamed(page, 'Bedroom')

  await page.getByRole('button', { name: 'Add storey' }).click()
  await expect(bedroom.getByLabel('Storey').locator('option')).toHaveText(['Ground', 'First'])
  await expect(stair.getByLabel('To').locator('option:checked')).toHaveText('First')

  await page.getByRole('button', { name: 'Undo' }).click()

  await expect(bedroom.getByLabel('Storey').locator('option')).toHaveText(['Ground'])
  await expect(stair.getByLabel('From').locator('option:checked')).toHaveText('Ground')
  await expect(stair.getByLabel('To').locator('option:checked')).toHaveText('Ground')
  // The one undo answered the storey alone: the three rooms added before it are still there.
  await expect(rowsOf(page)).toHaveCount(3)
})
