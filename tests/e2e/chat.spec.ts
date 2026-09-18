import { expect, test, type Page } from '@playwright/test'

/**
 * The chat column on the Sheet, with a fake runtime injected before the page loads: its `sample`
 * calls the tools the page hands it, so the sheet is worked in front of the owner without a model.
 */

const DIWANIYA = 'r2'
const BEDROOM = 'nmu436pzls0vk'

/**
 * The fake `window.claude`: `use('sample')` gives a function that places one room, waits for the
 * test to let it go, places a second, streams a line and resolves.
 */
async function fakeRuntime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const gate = { go: () => {} }
    const held = new Promise<void>((resolve) => {
      gate.go = resolve
    })
    Object.assign(window, { releaseAgent: () => gate.go() })
    type Tool = { name: string; execute: (input: Record<string, unknown>) => unknown }
    type Options = { tools?: Tool[]; onText?: (update: { text: string; delta: string }) => void }
    const sample = async (_input: unknown, options?: Options) => {
      const tools = options?.tools ?? []
      const call = (name: string, input: Record<string, unknown>) => {
        const tool = tools.find((t) => t.name === name)
        if (!tool) throw new Error(`no tool called ${name}`)
        return tool.execute(input)
      }
      call('place_rooms', { moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
      await held
      call('place_rooms', { moves: [{ name: 'Diwaniya', x: 14, y: 18, angle: 0 }] })
      call('remember', { note: 'the diwaniya sits square to the street' })
      const text = 'Bedroom beside Formal Living, diwaniya square on the street corner.'
      options?.onText?.({ text, delta: text })
      return { text, truncated: false }
    }
    Object.assign(window, {
      claude: {
        use: async (name: string) => (name === 'sample' ? sample : null),
      },
    })
  })
}

/** The memory read after the save has had its moment, so a test never reads a stale store. */
async function memoryReader(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.assign(window, {
      settled: async () => {
        await new Promise((go) => window.setTimeout(go, 700))
        return JSON.parse(window.localStorage.getItem('cde.agent.memory') ?? '{}')
      },
    })
  })
}

async function openSheet(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
}

const log = (page: Page) => page.locator('.chat .log')
const chatLine = (page: Page) => page.getByLabel('Say something to the assistant')
const room = (page: Page, id: string) => page.locator(`svg.sheet g.room[data-room="${id}"]`)

async function say(page: Page, text: string): Promise<void> {
  await chatLine(page).fill(text)
  await page.locator('.chat').getByRole('button', { name: 'Say' }).click()
}

const median = (numbers: number[]): number => {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (!sorted.length) throw new Error('no frames were measured')
  return sorted[Math.floor(sorted.length / 2)]!
}

/** Where a room's frame stands, read from the sheet's own report through the program block. */
const areaOf = (page: Page, id: string) => page.locator(`.tray .item[data-room="${id}"] .a`)

test.use({ viewport: { width: 1600, height: 1100 } })

