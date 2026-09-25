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
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
}

/** A room's bubble by the name it carries, on one storey's column. */
export function roomNamed(page: Page, name: string, storey = 0) {
  return page.locator(`.bubbles-sheet [data-room][data-name="${name}"][data-storey="${storey}"]`)
}

/** The middle of a room's circle on the screen. */
export async function centreOf(page: Page, name: string, storey = 0) {
  const box = await roomNamed(page, name, storey).locator('.bubble-shape').boundingBox()
  if (!box) throw new Error(`${name} is not drawn on storey ${storey}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The small ring on a bubble's rim that a connection is dragged from. */
export async function reachOf(page: Page, name: string, storey = 0) {
  const box = await roomNamed(page, name, storey).locator('.reach').boundingBox()
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

/** A connection drawn by hand: from the ring on one room to the middle of the other. */
export async function connect(page: Page, from: string, to: string, storey = 0) {
  await page.mouse.move(
    (await centreOf(page, from, storey)).x,
    (await centreOf(page, from, storey)).y,
  )
  await drag(page, await reachOf(page, from, storey), await centreOf(page, to, storey))
}

export async function selectRoom(page: Page, name: string, storey = 0) {
  const at = await centreOf(page, name, storey)
  await page.mouse.click(at.x, at.y)
  await expect(roomNamed(page, name, storey)).toHaveClass(/bubble-selected/)
}

type Saved = {
  rooms: { id: string; name: string; storey: number; bubble?: { x: number; y: number } }[]
  edges: { id: string; a: string; b: string; kind: string; storey: number }[]
  apart?: { id: string; a: string; b: string }[]
}

/** The project as the autosave last wrote it, which is a moment after the last edit. */
export async function saved(page: Page): Promise<Saved> {
  const project = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('cde.project') ?? '{}'),
  )
  return { rooms: [], edges: [], ...project }
}

const pairName = (a: string, b: string) => [a, b].sort((x, y) => (x < y ? -1 : 1)).join(' to ')

/** Every edge as the two names it joins, sorted, so a test reads the graph as a person would. */
export async function linkedPairs(page: Page): Promise<readonly string[]> {
  const project = await saved(page)
  const name = (id: string) => project.rooms?.find((room) => room.id === id)?.name ?? 'Outside'
  return (project.edges ?? []).map((edge) => pairName(name(edge.a), name(edge.b))).sort()
}

/** The edge between two rooms by name, as the autosave has it. */
export async function edgeBetween(page: Page, one: string, other: string) {
  const project = await saved(page)
  const id = (name: string) => project.rooms.find((room) => room.name === name)?.id
  const [a, b] = [id(one), id(other)]
  return project.edges.find(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  )
}

/** The storey the program table gives a room, by the name in its row. */
export async function storeyOf(page: Page, name: string): Promise<string> {
  return page.locator('table.program tbody tr').evaluateAll((rows, wanted) => {
    for (const row of rows) {
      const named = row.querySelector('input[aria-label="Room name"]')
      const storey = row.querySelector('select[aria-label="Storey"]')
      if (!(named instanceof HTMLInputElement) || !(storey instanceof HTMLSelectElement)) continue
      if (named.value === wanted) return storey.options[storey.selectedIndex]?.text ?? ''
    }
    return ''
  }, name)
}
