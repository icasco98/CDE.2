import { expect, test, type Page } from '@playwright/test'
import { linkedPairs, saved } from './bubbles'
import { tab } from './tabs'

/*
 * Check on the zoning sheet: the project's edges drawn from the room under the hand and the room
 * selected, gone once the two rooms share a door's width of wall, and in the Openings step once a
 * door drawing the edge is placed; and the question a door asks between two rooms with no edge.
 */

type At = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }

test.use({ viewport: { width: 1500, height: 1100 } })

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

async function drag(page: Page, from: At, to: At, steps = 8) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    )
  await page.mouse.up()
}

async function idOf(page: Page, name: string): Promise<string> {
  await expect.poll(async () => (await saved(page)).rooms.length).toBeGreaterThan(5)
  const room = (await saved(page)).rooms.find((each) => each.name === name)
  if (!room) throw new Error(`${name} is not in the program`)
  return room.id
}

/** A room's box on the sheet in metres, read off its frame and its drawn body. */
async function boxOf(page: Page, id: string): Promise<Box> {
  return page.evaluate((room) => {
    const g = document.querySelector(`svg.sheet g.room[data-room="${room}"]`)
    const body = g?.querySelector('path.body')
    const found = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g?.getAttribute('transform') ?? '')
    if (!found || !(body instanceof SVGGraphicsElement)) throw new Error(`${room} is not placed`)
    const b = body.getBBox()
    return { x: Number(found[1]) + b.x, y: Number(found[2]) + b.y, w: b.width, h: b.height }
  }, id)
}

/** A room dropped from the program with its middle at a point in metres. */
async function place(page: Page, id: string, x: number, y: number) {
  const block = page.locator(`.tray .item[data-room="${id}"] .n`)
  await block.scrollIntoViewIfNeeded()
  const at = await block.boundingBox()
  if (!at) throw new Error(`${id} is not in the program`)
  await drag(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 }, await onSheet(page, x, y))
  await expect(page.locator(`svg.sheet g.room[data-room="${id}"]`)).toHaveCount(1)
}

/** A placed room moved so its left wall stands on another's right wall, tops aligned. */
async function besideOf(page: Page, id: string, of: string) {
  const other = await boxOf(page, of)
  const mine = await boxOf(page, id)
  await drag(
    page,
    await onSheet(page, mine.x + mine.w * 0.25, mine.y + mine.h * 0.3),
    await onSheet(page, other.x + other.w + mine.w * 0.25, other.y + mine.h * 0.3),
  )
}

const check = (page: Page) => page.getByRole('button', { name: 'Check', exact: true })
const sentence = (page: Page) => page.locator('.say')
const line = (page: Page, a: string, b: string) =>
  page.locator(`svg.sheet [data-check-line="${a} ${b}"]`)

/** A one-storey villa rebuilt from the household, opened on the zoning sheet with its program waiting. */
async function openSheet(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()
}

async function hover(page: Page, id: string) {
  const box = await boxOf(page, id)
  const at = await onSheet(page, box.x + box.w / 2, box.y + box.h / 2)
  await page.mouse.move(at.x, at.y)
}

test('Check is off by default; on, a hovered room draws faint lines to its rooms, placed or in the program', async ({
  page,
}) => {
  await openSheet(page)
  const dining = await idOf(page, 'Dining Room')
  const kitchen = await idOf(page, 'Kitchen')
  const family = await idOf(page, 'Family Living')
  await place(page, dining, 9, 7)
  await place(page, kitchen, 6, 18)

  await hover(page, dining)
  await expect(page.locator('svg.sheet .check-line')).toHaveCount(0)
  await expect(page.locator('[data-tray-line]')).toHaveCount(0)
  await expect(check(page)).toHaveAttribute('aria-pressed', 'false')

  await check(page).click()
  await hover(page, dining)
  await expect(line(page, dining, kitchen)).toHaveClass(/check-line/)
  await expect(line(page, dining, kitchen)).not.toHaveClass(/bold/)
  await expect(page.locator(`[data-tray-line="${dining}-${family}"]`)).toHaveCount(1)
  await expect(sentence(page)).toContainText(/Check \d+ connections? not ready/)

  await check(page).click()
  await expect(page.locator('svg.sheet .check-line')).toHaveCount(0)
  await expect(page.locator('[data-tray-line]')).toHaveCount(0)
})

