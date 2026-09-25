import { type Page } from '@playwright/test'
import { seedPlan } from './plan'

/** What the chat column and the architect's commands are driven through, shared by both suites. */

/** The memory as the browser holds it, once the debounced save has run. */
export type Kept = {
  feedback: { text: string }[]
  notes: { text: string }[]
  requests: { text: string }[]
  plans: { name: string; rooms: unknown[] }[]
}

/** The memory read after the save has had its moment, so a test never reads a stale store. */
export async function memoryReader(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.assign(window, {
      settled: async () => {
        await new Promise((go) => window.setTimeout(go, 700))
        return JSON.parse(window.localStorage.getItem('cde.agent.memory') ?? '{}')
      },
    })
  })
}

export async function openSheet(page: Page): Promise<void> {
  await seedPlan(page)
  await page.goto('/')
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
}

export const log = (page: Page) => page.locator('.chat .log')

export const chatBox = (page: Page) => page.getByLabel('Say something to the assistant')

export async function say(page: Page, text: string): Promise<void> {
  await chatBox(page).fill(text)
  await page.locator('.chat').getByRole('button', { name: 'Say' }).click()
}

declare global {
  interface Window {
    settled: () => Promise<Kept>
  }
}
