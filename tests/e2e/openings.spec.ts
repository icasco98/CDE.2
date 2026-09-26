import { expect, test, type Page } from '@playwright/test'
import { seedPlan } from './plan'

/**
 * The Openings step, on the test plan and the edges its doors draw. Every case is one thing an
 * architect does to a door, and each one puts the sheet back with Ctrl+Z.
 */

type At = { x: number; y: number }

/** The ids the embedded sheet gives its rooms, so a test can name one without hunting for it. */
const FORMAL = 'r6'

async function openStep(page: Page): Promise<void> {
  await seedPlan(page)
  await page.goto('/')
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
  await page.getByRole('button', { name: 'Openings', exact: true }).click()
  await page.locator('svg.sheet.doormode').waitFor()
}

/** Where a point in sheet metres lands on the screen. */
async function onSheet(page: Page, mx: number, my: number): Promise<At> {
  return page.evaluate(
    ([x, y]) => {
      const sheet = document.querySelector('svg.sheet')
      const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
      if (!screen) throw new Error('there is no sheet')
      const at = new DOMPoint(x, y).matrixTransform(screen)
      return { x: at.x, y: at.y }
    },
    [mx, my],
  )
}

/** A point in metres, clicked on the sheet. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  const at = await onSheet(page, x, y)
  await page.mouse.click(at.x, at.y)
}

async function drag(page: Page, from: At, to: At, steps = 8): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    )
  await page.mouse.up()
}

const sentence = (page: Page) => page.locator('.say')

/** What the selected door's controls in the toolbar say it is and where it stands. */
const who = (page: Page) => page.locator('.door-ctl .who')

const arm = (page: Page, label: string) =>
  page.locator('.grp.place').getByRole('button', { name: label, exact: true }).click()

const undo = (page: Page) => page.keyboard.press('Control+z')

const doors = (page: Page) => page.locator('svg.sheet .door:not(.preview)')

/** The two ends of the selected door's gap in sheet metres, west end first. */
async function selectedGap(page: Page): Promise<[number, number][]> {
  return page.evaluate(() => {
    const sheet = document.querySelector('svg.sheet') as SVGSVGElement
    const gap = document.querySelector('svg.sheet .door.selected line.gap') as SVGLineElement
    const toSheet = sheet.getScreenCTM()!.inverse()
    const toScreen = gap.getScreenCTM()!
    const at = (x: number, y: number): [number, number] => {
      const p = new DOMPoint(x, y).matrixTransform(toScreen).matrixTransform(toSheet)
      return [p.x, p.y]
    }
    const ends = [
      at(gap.x1.baseVal.value, gap.y1.baseVal.value),
      at(gap.x2.baseVal.value, gap.y2.baseVal.value),
    ]
    return ends.sort((one, other) => one[0] - other[0])
  })
}

test.use({ viewport: { width: 1500, height: 1100 } })

