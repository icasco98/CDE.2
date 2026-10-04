import { expect, type Page } from '@playwright/test'
import { tab } from './tabs'

/** A villa of this many storeys rebuilt from the household, opened on the bubble diagram. */
export async function openVilla(
  page: Page,
  { storeys = 2, masterOnGround = false }: { storeys?: number; masterOnGround?: boolean } = {},
) {
  await page.goto('/')
  for (let more = 1; more < storeys; more++)
    await page.getByRole('button', { name: 'Add storey' }).click()
  if (masterOnGround) await page.getByLabel('Master bedroom on the ground floor').check()
  await page.getByRole('button', { name: /rebuild program from household/i }).click()
  await tab(page, 'Bubbles').click()
  await expect(page.locator('svg g[data-zone]').first()).toBeVisible()
}

/** A zone's bubble by the name it carries, on one storey's column. */
export function zoneNamed(page: Page, name: string, storey = 0) {
  return page.locator(`.bubbles-sheet [data-zone][data-name="${name}"][data-storey="${storey}"]`)
}

/** The middle of a zone's circle on the screen. */
export async function centreOf(page: Page, name: string, storey = 0) {
  const box = await zoneNamed(page, name, storey).locator('.bubble-shape').boundingBox()
  if (!box) throw new Error(`${name} is not drawn on storey ${storey}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The small ring on a bubble's rim that a connection is dragged from. */
export async function reachOf(page: Page, name: string, storey = 0) {
  const box = await zoneNamed(page, name, storey).locator('.reach').boundingBox()
  if (!box) throw new Error(`${name} has no ring on storey ${storey}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

/** A connection drawn by hand: from the ring on one zone to the middle of the other. */
export async function connect(page: Page, from: string, to: string, storey = 0) {
  await page.mouse.move(
    (await centreOf(page, from, storey)).x,
    (await centreOf(page, from, storey)).y,
  )
  await drag(page, await reachOf(page, from, storey), await centreOf(page, to, storey))
}

export async function selectZone(page: Page, name: string, storey = 0) {
  const at = await centreOf(page, name, storey)
  await page.mouse.click(at.x, at.y)
  await expect(zoneNamed(page, name, storey)).toHaveClass(/bubble-selected/)
}

type Saved = {
  zones: {
    id: string
    name: string
    storey: number
    targetArea: number
    bubble?: { x: number; y: number }
  }[]
  connections: { id: string; a: string; b: string; kind: string; storey: number }[]
  apart?: { id: string; a: string; b: string }[]
}

/** The project as the autosave last wrote it, which is a moment after the last edit. */
export async function saved(page: Page): Promise<Saved> {
  const project = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('cde.project') ?? '{}'),
  )
  return { zones: [], connections: [], ...project }
}

const pairName = (a: string, b: string) => [a, b].sort((x, y) => (x < y ? -1 : 1)).join(' to ')

/** Every connection as the two names it joins, sorted, so a test reads the graph as a person would. */
export async function connectedPairs(page: Page): Promise<readonly string[]> {
  const project = await saved(page)
  const name = (id: string) => project.zones?.find((zone) => zone.id === id)?.name ?? 'Outside'
  return (project.connections ?? [])
    .map((connection) => pairName(name(connection.a), name(connection.b)))
    .sort()
}

/** The connection between two zones by name, as the autosave has it. */
export async function connectionBetween(page: Page, one: string, other: string) {
  const project = await saved(page)
  const id = (name: string) => project.zones.find((zone) => zone.name === name)?.id
  const [a, b] = [id(one), id(other)]
  return project.connections.find(
    (connection) =>
      (connection.a === a && connection.b === b) || (connection.a === b && connection.b === a),
  )
}

/** The storey the program table gives a zone, by the name in its row. */
export async function storeyOf(page: Page, name: string): Promise<string> {
  return page.locator('table.program tbody tr').evaluateAll((rows, wanted) => {
    for (const row of rows) {
      const named = row.querySelector('input[aria-label="Zone name"]')
      const storey = row.querySelector('select[aria-label="Storey"]')
      if (!(named instanceof HTMLInputElement) || !(storey instanceof HTMLSelectElement)) continue
      if (named.value === wanted) return storey.options[storey.selectedIndex]?.text ?? ''
    }
    return ''
  }, name)
}
