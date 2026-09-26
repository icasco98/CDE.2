import { expect, test, type Page } from '@playwright/test'
import { PROJECT_VERSION, type Project } from '../../src/model'
import { SETTINGS_V, sheetOf, type Room } from '../../src/sheet/model'
import { tab } from './tabs'

/*
 * The zoning sheet and the program agreeing: a door stands on the shared wall it was placed on, and
 * a room moved to another storey on the sheet moves in the program and the bubbles, one undo for both.
 */

test.use({ viewport: { width: 1500, height: 1100 } })

type At = { x: number; y: number }

/**
 * A Kitchen 3 × 3 at (6, 6) and a Dining Room drawn as an L round it: a block east of it and a strip
 * under it, so the two share 3 m of the Kitchen's east wall and 2 m of its south wall.
 */
function twoWalls() {
  const room = (over: Partial<Room>): Room => ({
    id: 'k',
    name: 'Kitchen',
    kind: 'kitchen',
    cat: 'shared',
    target: 9,
    x: 6,
    y: 6,
    w: 3,
    h: 3,
    angle: 0,
    pieces: null,
    storey: 0,
    placed: true,
    placedAt: 1,
    ...over,
  })
  const rooms = [
    room({}),
    room({
      id: 'dn',
      name: 'Dining Room',
      kind: 'dining-room',
      target: 14,
      w: 6,
      h: 4,
      placedAt: 2,
      pieces: [
        [
          [3, 0],
          [6, 0],
          [6, 4],
          [3, 4],
        ],
        [
          [1, 3],
          [3, 3],
          [3, 4],
          [1, 4],
        ],
      ],
    }),
  ]
  const sheet = sheetOf(rooms, { closeGap: 0, snapDist: 0, grid: 0.25 })
  const project: Project = {
    id: 'project-walls',
    name: 'Two walls',
    storeys: 1,
    heights: [3.5],
    plot: {
      on: true,
      polygon: [
        [0, 0],
        [20, 0],
        [20, 25],
        [0, 25],
      ],
      north: 0,
      street: [2],
    },
    household: {
      familySize: 4,
      bedrooms: 3,
      cars: 1,
      maid: false,
      driver: false,
      womensReception: false,
      masterOnGround: false,
    },
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.kind,
      storey: 0,
      storeysSpanned: 1,
      targetArea: r.target,
      pinned: false,
    })),
    edges: [{ id: 'e-k-dn', a: 'k', b: 'dn', kind: 'door', storey: 0 }],
    apart: [],
    declined: [],
    actors: [],
    version: PROJECT_VERSION,
  }
  return {
    project: JSON.stringify(project),
    sheet: JSON.stringify({
      rooms: sheet.rooms,
      storeyCount: 1,
      settings: { ...sheet.settings, v: SETTINGS_V },
      format: 2,
    }),
  }
}

async function onSheet(page: Page, x: number, y: number): Promise<At> {
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

/** The middle of every door drawn on the sheet, in plot metres to the centimetre. */
async function doorMiddles(page: Page): Promise<[number, number][]> {
  return page.evaluate(() => {
    const sheet = document.querySelector('svg.sheet')
    const toSheet = sheet instanceof SVGSVGElement ? sheet.getScreenCTM()?.inverse() : null
    if (!toSheet) throw new Error('there is no sheet')
    return [...document.querySelectorAll('svg.sheet .door:not(.preview) line.gap')].map((gap) => {
      const line = gap as SVGLineElement
      const toScreen = line.getScreenCTM()!
      const mid = new DOMPoint(
        (line.x1.baseVal.value + line.x2.baseVal.value) / 2,
        (line.y1.baseVal.value + line.y2.baseVal.value) / 2,
      )
      const at = mid.matrixTransform(toScreen).matrixTransform(toSheet)
      return [Math.round(at.x * 100) / 100, Math.round(at.y * 100) / 100] as [number, number]
    })
  })
}

test('a door stands on the shorter of two shared walls when that is the one clicked, and on the other when it goes', async ({
  page,
}) => {
  const seeded = twoWalls()
  await page.addInitScript((held) => {
    if (window.localStorage.getItem('cde.test.seeded')) return
    window.localStorage.setItem('cde.test.seeded', '1')
    window.localStorage.setItem('cde.project', held.project)
    window.localStorage.setItem('cde.sheet', held.sheet)
  }, seeded)
  await page.goto('/')
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  await page.getByRole('button', { name: 'Openings', exact: true }).click()
  await page.locator('.grp.place').getByRole('button', { name: 'Door', exact: true }).click()
  const south = await onSheet(page, 8, 9.02)
  await page.mouse.click(south.x, south.y)
  await expect(page.locator('svg.sheet .door:not(.preview)')).toHaveCount(1)
  expect(await doorMiddles(page)).toEqual([[8, 9]])

  // The Kitchen a metre north: its south wall leaves the strip, and the door takes the east wall.
  await page.getByRole('button', { name: 'Zoning', exact: true }).click()
  const kitchen = await onSheet(page, 7, 7)
  await page.mouse.click(kitchen.x, kitchen.y)
  await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(() => doorMiddles(page)).toEqual([[9, 7]])
  await page.keyboard.press('Control+z')
  await expect.poll(() => doorMiddles(page)).toEqual([[8, 9]])
})

test('a room moved up on the sheet is on the First in the program and the bubbles, and one undo brings both back', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  const block = page.locator('.tray .item', { hasText: 'Kitchen' }).locator('.n').first()
  const from = await block.boundingBox()
  if (!from) throw new Error('the Kitchen is not in the program')
  const to = await onSheet(page, 8, 10)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  const kitchen = page.locator('svg.sheet g.room', { hasText: 'Kitchen' })
  await expect(kitchen).toHaveCount(1)

  await page.mouse.click(to.x, to.y, { button: 'right' })
  await page.getByRole('button', { name: /Move up to the first storey/ }).click()
  await expect(page.locator('.say')).toContainText('Kitchen: its door to')
  await expect(page.locator('.say')).toContainText('ground 0 + first 20')

  // Undone on the sheet itself: the sheet and the program go back together.
  await page.keyboard.press('Control+z')
  await expect(page.locator('.say')).not.toContainText('first 20')
  expect(await storeyInProgram(page)).toBe('0')
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  await page.getByRole('button', { name: 'Ground', exact: true }).click()
  await expect(kitchen).toHaveCount(1)

  // Moved again, and undone from the program after the sheet was left: the sheet follows it back.
  await page.mouse.click(to.x, to.y, { button: 'right' })
  await page.getByRole('button', { name: /Move up to the first storey/ }).click()
  expect(await storeyInProgram(page)).toBe('1')
  await tab(page, 'Bubbles').click()
  await expect(bubble(page, 1)).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(bubble(page, 0)).toHaveCount(1)
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
  await page.getByRole('button', { name: 'Ground', exact: true }).click()
  await expect(kitchen).toHaveCount(1)
})

async function storeyInProgram(page: Page): Promise<string> {
  await tab(page, 'Requirements').click()
  const row = page.locator('table.program tbody tr').filter({
    has: page.getByLabel('Room name').and(page.locator('[value="Kitchen"]')),
  })
  return row.getByLabel('Storey').inputValue()
}

const bubble = (page: Page, storey: number) =>
  page.locator(`.bubbles-sheet [data-room][data-name="Kitchen"][data-storey="${storey}"]`)