test.describe('the assistant on the sheet', () => {
  test.beforeEach(async ({ page }) => {
    await fakeRuntime(page)
    await memoryReader(page)
    await openSheet(page)
  })

  test('says it is working the moment Say is pressed', async ({ page }) => {
    await say(page, 'lay out the ground floor')
    await expect(log(page).getByText('Working…')).toBeVisible()
    await expect(log(page).locator('.spin')).toBeVisible()
    await page.evaluate(() => window.releaseAgent())
    await expect(log(page).getByText('Working…')).toHaveCount(0)
  })

  test('shows the first batch on the sheet before the second is asked for', async ({ page }) => {
    await expect(room(page, BEDROOM)).toHaveCount(0)
    await say(page, 'lay out the ground floor')
    // the first call has landed and been drawn while the assistant is still waiting
    await expect(room(page, BEDROOM)).toHaveCount(1)
    await expect(log(page).getByText(/placed 18 of 18/)).toBeVisible()
    await expect(log(page).getByText(/Diwaniya at/)).toHaveCount(0)
    await page.evaluate(() => window.releaseAgent())
    await expect(log(page).getByText(/Diwaniya at/)).toBeVisible()
    await expect(
      log(page).getByText('Bedroom beside Formal Living, diwaniya square on the street corner.'),
    ).toBeVisible()
  })

  test('takes back everything one message did with one Ctrl+Z', async ({ page }) => {
    const before = await areaOf(page, DIWANIYA).textContent()
    await say(page, 'lay out the ground floor')
    await page.evaluate(() => window.releaseAgent())
    await expect(log(page).getByText(/Diwaniya at/)).toBeVisible()
    await expect(room(page, BEDROOM)).toHaveCount(1)
    await page.locator('svg.sheet').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+z')
    await expect(room(page, BEDROOM)).toHaveCount(0)
    await expect(areaOf(page, DIWANIYA)).toHaveText(before ?? '')
  })

  test('keeps the sheet and the memory across a reload', async ({ page }) => {
    await say(page, 'lay out the ground floor')
    await page.evaluate(() => window.releaseAgent())
    await expect(log(page).getByText(/Diwaniya at/)).toBeVisible()
    await page.locator('.chat').getByRole('button', { name: 'Keep this plan' }).click()
    const kept = await page.evaluate(() => window.settled())
    expect(JSON.stringify(kept)).toContain('lay out the ground floor')
    expect(JSON.stringify(kept)).toContain('the diwaniya sits square to the street')
    expect(kept.plans[0]!.name).toContain('Ground kept')
    expect(await page.evaluate(() => window.localStorage.getItem('cde.sheet'))).toContain('Bedroom')

    await openSheet(page)
    await expect(room(page, BEDROOM)).toHaveCount(1)
    const memory = await page.evaluate(() => window.settled())
    expect(memory.plans).toHaveLength(1)
    expect(memory.feedback).toHaveLength(1)
  })

  test('keeps the line as a note and says so where the assistant cannot be reached', async ({
    browser,
  }) => {
    const bare = await browser.newPage()
    await memoryReader(bare)
    await bare.goto('/')
    await bare.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
    await bare.locator('svg.sheet').waitFor()
    await chatLine(bare).fill('the diwaniya goes on the corner')
    await bare.locator('.chat').getByRole('button', { name: 'Say' }).click()
    await expect(bare.locator('.chat .log .quiet').last()).toContainText('only from the link')
    const memory = await bare.evaluate(() => window.settled())
    expect(memory.notes[0]!.text).toBe('the diwaniya goes on the corner')
    await bare.close()
  })

  test('re-renders the sheet between tool calls, as dearly as a change by hand', async ({
    page,
  }) => {
    // The budget is the hand's own committed change on this machine: the assistant may not cost more
    // than twice what a nudge costs, measured the same way in the same run.
    await page.locator('svg.sheet g.room[data-room="r6"] path.body').click()
    await page.evaluate(() => {
      window.sheetFrames = []
    })
    for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight')
    const byHand = median(await page.evaluate(() => window.sheetFrames ?? []))

    await page.evaluate(() => {
      window.sheetFrames = []
    })
    await say(page, 'lay out the ground floor')
    await expect(room(page, BEDROOM)).toHaveCount(1)
    await page.evaluate(() => window.releaseAgent())
    await expect(log(page).getByText(/Diwaniya at/)).toBeVisible()
    const frames: number[] = await page.evaluate(() => window.sheetFrames ?? [])
    expect(frames.length).toBeGreaterThan(1)
    console.log(
      `sheet frame: ${median(frames).toFixed(1)} ms while the assistant works, ${byHand.toFixed(1)} ms for a nudge by hand`,
    )
    expect(median(frames)).toBeLessThan(byHand * 2)
  })
})

type Kept = {
  feedback: { text: string }[]
  notes: { text: string }[]
  plans: { name: string; rooms: unknown[] }[]
}

declare global {
  interface Window {
    releaseAgent: () => void
    sheetFrames?: number[]
    /** The memory as the browser holds it, once the debounced save has run. */
    settled: () => Promise<Kept>
  }
}
