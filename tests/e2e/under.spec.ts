import { expect, test } from '@playwright/test'
import { outlineOf } from '../../src/sheet/geometry'
import { fixtureSheet } from '../../src/sheet/fixture'
import { seedPlan } from './plan'
import { tab } from './tabs'

/*
 * The storey below is drawn faint under the one in hand. A room kept as several pieces is drawn
 * there by its outer edges only, not by the seams between its pieces.
 */

const DINING = 'r7'

/** The drawn path's segments, each as its two ends to the centimetre. */
function segmentsOf(d: string): string[] {
  const found = [...d.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)]
  return found.map((m) => {
    const [ax, ay, bx, by] = m.slice(1).map((v) => Number(v).toFixed(2))
    return [`${ax},${ay}`, `${bx},${by}`].sort().join(' ')
  })
}

test('a room of several pieces on the ground floor draws only its outline on the first floor', async ({
  page,
}) => {
  const dining = fixtureSheet().rooms.find((r) => r.id === DINING)!
  expect(dining.pieces!.length).toBeGreaterThan(1)
  const outline = outlineOf(dining)
    .map((s) =>
      [`${s.a[0].toFixed(2)},${s.a[1].toFixed(2)}`, `${s.b[0].toFixed(2)},${s.b[1].toFixed(2)}`]
        .sort()
        .join(' '),
    )
    .sort()

  await seedPlan(page)
  await page.goto('/')
  await tab(page, 'Zoning and 3D').click()
  await page.locator('.storeys button[data-storey="1"]').click()
  const drawn = page.locator(`svg.sheet g.room.under[data-under="${DINING}"] path`)
  await expect(drawn).toHaveCount(1)
  const d = (await drawn.getAttribute('d')) ?? ''
  expect(segmentsOf(d).sort()).toEqual(outline)
})