test('a selected room draws bold lines to its placed rooms, and a line goes once the two share a wall', async ({
  page,
}) => {
  await openSheet(page)
  const dining = await idOf(page, 'Dining Room')
  const kitchen = await idOf(page, 'Kitchen')
  await place(page, dining, 9, 7)
  await place(page, kitchen, 6, 18)
  await check(page).click()
  await page.locator(`.tray .item[data-room="${dining}"]`).click()
  await page.mouse.move(5, 5)
  await expect(line(page, dining, kitchen).and(page.locator('.bold'))).toHaveCount(1)

  await besideOf(page, kitchen, dining)
  await page.locator(`.tray .item[data-room="${dining}"]`).click()
  await expect(line(page, dining, kitchen)).toHaveCount(0)
})

/** Two rooms side by side, and the Openings step with a door armed. */
async function sideBySide(page: Page, left: string, right: string, opened = false) {
  if (!opened) await openSheet(page)
  const a = await idOf(page, left)
  const b = await idOf(page, right)
  await place(page, a, 7, 7)
  await place(page, b, 7, 17)
  await besideOf(page, b, a)
  await page.getByRole('button', { name: 'Openings', exact: true }).click()
  await page.locator('.grp.place').getByRole('button', { name: 'Door', exact: true }).click()
  const box = await boxOf(page, a)
  const other = await boxOf(page, b)
  const wall = { x: box.x + box.w, y: Math.max(box.y, other.y) + Math.min(box.h, other.h) / 2 }
  return { a, b, wall }
}

const doors = (page: Page) => page.locator('svg.sheet .door:not(.preview)')

test('in Openings a door on the wall of an edge meets it, and the line goes', async ({ page }) => {
  const { a: dining, b: kitchen, wall } = await sideBySide(page, 'Dining Room', 'Kitchen')
  await check(page).click()
  const before = await doors(page).count()
  await page.mouse.click(
    ...(Object.values(await onSheet(page, wall.x, wall.y)) as [number, number]),
  )
  await expect(page.getByRole('dialog', { name: 'Add connection' })).toHaveCount(0)
  await expect(doors(page)).toHaveCount(before + 1)
  await hover(page, dining)
  await expect(line(page, dining, kitchen)).toHaveCount(0)
})

test('a door between two rooms with no edge asks, and yes adds both as one undo step', async ({
  page,
}) => {
  const { wall } = await sideBySide(page, 'Kitchen', 'Formal Living')
  await expect.poll(() => linkedPairs(page)).not.toContain('Formal Living to Kitchen')
  const before = await doors(page).count()
  await page.mouse.click(
    ...(Object.values(await onSheet(page, wall.x, wall.y)) as [number, number]),
  )
  const offer = page.getByRole('dialog', { name: 'Add connection' })
  await expect(offer).toContainText(
    /Add connection (Kitchen ↔ Formal Living|Formal Living ↔ Kitchen)\?/,
  )
  await offer.getByRole('button', { name: 'Add connection' }).click()
  await expect(doors(page)).toHaveCount(before + 1)
  await expect.poll(() => linkedPairs(page)).toContain('Formal Living to Kitchen')

  await page.keyboard.press('Control+z')
  await expect(doors(page)).toHaveCount(before)
  await expect.poll(() => linkedPairs(page)).not.toContain('Formal Living to Kitchen')
})

test('a door between two rooms with no edge asks, and no places nothing', async ({ page }) => {
  const { wall } = await sideBySide(page, 'Kitchen', 'Formal Living')
  const before = await doors(page).count()
  await page.mouse.click(
    ...(Object.values(await onSheet(page, wall.x, wall.y)) as [number, number]),
  )
  const offer = page.getByRole('dialog', { name: 'Add connection' })
  await offer.getByRole('button', { name: 'Cancel' }).click()
  await expect(offer).toHaveCount(0)
  await expect(doors(page)).toHaveCount(before)
  await expect.poll(() => linkedPairs(page)).not.toContain('Formal Living to Kitchen')
})

test('a door joining a pair kept apart is crossed, and both rooms outlined where one is reached only through the other', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await page.getByRole('button', { name: 'Matrix' }).click()
  const matrix = page.getByRole('dialog', { name: 'Matrix' })
  const cell = matrix.getByRole('button', {
    name: /^(Kitchen and Dining Room|Dining Room and Kitchen)$/,
  })
  await cell.click()
  await matrix
    .getByRole('group', { name: 'Set the pair' })
    .getByRole('button', { name: 'Keep apart' })
    .click()
  await matrix.getByRole('button', { name: 'Close' }).click()
  await tab(page, 'Sheet').click()
  await page.locator('svg.sheet').waitFor()

  const { a: dining, b: kitchen, wall } = await sideBySide(page, 'Dining Room', 'Kitchen', true)
  await page.mouse.click(
    ...(Object.values(await onSheet(page, wall.x, wall.y)) as [number, number]),
  )
  await expect(page.locator('svg.sheet [data-apart-door]')).toHaveCount(0)
  await check(page).click()
  await expect(page.locator('svg.sheet [data-apart-door]')).toHaveCount(1)
  await expect(page.locator(`svg.sheet g.room[data-room="${kitchen}"]`)).toHaveClass(
    /apart-through/,
  )
  await expect(page.locator(`svg.sheet g.room[data-room="${dining}"]`)).toHaveClass(/apart-through/)
  await expect(sentence(page)).toContainText('1 keep-apart broken')
})

