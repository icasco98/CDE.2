import { expect, test, type Page } from '@playwright/test'

/**
 * The Openings step, on the embedded sample. Every case is one thing an architect does to a door,
 * and each one puts the sheet back with Ctrl+Z.
 */

type At = { x: number; y: number }

/** The ids the embedded sheet gives its rooms, so a test can name one without hunting for it. */
const FORMAL = 'r6'

async function openStep(page: Page): Promise<void> {
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

  test('puts one door on the Kitchen’s wall to the service hallway, and it serves both', async ({
    page,
  }) => {
    const before = await doors(page).count()
    await expect(sentence(page)).toContainText('service hallway serves 4 doors')
    await arm(page, 'Door')
    await page.getByLabel('Door width in metres').fill('1.2')
    await page.getByLabel('Door width in metres').press('Enter')
    await clickAt(page, 4, 16.37)
    expect(await doors(page).count()).toBe(before + 1)
    await expect(who(page)).toHaveText('Door on Kitchen')
    await expect(page.locator('.door-ctl .w')).toHaveText('1.2 m')
    await expect(sentence(page)).toContainText('service hallway serves 5 doors')
    await undo(page)
    await expect(sentence(page)).toContainText('service hallway serves 4 doors')
    expect(await doors(page).count()).toBe(before)
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

  test('rings a door whose wall moved away, and puts it back on the nearest wall', async ({
    page,
  }) => {
    await expect(sentence(page)).toContainText('1 door lost its wall: click the red ring')
    // in Zoning, the Kitchen's north wall is pulled two metres off the door standing on it
    await page.getByRole('button', { name: 'Zoning', exact: true }).click()
    await page.locator('svg.sheet g.room[data-room="r8"] path.body').click()
    await drag(page, await onSheet(page, 4.6, 16.37), await onSheet(page, 4.6, 18.6))
    await page.getByRole('button', { name: 'Openings', exact: true }).click()
    await expect(page.locator('svg.sheet .door-lost')).toHaveCount(2)
    await expect(sentence(page)).toContainText('2 doors lost their wall: click the red ring')

    await clickRingOnSheet(page)
    await expect(who(page)).toHaveText(/lost its wall$/)
    await page.locator('.door-ctl').getByRole('button', { name: 'Put on the nearest wall' }).click()
    await expect(page.locator('svg.sheet .door-lost')).toHaveCount(1)
    await undo(page)
    await expect(page.locator('svg.sheet .door-lost')).toHaveCount(2)
    await undo(page)
    await expect(page.locator('svg.sheet .door-lost')).toHaveCount(1)
  })

  test('lights a room’s walls when it is clicked in the program list', async ({ page }) => {
    await expect(page.locator('.room.lit')).toHaveCount(0)
    await page.locator(`.tray .item[data-room="${FORMAL}"]`).click()
    await expect(page.locator(`.room.lit[data-room="${FORMAL}"]`)).toBeVisible()
    await page.locator(`.tray .item[data-room="${FORMAL}"]`).click()
    await expect(page.locator('.room.lit')).toHaveCount(0)
  })

  test('drags a door a metre off its wall and onto another', async ({ page }) => {
    await clickAt(page, 7.15, 16.37)
    await expect(who(page)).toHaveText('Door on Kitchen')
    await drag(page, await onSheet(page, 7.15, 16.37), await onSheet(page, 6.13, 19.8))
    await expect(who(page)).toHaveText(/Door on (Kitchen|Driver Room)/)
    const landed = await selectedDoorBox(page)
    const target = await onSheet(page, 6.13, 19.8)
    expect(Math.abs(landed.y - target.y)).toBeLessThan(20)
    await undo(page)
    const back = await selectedDoorBox(page)
    const home = await onSheet(page, 7.15, 16.37)
    expect(Math.abs(back.y - home.y)).toBeLessThan(20)
  })
})

/**
 * The ring of a lost door that is drawn inside the sheet's box. The sample's own lost door was left
 * far outside the plot, where the camera never reaches, so the test makes one of its own.
 */
async function clickRingOnSheet(page: Page): Promise<void> {
  const box = await page.locator('.sheet-box').boundingBox()
  if (!box) throw new Error('there is no sheet box')
  const rings = await page
    .locator('svg.sheet .door-lost')
    .evaluateAll((marks) => marks.map((mark) => mark.getBoundingClientRect().toJSON()))
  const on = rings.find(
    (r) => r.x > box.x && r.x < box.x + box.width && r.y > box.y && r.y < box.y + box.height,
  )
  if (!on) throw new Error('no ring stands on the sheet')
  await page.mouse.click(on.x + on.width / 2, on.y + on.height / 2)
}

/** Where the selected door is drawn on the screen: the middle of its box. */
async function selectedDoorBox(page: Page): Promise<At> {
  const box = await page.locator('svg.sheet .door.selected').first().boundingBox()
  if (!box) throw new Error('no door is selected')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