test.describe('the Openings step', () => {
  test.beforeEach(async ({ page }) => openStep(page))

  test('switches on the segmented switch and on Z and O, and never on Esc', async ({ page }) => {
    await expect(page.locator('.sheet-stage.openings')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('svg.sheet.doormode')).toBeVisible()
    await page.keyboard.press('z')
    await expect(page.locator('svg.sheet.doormode')).toHaveCount(0)
    await page.keyboard.press('o')
    await expect(page.locator('svg.sheet.doormode')).toBeVisible()
  })

  test('puts a second door on the Kitchen’s connection to the service hallway, and refuses one on top of it', async ({
    page,
  }) => {
    const before = await doors(page).count()
    await expect(sentence(page)).toContainText('service hallway serves 4 doors')
    await arm(page, 'Door')
    await page.getByLabel('Door width in metres').fill('1.2')
    await page.getByLabel('Door width in metres').press('Enter')
    await clickAt(page, 4, 16.37)
    // one connection, two doors: the new one stands beside the one it had
    await expect(doors(page)).toHaveCount(before + 1)
    await expect(who(page)).toHaveText(/Door on (Kitchen|service hallway)/)
    await expect(page.locator('.door-ctl .w')).toHaveText('1.2 m')
    await expect(sentence(page)).toContainText('service hallway serves 5 doors')
    // A 2 m door aimed 0.6 m past the new door's end, out of its reach, would still overlap it.
    const [, east] = await selectedGap(page)
    await page.getByLabel('Door width in metres').fill('2')
    await page.getByLabel('Door width in metres').press('Enter')
    await clickAt(page, east[0] + 0.6, east[1])
    await expect(sentence(page)).toContainText('That would overlap the door already on')
    await expect(doors(page)).toHaveCount(before + 1)
    await page.keyboard.press('Delete')
    await expect(doors(page)).toHaveCount(before)
    await expect(sentence(page)).toContainText('service hallway serves 4 doors')
    await undo(page)
    await expect(doors(page)).toHaveCount(before + 1)
    await undo(page)
    await expect(doors(page)).toHaveCount(before)
  })

  test('refuses a wall on the plot boundary, in the mock’s words', async ({ page }) => {
    const before = await doors(page).count()
    await arm(page, 'Door')
    await clickAt(page, 0, 4.5)
    await expect(sentence(page)).toContainText('A wall on the boundary takes no door.')
    expect(await doors(page).count()).toBe(before)
  })

  test('opens the stretch the Entry and the Formal Living share, and the walk reads them as one', async ({
    page,
  }) => {
    await clickAt(page, 14.2, 7)
    await expect(who(page)).toHaveText('Opening on Entry')
    await page.keyboard.press('Delete')
    await expect(sentence(page)).toContainText('not reached: Formal Living')
    await arm(page, 'Open wall')
    await clickAt(page, 14.2, 7)
    await expect(sentence(page)).toContainText('Walk 17 of 17 reached from outside')
    await expect(page.locator('.room.unreached')).toHaveCount(0)
    await undo(page)
    await expect(sentence(page)).toContainText('not reached: Formal Living')
    await undo(page)
    await expect(sentence(page)).toContainText('Walk 17 of 17 reached from outside')
  })

  test('puts a street door back on the Diwaniya and the sentence stops naming it', async ({
    page,
  }) => {
    await clickAt(page, 10.91, 20.05)
    await expect(who(page)).toHaveText('Street door on Diwaniya')
    await page.keyboard.press('Delete')
    await expect(sentence(page)).toContainText('Diwaniya has no street door')
    await arm(page, 'Street door')
    await clickAt(page, 10.91, 20.05)
    await expect(sentence(page)).not.toContainText('has no street door')
    await undo(page)
    await expect(sentence(page)).toContainText('Diwaniya has no street door')
    await undo(page)
    await expect(sentence(page)).not.toContainText('has no street door')
  })

  test('says the Entry has no door from outside once its street door is removed', async ({
    page,
  }) => {
    await clickAt(page, 17, 8)
    await expect(who(page)).toHaveText('Double street door on Entry')
    await page.keyboard.press('Delete')
    await expect(sentence(page)).toContainText('Entry has no door from outside')
    await undo(page)
    await expect(sentence(page)).not.toContainText('has no door from outside')
  })

  test('greys a room the walk cannot reach and names it', async ({ page }) => {
    await expect(page.locator('.room.unreached')).toHaveCount(0)
    await clickAt(page, 14.2, 7)
    await page.keyboard.press('Delete')
    await expect(page.locator(`.room.unreached[data-room="${FORMAL}"]`)).toBeVisible()
    await expect(sentence(page)).toContainText('Walk 16 of 17 reached from outside')
    await expect(sentence(page)).toContainText('not reached: Formal Living')
    await undo(page)
    await expect(page.locator('.room.unreached')).toHaveCount(0)
  })

  test('slides a door along its wall with the arrows', async ({ page }) => {
    await clickAt(page, 7.15, 16.37)
    await expect(who(page)).toHaveText('Door on Kitchen')
    const before = await selectedDoorBox(page)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    const after = await selectedDoorBox(page)
    expect(after.x).toBeLessThan(before.x - 1)
    await expect(who(page)).toHaveText('Door on Kitchen')
    await undo(page)
    await undo(page)
    expect((await selectedDoorBox(page)).x).toBeCloseTo(before.x, 0)
  })

  test('offers swing, hinge and remove on a right-click, and removes the door', async ({
    page,
  }) => {
    const before = await doors(page).count()
    const at = await onSheet(page, 7.15, 16.37)
    await page.mouse.click(at.x, at.y, { button: 'right' })
    const menu = page.locator('.ctx')
    await expect(menu.locator('.head')).toHaveText('Door · Kitchen')
    await expect(menu.getByRole('button', { name: /Swing the other way/ })).toBeVisible()
    await expect(menu.getByRole('button', { name: /Hinge on the other side/ })).toBeVisible()
    await menu.getByRole('button', { name: /Remove/ }).click()
    expect(await doors(page).count()).toBe(before - 1)
    await undo(page)
    expect(await doors(page).count()).toBe(before)
  })

  test('draws no door while its two rooms stand apart, Check says not met, and it returns with them', async ({
    page,
  }) => {
    const before = await doors(page).count()
    // in Zoning, the Store is moved off the Kitchen it has its door into
    await page.getByRole('button', { name: 'Zoning', exact: true }).click()
    await drag(page, await onSheet(page, 3, 18.8), await onSheet(page, 3, 13.5))
    await page.getByRole('button', { name: 'Openings', exact: true }).click()
    expect(await doors(page).count()).toBe(before - 1)
    await page.getByRole('button', { name: 'Check', exact: true }).click()
    await expect(sentence(page)).toContainText(/Check [1-9]\d* connections? not met/)
    await expect(page.locator('.door-lost')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Put on the nearest wall' })).toHaveCount(0)
    await undo(page)
    expect(await doors(page).count()).toBe(before)
    await expect(sentence(page)).toContainText('Check 0 connections not met')
  })

  test('lights a room’s walls when it is clicked in the program list', async ({ page }) => {
    await expect(page.locator('.room.lit')).toHaveCount(0)
    await page.locator(`.tray .item[data-room="${FORMAL}"]`).click()
    await expect(page.locator(`.room.lit[data-room="${FORMAL}"]`)).toBeVisible()
    await page.locator(`.tray .item[data-room="${FORMAL}"]`).click()
    await expect(page.locator('.room.lit')).toHaveCount(0)
  })

  test('drags a door along its wall, and never off it onto another', async ({ page }) => {
    await clickAt(page, 7.15, 16.37)
    await expect(who(page)).toHaveText('Door on Kitchen')
    const home = await selectedDoorBox(page)
    await drag(page, await onSheet(page, 7.15, 16.37), await onSheet(page, 5.5, 16.6))
    const slid = await selectedDoorBox(page)
    expect(slid.x).toBeLessThan(home.x - 20)
    expect(Math.abs(slid.y - home.y)).toBeLessThan(5)
    await drag(page, await onSheet(page, 5.5, 16.37), await onSheet(page, 6.13, 19.8))
    await expect(sentence(page)).toContainText(
      'A door stays on the wall Kitchen and service hallway share.',
    )
    await undo(page)
    const back = await selectedDoorBox(page)
    expect(Math.abs(back.x - home.x)).toBeLessThan(5)
  })
})

/** Where the selected door is drawn on the screen: the middle of its box. */
async function selectedDoorBox(page: Page): Promise<At> {
  const box = await page.locator('svg.sheet .door.selected').first().boundingBox()
  if (!box) throw new Error('no door is selected')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