test.describe('on a short screen, where the program scrolls', () => {
  test.use({ viewport: { width: 1500, height: 640 } })

  /** Where a tray line ends, in page pixels. */
  async function endOf(page: Page, key: string) {
    return page.evaluate((wanted) => {
      const line = document.querySelector(`[data-tray-line="${wanted}"]`)
      const frame = line?.closest('svg')?.getBoundingClientRect()
      if (!(line instanceof SVGLineElement) || !frame) return null
      return { x: frame.left + line.x2.baseVal.value, y: frame.top + line.y2.baseVal.value }
    }, key)
  }

  /** How far a tray line's end stands from the right middle of what it points at, in pixels. */
  async function missBy(page: Page, key: string, selector: string) {
    const end = await endOf(page, key)
    const box = await page.locator(selector).boundingBox()
    if (!end || !box) return Infinity
    return Math.abs(end.x - box.x - box.width) + Math.abs(end.y - box.y - box.height / 2)
  }

  test('a line to a room in the program follows the list as it scrolls, and a tag brings it back', async ({
    page,
  }) => {
    await openSheet(page)
    const dining = await idOf(page, 'Dining Room')
    const family = await idOf(page, 'Family Living')
    await place(page, dining, 9, 7)
    await check(page).click()
    await page.locator(`.tray .item[data-room="${dining}"]`).click()
    await page.mouse.move(5, 5)
    const key = `${dining}-${family}`
    const block = `.tray .item[data-room="${family}"]`
    await expect(page.locator(block)).toHaveClass(/check-linked/)

    const tray = page.locator('.tray')
    await tray.evaluate((list, id) => {
      const item = list.querySelector(`.item[data-room="${id}"]`)
      item?.scrollIntoView({ block: 'center' })
    }, family)
    await expect.poll(() => missBy(page, key, block)).toBeLessThan(1.5)

    const arrow = await tray.evaluate((list, id) => {
      const item = list.querySelector(`.item[data-room="${id}"]`) as HTMLElement
      const low = item.offsetTop - (list as HTMLElement).offsetTop > list.scrollHeight / 2
      list.scrollTop = low ? 0 : list.scrollHeight
      return low ? '↓' : '↑'
    }, family)
    const tag = page.locator(`[data-tray-tag="${family}"]`)
    await expect(tag).toHaveText(`${arrow} Family Living`)
    await expect.poll(() => missBy(page, key, `[data-tray-tag="${family}"]`)).toBeLessThan(1.5)

    await tag.click()
    await expect(tag).toHaveCount(0)
    await expect.poll(() => missBy(page, key, block)).toBeLessThan(1.5)
  })

  test('measuring forty tray lines stays under 2 ms', async ({ page }) => {
    await openSheet(page)
    const dining = await idOf(page, 'Dining Room')
    await place(page, dining, 9, 7)
    const took = await page.evaluate(async (from) => {
      // Served by the dev server as the app loads it, so the timing is the running code's own.
      const url = '/src/views/sheet/trayReach.ts'
      const { measureTray }: typeof import('../../src/views/sheet/trayReach') = await import(
        /* @vite-ignore */ url
      )
      const svg = document.querySelector('svg.sheet') as SVGSVGElement
      const box = document.querySelector('.body-row') as HTMLElement
      const list = box.querySelector('.tray') as HTMLElement
      const ids = [...list.querySelectorAll<HTMLElement>('.item')].map((item) => item.dataset.room!)
      const lines = Array.from({ length: 40 }, (_, i) => ({ from, to: ids[i % ids.length]! }))
      let best = Infinity
      for (let round = 0; round < 10; round++) {
        // A scroll between rounds, so every measure reads a list that has just moved.
        list.scrollTop = round % 2 ? 0 : list.scrollHeight
        const started = performance.now()
        measureTray(lines, [{ id: from }], () => [9, 7], svg, box)
        best = Math.min(best, performance.now() - started)
      }
      return best
    }, dining)
    console.info(`tray measure, 40 lines: ${took.toFixed(3)} ms`)
    expect(took).toBeLessThan(2)
  })
})
