import { expect, test, type Page } from '@playwright/test'
import { tab } from './plan'

/*
 * The walls and the site forces as a person meets them: what the sliders do to the picture, what a
 * walled bubble does under the hand, what the brief says about a program geometry cannot give, and
 * what the two site answers change.
 */

async function resting(page: Page) {
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
}

/** A villa of this many storeys, rebuilt from the household, with the plot binding. */
async function openVilla(page: Page, storeys = 2) {
  await page.goto('/')
  await page.getByLabel('Hold rooms inside the plot').check()
  for (let more = 1; more < storeys; more++)
    await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  await resting(page)
}

async function settle(page: Page) {
  await page.getByRole('button', { name: 'Settle now' }).click()
  await resting(page)
}

/** Every bubble on the sheet, in plot metres, by the name of the room it draws. */
async function places(page: Page) {
  return page.$$eval('[data-bubble]', (shapes) =>
    shapes.map((shape) => ({
      name: shape.closest('[data-room]')?.getAttribute('data-name') ?? '',
      x: Number(shape.getAttribute('data-x')),
      y: Number(shape.getAttribute('data-y')),
      radius: Number(shape.getAttribute('data-radius')),
      half: Number(shape.getAttribute('data-half') ?? 0),
      angle: Number(shape.getAttribute('data-angle') ?? 0),
    })),
  )
}

async function placeOf(page: Page, name: string) {
  const found = (await places(page)).find((place) => place.name === name)
  if (!found) throw new Error(`${name} is not on the sheet`)
  return found
}

function weight(page: Page, family: string) {
  return page.getByRole('slider', { name: family })
}

test('raising the site weight takes a garage bay to a side boundary and the kitchen to the back', async ({
  page,
}) => {
  await openVilla(page, 2)
  await weight(page, 'Site constraints').fill('0')
  await settle(page)
  const looseKitchen = await placeOf(page, 'Kitchen')
  const looseBay = await placeOf(page, 'Garage bay 1')

  await weight(page, 'Site constraints').fill('1')
  await settle(page)
  const kitchen = await placeOf(page, 'Kitchen')
  const bay = await placeOf(page, 'Garage bay 1')
  const other = await placeOf(page, 'Garage bay 2')

  // The street is the south side, so the back of this plot is the top of the sheet and S8 takes
  // the kitchen there.
  expect(kitchen.y).toBeLessThan(looseKitchen.y - 0.5)
  expect(kitchen.y).toBeLessThan(12)
  // S2 gathers the bays side by side: each stands against the kerb the setbacks leave, and the
  // two of them stand next to each other on it rather than at opposite ends of the frontage.
  expect(bay.y + bay.radius).toBeCloseTo(23, 1)
  expect(other.y + other.radius).toBeCloseTo(23, 1)
  expect(looseBay.y + looseBay.radius).toBeCloseTo(23, 1)
  expect(Math.abs(bay.x - other.x)).toBeLessThanOrEqual(bay.radius + other.radius + 0.1)
})

test('the entry cannot be dragged off the kerb; it slides along it', async ({ page }) => {
  await openVilla(page, 1)
  await settle(page)
  const entry = await placeOf(page, 'Entry')
  const on = async (x: number, y: number) =>
    page.evaluate(
      ([mx, my]) => {
        const sheet = document.querySelector('svg.bubbles-sheet')
        const screen = sheet instanceof SVGSVGElement ? sheet.getScreenCTM() : null
        if (!screen) throw new Error('there is no sheet')
        const point = new DOMPoint(mx, my).matrixTransform(screen)
        return { x: point.x, y: point.y }
      },
      [x, y],
    )
  const from = await on(entry.x, entry.y)
  // Into the middle of the plot, a long way off the kerb, and across it at the same time.
  const to = await on(entry.x - 5, 8)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  const held = await placeOf(page, 'Entry')
  expect(held.y + held.radius).toBeCloseTo(23, 1)
  expect(held.x).toBeLessThan(entry.x)
  await page.mouse.up()
  await resting(page)
  const rested = await placeOf(page, 'Entry')
  expect(rested.y + rested.radius).toBeCloseTo(23, 1)
})

test('the same program settles to the same picture twice from a fresh project', async ({
  page,
}) => {
  await openVilla(page, 2)
  await settle(page)
  const first = await places(page)

  // Everything the project was is forgotten, so the second run really starts from nothing.
  await page.evaluate(() => window.localStorage.clear())
  await openVilla(page, 2)
  await settle(page)
  const second = await places(page)

  expect(second.map((place) => place.name)).toEqual(first.map((place) => place.name))
  for (const [index, place] of first.entries()) {
    expect(second[index]!.x).toBeCloseTo(place.x, 2)
    expect(second[index]!.y).toBeCloseTo(place.y, 2)
  }
})

/** A brief written straight into the autosave, so a program can be asked for before it is drawn. */
async function seed(page: Page, project: unknown) {
  await page.addInitScript((stored) => {
    window.localStorage.setItem('cde.project', stored as string)
  }, JSON.stringify(project))
}

