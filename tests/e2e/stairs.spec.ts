import { expect, test, type Page } from '@playwright/test'
import { centreOf, drag, edgeBetween, openVilla, roomNamed, selectRoom } from './bubbles'

/*
 * A stair is one room on every storey it spans: in the bubble diagram it stands in each column,
 * and on the zoning sheet moving it on one storey moves it on all of them.
 */

test('a stair stands in both columns as one room, selected and nudged as one', async ({ page }) => {
  await openVilla(page)
  await expect(roomNamed(page, 'Stair', 0)).toHaveCount(1)
  await expect(roomNamed(page, 'Stair', 1)).toHaveCount(1)
  await expect(page.locator('.bubbles-sheet [data-through]')).toHaveCount(1)
  await selectRoom(page, 'Stair', 0)
  await expect(roomNamed(page, 'Stair', 1)).toHaveClass(/bubble-selected/)

  const ground = await centreOf(page, 'Stair', 0)
  const first = await centreOf(page, 'Stair', 1)
  await drag(page, ground, { x: ground.x, y: ground.y + 30 })
  const groundAfter = await centreOf(page, 'Stair', 0)
  const firstAfter = await centreOf(page, 'Stair', 1)
  expect(groundAfter.y - ground.y).toBeCloseTo(firstAfter.y - first.y, 0)
  expect(firstAfter.y).toBeGreaterThan(first.y + 10)
})

test('the stair joins each storey on that storey: its hallway upstairs is a first-floor edge', async ({
  page,
}) => {
  await openVilla(page)
  await expect.poll(async () => (await edgeBetween(page, 'Stair', 'First Hallway'))?.storey).toBe(1)
  await expect
    .poll(async () => (await edgeBetween(page, 'Stair', 'Ground Hallway'))?.storey)
    .toBe(0)
})

/** Where a room stands on the zoning sheet, read off the transform its group carries. */
async function whereOnSheet(page: Page, id: string): Promise<[number, number]> {
  return page.evaluate((room) => {
    const g = document.querySelector(`svg.sheet g.room[data-room="${room}"]`)
    const found = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g?.getAttribute('transform') ?? '')
    if (!found) throw new Error(`${room} is not on the sheet`)
    return [Number(found[1]), Number(found[2])] as [number, number]
  }, id)
}

async function onSheet(page: Page, x: number, y: number) {
  return page.evaluate(
    ([mx, my]) => {
      const sheet = document.querySelector('svg.sheet')
      const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
      if (!screen) throw new Error('there is no sheet')
      const at = new DOMPoint(mx, my).matrixTransform(screen)
      return { x: at.x, y: at.y }
    },
    [x, y],
  )
}

test.describe('the stair on the zoning sheet', () => {
  test.use({ viewport: { width: 1500, height: 1100 } })

  test('moving the stair on the first floor moves it on the ground too', async ({ page }) => {
    const STAIR = 'r1'
    await page.goto('/')
    await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
    await page.locator('svg.sheet').waitFor()
    const before = await whereOnSheet(page, STAIR)

    await page.locator('.storeys button[data-storey="1"]').click()
    expect(await whereOnSheet(page, STAIR)).toEqual(before)
    // Taken by a point inside it clear of its label: a metre in from its top-left corner.
    const grab = await onSheet(page, before[0] + 1, before[1] + 1)
    const to = await onSheet(page, before[0] + 4, before[1] + 1)
    await drag(page, grab, to)
    const moved = await whereOnSheet(page, STAIR)
    expect(moved[0]).toBeGreaterThan(before[0] + 1)

    await page.locator('.storeys button[data-storey="0"]').click()
    expect(await whereOnSheet(page, STAIR)).toEqual(moved)
  })
})
