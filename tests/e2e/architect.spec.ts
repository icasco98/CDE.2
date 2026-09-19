import { expect, test, type Page } from '@playwright/test'
import { chatBox, log, memoryReader, openSheet, say } from './agent'

/**
 * The architect's own commands, with a fake runtime injected before the page loads: its `sample`
 * calls the tools the page hands it, in the order the test asks for, so the house is worked in front
 * of the owner without a model. What each tool gave back is kept for the test to read, because that
 * reading is what the architect reasons with.
 */

type Step = { tool: string; input: Record<string, unknown> }

type Plan = { first: Step[]; later?: Step[]; text?: string }

async function fakeArchitect(page: Page, plan: Plan): Promise<void> {
  await page.addInitScript((held: Plan) => {
    const calls: number[] = []
    const asks: string[] = []
    const results: unknown[] = []
    Object.assign(window, { agentCalls: calls, agentAsks: asks, agentResults: results })
    type Tool = { name: string; execute: (input: Record<string, unknown>) => unknown }
    type Options = { tools?: Tool[]; onText?: (update: { text: string; delta: string }) => void }
    const sample = async (input: { content: string }[], options?: Options) => {
      calls.push(input.length)
      asks.push(String(input[input.length - 1]?.content ?? ''))
      const tools = options?.tools ?? []
      for (const step of input.length === 1 ? held.first : (held.later ?? [])) {
        const tool = tools.find((one) => one.name === step.tool)
        if (!tool) throw new Error(`no tool called ${step.tool}`)
        results.push(tool.execute(step.input))
      }
      const text = input.length === 1 ? (held.text ?? 'Done.') : 'done'
      options?.onText?.({ text, delta: text })
      return { text, truncated: false }
    }
    Object.assign(window, {
      claude: { use: async (name: string) => (name === 'sample' ? sample : null) },
    })
  }, plan)
}

type House = {
  onScreen: string
  storeys: {
    storey: string
    placed: { name: string }[]
    sharing: { rooms: string[]; metres: number }[]
  }[]
}

/** What a command gives back: the house as it now stands, and what the call changed in it. */
type Reading = { landed: string[]; house: House } & House

const readings = (page: Page) => page.evaluate(() => window.agentResults as Reading[])

test.use({ viewport: { width: 1600, height: 1100 } })

test('two rooms put against each other share a wall', async ({ page }) => {
  await fakeArchitect(page, {
    first: [
      {
        tool: 'place_against',
        input: {
          placements: [
            { room: 'Bedroom', against: 'Family Living', wall: 'east', along: 'start' },
            { room: 'Guest WC', against: 'Bedroom', wall: 'south', along: 'start', w: 3, h: 2.5 },
          ],
        },
      },
    ],
    text: 'Bedroom beside the family living, guest WC under it.',
  })
  await openSheet(page)
  await say(page, 'put the bedroom against the family living')

  await expect(log(page).getByText(/placed against · Ground/)).toBeVisible()
  await expect(page.locator('svg.sheet g.room[data-room="nmu436pzls0vk"]')).toHaveCount(1)
  const [read] = await readings(page)
  const ground = read!.house.storeys[0]!
  expect(read!.landed[0]).toContain("against Family Living's east wall")
  const withLiving = ground.sharing.find(
    (pair) => pair.rooms.includes('Bedroom') && pair.rooms.includes('Family Living'),
  )
  const withWC = ground.sharing.find(
    (pair) => pair.rooms.includes('Bedroom') && pair.rooms.includes('Guest WC'),
  )
  expect(withLiving!.metres).toBeGreaterThan(1.5)
  expect(withWC!.metres).toBeGreaterThan(1.5)
})

