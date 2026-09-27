import { type Page } from '@playwright/test'
import { PROJECT_VERSION, type Edge, type Project } from '../../src/model'
import { FIXTURE_EDGES, fixtureSheet } from '../../src/sheet/fixture'
import { SETTINGS_V, storeyOf } from '../../src/sheet/model'

/**
 * A drawn plan to test the sheet on: the test plan's rooms as a project's program, standing on the
 * corner plot they were drawn for, and the same rooms saved as the sheet. The sheet draws the
 * project's rooms and no other, so a test that wants rooms on the sheet brings a project with them.
 */
export function plan(input: { edges?: Edge[] } = {}) {
  const sheet = fixtureSheet()
  const project: Project = {
    id: 'project-plan',
    name: 'Test plan',
    storeys: 2,
    heights: [3.5, 3.5],
    plot: {
      on: true,
      polygon: [
        [0, 0],
        [20, 0],
        [20, 25],
        [0, 25],
      ],
      north: 25,
      street: [1, 2],
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
    rooms: sheet.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      // every kind the plan draws is a room-type of the rulebook by the same name
      type: r.kind,
      storey: r.kind === 'stair' ? 0 : storeyOf(r),
      storeysSpanned: r.kind === 'stair' ? 2 : 1,
      targetArea: r.target,
      pinned: false,
    })),
    edges: input.edges ?? FIXTURE_EDGES,
    apart: [],
    declined: [],
    actors: [],
    version: PROJECT_VERSION,
  }
  const kept = {
    rooms: sheet.rooms,
    storeyCount: sheet.storeyCount,
    settings: { ...sheet.settings, v: SETTINGS_V },
    format: 2,
  }
  return { project, sheet: kept }
}

/**
 * The plan put in this browser's storage before the page opens, once: a reload inside the test
 * finds what the test did, not the plan again.
 */
export async function seedPlan(page: Page, input: Parameters<typeof plan>[0] = {}): Promise<void> {
  const { project, sheet } = plan(input)
  await page.addInitScript(
    (held) => {
      if (window.localStorage.getItem('cde.test.seeded')) return
      window.localStorage.setItem('cde.test.seeded', '1')
      window.localStorage.setItem('cde.project', held.project)
      window.localStorage.setItem('cde.sheet', held.sheet)
    },
    { project: JSON.stringify(project), sheet: JSON.stringify(sheet) },
  )
}