test('a brief asking a 5 m² WC to touch four rooms says so on the Requirements screen', async ({
  page,
}) => {
  const room = (id: string, name: string, type: string, targetArea: number) => ({
    id,
    name,
    type,
    storey: 0,
    storeysSpanned: 1,
    targetArea,
    pinned: false,
  })
  await seed(page, {
    id: 'project_z2',
    name: 'Over-linked WC',
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
    site: { diwaniyaAtCorner: false, garden: 'rear' },
    household: {
      familySize: 4,
      bedrooms: 0,
      cars: 0,
      maid: false,
      driver: false,
      womensReception: false,
      masterOnGround: false,
    },
    rooms: [
      room('room_wc', 'Diwaniya WC', 'diwaniya-wc', 5),
      room('room_d', 'Diwaniya', 'diwaniya', 45),
      room('room_f', 'Formal Living', 'formal-living', 30),
      room('room_g', 'Dining Room', 'dining-room', 24),
      room('room_h', 'Family Living', 'family-living', 32),
    ],
    edges: [
      { id: 'edge_1', a: 'room_wc', b: 'room_d', kind: 'door', storey: 0 },
      { id: 'edge_2', a: 'room_wc', b: 'room_f', kind: 'door', storey: 0 },
      { id: 'edge_3', a: 'room_wc', b: 'room_g', kind: 'door', storey: 0 },
      { id: 'edge_4', a: 'room_wc', b: 'room_h', kind: 'door', storey: 0 },
    ],
    weights: {},
    actors: [],
    version: 7,
  })
  await page.goto('/')
  await expect(page.locator('.findings')).toContainText(
    'Diwaniya WC is linked to four rooms; at 5 m² it can touch two. Remove a link.',
  )
})

test('the hallway is drawn as a capsule and the rooms stand along its sides', async ({ page }) => {
  await openVilla(page, 2)
  await settle(page)
  const drawn = await places(page)
  const corridor = drawn.find((place) => place.name === 'Ground Hallway')
  if (!corridor) throw new Error('there is no corridor')
  expect(corridor.half).toBeGreaterThan(1)
  expect(corridor.radius).toBeCloseTo(0.9, 6)

  // Rooms touch a corridor along its sides, so what is measured is the distance to its segment.
  const nearest = (x: number, y: number) => {
    const dx = Math.cos(corridor.angle) * corridor.half
    const dy = Math.sin(corridor.angle) * corridor.half
    const from = [corridor.x - dx, corridor.y - dy]
    const to = [corridor.x + dx, corridor.y + dy]
    const run = (to[0]! - from[0]!) ** 2 + (to[1]! - from[1]!) ** 2
    const along =
      run < 1e-9
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((x - from[0]!) * (to[0]! - from[0]!) + (y - from[1]!) * (to[1]! - from[1]!)) / run,
            ),
          )
    return Math.hypot(
      x - (from[0]! + (to[0]! - from[0]!) * along),
      y - (from[1]! + (to[1]! - from[1]!) * along),
    )
  }
  const touching = drawn.filter(
    (place) =>
      place.name !== 'Ground Hallway' &&
      place.half === 0 &&
      nearest(place.x, place.y) <= place.radius + corridor.radius + 0.1,
  )
  expect(touching.length).toBeGreaterThanOrEqual(5)
})

test('a bedroom moved to First says which door it let go', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByLabel('Master bedroom on the ground floor').check()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()

  const row = page
    .locator('table.program tbody tr')
    .filter({ has: page.getByLabel('Room name').and(page.locator('[value="Master Bedroom"]')) })
  await row.getByLabel('Storey').selectOption({ label: 'First' })
  await expect(page.locator('.messages')).toContainText(
    'Master Bedroom: its door to Ground Hallway was let go.',
  )
})

test('the two site answers change where the diwaniya and the family living room settle', async ({
  page,
}) => {
  /** A corner plot rebuilt from nothing, with the client's two answers given before it is drawn. */
  const built = async (corner: boolean, garden: string) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/')
    await page.getByLabel('Hold rooms inside the plot').check()
    await page.getByLabel('West side').check()
    if (corner) await page.getByLabel('Diwaniya at the corner').check()
    await page.getByLabel('Garden').selectOption(garden)
    await page.getByRole('button', { name: /rebuild program from household/i }).click()
    await tab(page, 'Bubbles').click()
    await weight(page, 'Site constraints').fill('1')
    await settle(page)
    return {
      diwaniya: await placeOf(page, 'Diwaniya'),
      family: await placeOf(page, 'Family Living'),
    }
  }

  const plain = await built(false, 'rear')
  const asked = await built(true, 'side')

  // Both answers change where the picture puts the room they act on: S4 moves the diwaniya once it
  // is asked to address the corner, and S5 moves the family living room off the rear when the
  // garden goes to a side. Which way each row pulls is the unit tests' to say; what a person sees
  // here is that answering the question changes the picture.
  expect(
    Math.hypot(asked.diwaniya.x - plain.diwaniya.x, asked.diwaniya.y - plain.diwaniya.y),
  ).toBeGreaterThan(1)
  expect(
    Math.hypot(asked.family.x - plain.family.x, asked.family.y - plain.family.y),
  ).toBeGreaterThan(1)
})