test('working on the first storey leaves the storey the owner is looking at', async ({ page }) => {
  await fakeArchitect(page, {
    first: [
      { tool: 'place_rooms', input: { moves: [{ name: 'Bedroom', x: 6, y: 6 }], storey: 'First' } },
      { tool: 'read_sheet', input: {} },
    ],
    text: 'Bedroom upstairs, off the stair.',
  })
  await openSheet(page)
  const switcher = page.locator('.seg.storeys button[data-storey="0"]')
  await expect(switcher).toHaveClass(/on/)
  await say(page, 'put the bedroom on the first floor')

  await expect(log(page).getByText('Bedroom upstairs, off the stair.')).toBeVisible()
  // the owner is still on the ground, and the room is not drawn on it
  await expect(switcher).toHaveClass(/on/)
  await expect(page.locator('.seg.storeys button[data-storey="1"]')).not.toHaveClass(/on/)
  await expect(page.locator('svg.sheet g.room[data-room="nmu436pzls0vk"]')).toHaveCount(0)
  await expect(page.locator('.tray .item', { hasText: 'Bedroom' }).locator('.st')).toHaveText('1st')
  // the last call was read_sheet, which gives the house itself
  const read = (await readings(page)).at(-1)!
  expect(read.onScreen).toBe('Ground')
  expect(read.storeys[1]!.placed.map((r) => r.name)).toContain('Bedroom')
})

test('an architect that wrote nothing down is asked once, and its lessons are kept', async ({
  page,
}) => {
  await fakeArchitect(page, {
    first: [{ tool: 'place_rooms', input: { moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] } }],
    later: [
      {
        tool: 'remember',
        input: {
          note: 'the bedroom belongs against the formal living',
          request: 'let me draw a door',
        },
      },
    ],
    text: 'Bedroom is in.',
  })
  await memoryReader(page)
  await openSheet(page)
  await say(page, 'lay out the ground floor')

  await expect(log(page).getByText('Bedroom is in.')).toBeVisible()
  await expect(log(page).getByText(/noted · the bedroom belongs/)).toBeVisible()
  expect(await page.evaluate(() => window.agentCalls)).toEqual([1, 3])
  expect((await page.evaluate(() => window.agentAsks))[1]).toContain('what this turn taught you')
  const memory = await page.evaluate(() => window.settled())
  expect(memory.notes.map((line) => line.text)).toEqual([
    'the bedroom belongs against the formal living',
  ])
  expect(memory.requests.map((line) => line.text)).toEqual(['let me draw a door'])
})

test('one Ctrl+Z takes back everything a message did', async ({ page }) => {
  await fakeArchitect(page, {
    first: [
      {
        tool: 'place_against',
        input: {
          placements: [{ room: 'Bedroom', against: 'Family Living', wall: 'east', along: 'start' }],
        },
      },
      { tool: 'place_rooms', input: { moves: [{ name: 'Store', x: 2, y: 2 }] } },
    ],
    text: 'Bedroom in, store moved.',
  })
  await openSheet(page)
  const store = page.locator('.tray .item', { hasText: 'Store' }).locator('.a')
  const before = await store.textContent()
  await say(page, 'lay out the ground floor')
  await expect(log(page).getByText('Bedroom in, store moved.')).toBeVisible()
  await expect(page.locator('svg.sheet g.room[data-room="nmu436pzls0vk"]')).toHaveCount(1)

  await page.locator('svg.sheet').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+z')
  await expect(page.locator('svg.sheet g.room[data-room="nmu436pzls0vk"]')).toHaveCount(0)
  await expect(store).toHaveText(before ?? '')
})

test('the chat box grows with what is typed, and Shift+Enter makes a line', async ({ page }) => {
  await fakeArchitect(page, { first: [] })
  await openSheet(page)
  const box = chatBox(page)
  await box.click()
  await box.type('the diwaniya goes on the corner')
  const oneLine = (await box.boundingBox())!.height

  await box.press('Shift+Enter')
  await box.type('and the entry beside it')
  await box.press('Shift+Enter')
  await box.type('with the formal living behind')
  const threeLines = (await box.boundingBox())!.height
  expect(threeLines).toBeGreaterThan(oneLine + 10)
  // nothing was said: the lines are still in the box and the log is untouched
  await expect(log(page).getByText('Nothing said yet.')).toBeVisible()
  expect(await box.inputValue()).toContain('\nand the entry beside it\n')

  await box.press('Enter')
  await expect(log(page).locator('.you')).toContainText('with the formal living behind')
  expect(await box.inputValue()).toBe('')
})

declare global {
  interface Window {
    agentCalls: number[]
    agentAsks: string[]
    agentResults: unknown[]
  }
}
