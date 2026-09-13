import { expect, test, type Page } from '@playwright/test'
import { exported, textOf } from './exporting'
import { clickInside, openMass, openSheet } from './plan'

/**
 * The house the morph is read on: two storeys, the program rebuilt from the household with the
 * rulebook's default connections as edges, the plot binding and the bubbles settled, which is the
 * state a person reaches the Plan tab in.
 */
async function openZoning(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add storey' }).click()
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()

  await page.getByRole('button', { name: 'Bubbles', exact: true }).click()
  await expect(page.locator('svg g[data-room]').first()).toBeVisible()
  // Settled twice: the picture rests when nothing is moving fast, and a machine under load runs
  // fewer steps before that is true, so a second settle takes the diagram to the same rest.
  for (let again = 0; again < 2; again++) {
    await page.getByRole('button', { name: 'Settle now' }).click()
    await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
  }
  await openSheet(page)
}

/** The sentence each link the zones could not realize is drawn with. */
async function tensionsOn(page: Page): Promise<string[]> {
  return page.locator('[data-zone-tension] title').allTextContents()

  await openSheet(page)
}

type Zone = { id: string; name: string; corners: [number, number][] }

/** Every zone as the sheet draws it, in plot metres, which is what the sheet's own units are. */
async function zonesOn(page: Page): Promise<Zone[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet [data-zone]')].flatMap((group) => {
      const shape = group.querySelector('polygon')
      if (!(shape instanceof SVGPolygonElement)) return []
      const corners: [number, number][] = []
      for (let i = 0; i < shape.points.numberOfItems; i++) {
        const point = shape.points.getItem(i)
        corners.push([point.x, point.y])
      }
      const name = group.querySelector('.zone-name')?.textContent ?? ''
      return [{ id: group.getAttribute('data-zone') ?? '', name, corners }]
    }),
  )
}

/** Whether every wall of a zone runs one of the two ways the grid runs and no other. */
function square(corners: readonly [number, number][]): boolean {
  return corners.every((corner, index) => {
    const next = corners[(index + 1) % corners.length] as [number, number]
    return corner[0] === next[0] || corner[1] === next[1]
  })
}

/** Where every door mark sits and which way its wall runs, in the same metres. */
async function doorsOn(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet [data-zone-door]')].map((line) => {
      const read = (name: string): number => Number(line.getAttribute(name) ?? 0)
      return { x1: read('x1'), y1: read('y1'), x2: read('x2'), y2: read('y2') }
    }),
  )
}

/** How far each zone has opened, so the animation can be caught part way and at its end. */
async function opened(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg.zoning-sheet clipPath circle')].map((circle) =>
      Number(circle.getAttribute('r') ?? 0),
    ),
  )
}

function inside(corners: readonly [number, number][], x: number, y: number): boolean {
  let held = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i] as [number, number]
    const b = corners[j] as [number, number]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      held = !held
  }
  return held
}

test('Morph divides the storey among its bubbles, with no overlap and no gap', async ({ page }) => {
  await openZoning(page)
  await expect(page.locator('[data-zone]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Morph' }).click()
  const zones = await zonesOn(page)
  expect(zones.length).toBeGreaterThan(8)

  // No two zones lie over one another, sampled over the whole plot at a tenth of a metre.
  const over: string[] = []
  for (let x = 0.05; x < 20; x += 0.1)
    for (let y = 0.05; y < 25; y += 0.1) {
      const holding = zones.filter((zone) => inside(zone.corners, x, y))
      if (holding.length > 1) over.push(`${holding[0]?.id} and ${holding[1]?.id} at ${x},${y}`)
    }
  expect(over.slice(0, 3)).toEqual([])

  // And no gap: a step either side of every door lands in a zone, so the two rooms really meet.
  const doors = await doorsOn(page)
  expect(doors.length).toBeGreaterThan(4)
  const gaps: string[] = []
  for (const door of doors) {
    const run = Math.hypot(door.x2 - door.x1, door.y2 - door.y1) || 1
    const across: [number, number] = [-(door.y2 - door.y1) / run, (door.x2 - door.x1) / run]
    const middle: [number, number] = [(door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2]
    for (const side of [-1, 1]) {
      const at: [number, number] = [
        middle[0] + across[0] * side * 0.2,
        middle[1] + across[1] * side * 0.2,
      ]
      if (!zones.some((zone) => inside(zone.corners, at[0], at[1])))
        gaps.push(`${at[0].toFixed(2)},${at[1].toFixed(2)}`)
    }
  }
  expect(gaps).toEqual([])

  // Every link the corridor does not stand across is a door, and the garage bay keeps its run to
  // the street. A link the straightened corridor does cross cannot be a door — the corridor is
  // laid first and is a wall — and is drawn as the tension it is, with the sentence that names
  // what is between the two rooms.
  const said = await tensionsOn(page)
  expect(said.length).toBeLessThanOrEqual(2)
  expect(said.filter((sentence) => !/Hallway/.test(sentence))).toEqual([])
  await expect(page.locator('[data-bay-blocked]')).toHaveCount(0)

  // The way in and the way up are the two walls that may never open: the entry onto the hallway
  // and the hallway onto the stair. A link is either a door or a tension, so a sentence naming
  // one of those two pairs is a wall the morph failed to make.
  const circulation = [
    /^(Entry|Ground Hallway) (and|cannot reach) (Entry|Ground Hallway)/,
    /^(Ground Hallway|Stair) (and|cannot reach) (Ground Hallway|Stair)/,
  ]
  expect(said.filter((sentence) => circulation.some((pair) => pair.test(sentence)))).toEqual([])
  // The stair is reached: the floor above is got to from the front door, whatever else the
  // straightened corridor may have come to stand across.
  expect(await page.locator('[data-unreached]').allTextContents()).toEqual(
    expect.not.arrayContaining([expect.stringContaining('Stair')]),
  )
})

test('Accept places every room in one step and one Undo unplaces them all', async ({ page }) => {
  await openZoning(page)
  const waiting = await page.locator('[data-tray]').count()
  expect(waiting).toBeGreaterThan(8)

  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  await expect(page.locator('[data-room]')).toHaveCount(waiting)
  await expect(page.locator('[data-tray]')).toHaveCount(0)
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  expect(await page.locator('[data-door]').count()).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]')).toHaveCount(waiting)
})

test('Back writes nothing, and Escape is Back', async ({ page }) => {
  await openZoning(page)
  const waiting = await page.locator('[data-tray]').count()

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  await expect(page.locator('[data-room]')).toHaveCount(0)
  await expect(page.locator('[data-tray]')).toHaveCount(waiting)

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  await expect(page.locator('[data-room]')).toHaveCount(0)
})

test('morphing twice without touching a bubble gives the same zones', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  const first = await zonesOn(page)
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await page.getByRole('button', { name: 'Morph' }).click()
  expect(await zonesOn(page)).toEqual(first)
})

test('the zones grow out of their bubbles, and are a cut under reduced motion', async ({
  page,
}) => {
  await openZoning(page)
  // The cut first, which is the same zones at their full size, and so the size to grow to.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Morph' }).click()
  const full = Math.max(...(await opened(page)))
  expect(full).toBeGreaterThan(1)
  await page.getByRole('button', { name: 'Back to bubbles' }).click()

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Every frame the browser draws while the zones open, so the budget is measured and not assumed.
  await page.evaluate(() => {
    const counted = { frames: 0 }
    ;(window as unknown as { counted: { frames: number } }).counted = counted
    const tick = (): void => {
      counted.frames += 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByRole('button', { name: 'Morph' }).click()
  // Caught part way: the widest circle still has more than a metre of its zone to open.
  expect(Math.max(...(await opened(page)))).toBeLessThan(full - 1)
  await expect.poll(async () => Math.max(...(await opened(page)))).toBeCloseTo(full, 1)
  const frames = await page.evaluate(
    () => (window as unknown as { counted: { frames: number } }).counted.frames,
  )
  // The zones take about nine tenths of a second to open; fifty frames in it is sixty a second
  // less the frame or two a browser drops while it starts.
  expect(frames).toBeGreaterThan(50)
})

test('a plot too small for the program shows the spill hatched and counted', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Rebuild program from household' }).click()
  await page.getByLabel('Hold rooms inside the plot').check()
  await page.getByLabel('Width (m)').fill('14')
  await page.getByLabel('Depth (m)').fill('16')

  await page.getByRole('button', { name: 'Bubbles', exact: true }).click()
  await expect(page.locator('.bubbles-status')).toHaveText('Resting', { timeout: 30000 })
  await openSheet(page)
  await page.getByRole('button', { name: 'Morph' }).click()

  await expect(page.locator('[data-spill]')).toHaveCount(1)
  await expect(page.locator('[data-fit]')).toContainText('outside the buildable line')
})

test('a storey already drawn is asked about before it is replaced', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()
  const placed = await page.locator('[data-room]').count()

  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-replace]')).toContainText(`Replace the ${placed} placed rooms`)
  await expect(page.locator('[data-zone]')).toHaveCount(0)
  // The question is answered by Replace; the proposal it then draws is answered by Accept.
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Replace' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await expect(page.locator('[data-room]')).toHaveCount(placed)
})

test('the accepted zones take the gestures any footprint does', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  const kitchen = page.locator('[data-room][data-name="Kitchen"]')
  await clickInside(page, '[data-room][data-name="Kitchen"] polygon')
  await expect(kitchen).toHaveClass(/room-selected/)
  const before = Number(await kitchen.getAttribute('data-area'))
  expect(before).toBeGreaterThan(0)

  // A wall between two zones is grabbed and moved, which is the gesture G0 built for footprints.
  const grip = await page.locator('[data-wall] .wall-grip').first().boundingBox()
  expect(grip).not.toBeNull()
  const from = {
    x: (grip?.x ?? 0) + (grip?.width ?? 0) / 2,
    y: (grip?.y ?? 0) + (grip?.height ?? 0) / 2,
  }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 6 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Align to north' }).click()
  await expect(page.locator('[data-room]').first()).toBeVisible()
  expect(Number(await kitchen.getAttribute('data-area'))).toBeGreaterThan(0)
})

test('Morph draws rooms with running walls, and says so once', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  const zones = await zonesOn(page)
  expect(zones.length).toBeGreaterThan(8)

  // Every zone is a rectangle or a rectangle with one arm, and every wall is square to the plot.
  const odd = zones
    .filter((zone) => ![4, 6].includes(zone.corners.length) || !square(zone.corners))
    .map((zone) => `${zone.name} ${zone.corners.length}`)
  expect(odd).toEqual([])

  // The corridor among them runs on an axis and is between 1.20 m and 2.40 m across.
  const corridor = zones.find((zone) => /hallway/i.test(zone.name))
  expect(corridor).toBeDefined()
  const walls = (corridor?.corners ?? []).map((corner, index) => {
    const next = (corridor?.corners ?? [])[(index + 1) % (corridor?.corners.length ?? 1)] as [
      number,
      number,
    ]
    return Math.hypot(next[0] - corner[0], next[1] - corner[1])
  })
  expect(Math.min(...walls)).toBeGreaterThanOrEqual(1.2)
  expect(Math.min(...walls)).toBeLessThanOrEqual(2.4)

  // The line under the sheet explains the walls on the first morph of the project, and once only.
  await expect(page.locator('[data-hint="morph"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Back to bubbles' }).click()
  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-hint="morph"]')).toHaveCount(0)
})

test('a wall between two accepted zones moves whole, and both areas follow', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  const handle = page.locator('[data-wall]').first()
  const pair = (await handle.getAttribute('data-wall'))?.split(':') ?? []
  const rooms = pair.map((id) => page.locator(`[data-room="${id}"]`))
  const areaOf = async (at: number): Promise<number> =>
    Number(await (rooms[at] as ReturnType<typeof page.locator>).getAttribute('data-area'))
  /** The corners of one of the two rooms, in plot metres. */
  const cornersOf = async (which: string): Promise<[number, number][]> =>
    page.evaluate((id) => {
      const shape = document.querySelector(`[data-room="${id}"] polygon`)
      if (!(shape instanceof SVGPolygonElement)) return []
      const out: [number, number][] = []
      for (let i = 0; i < shape.points.numberOfItems; i++) {
        const at = shape.points.getItem(i)
        out.push([at.x, at.y])
      }
      return out
    }, which)

  /** How much wall the two rooms hold in common: a wall that travels whole keeps all of it. */
  const sharedRun = async (): Promise<number> => {
    const sidesOf = (corners: readonly [number, number][]) =>
      corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]] as const)
    const one = sidesOf(await cornersOf(pair[0] as string))
    const other = sidesOf(await cornersOf(pair[1] as string))
    let run = 0
    for (const [a1, a2] of one)
      for (const [b1, b2] of other) {
        if (!a2 || !b1 || !b2) continue
        const down = a1[0] === a2[0] && b1[0] === b2[0] && Math.abs(a1[0] - b1[0]) < 1e-6
        const across = a1[1] === a2[1] && b1[1] === b2[1] && Math.abs(a1[1] - b1[1]) < 1e-6
        if (!down && !across) continue
        const at = down ? 1 : 0
        const low = Math.max(Math.min(a1[at], a2[at]), Math.min(b1[at], b2[at]))
        const high = Math.min(Math.max(a1[at], a2[at]), Math.max(b1[at], b2[at]))
        run += Math.max(0, high - low)
      }
    return run
  }

  const before = [await areaOf(0), await areaOf(1)]
  const wall = await sharedRun()
  expect(wall).toBeGreaterThan(0.9)
  const grip = await handle.locator('.wall-grip').first().boundingBox()
  expect(grip).not.toBeNull()
  const from = {
    x: (grip?.x ?? 0) + (grip?.width ?? 0) / 2,
    y: (grip?.y ?? 0) + (grip?.height ?? 0) / 2,
  }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 14, from.y + 14, { steps: 8 })
  await page.mouse.up()

  // One room gains what the other gives up, and the whole run they shared travelled with the
  // handle: the two of them still meet along at least as much wall as they did before it moved.
  const after = [await areaOf(0), await areaOf(1)]
  expect(after[0]).not.toBe(before[0])
  expect(after[1]).not.toBe(before[1])
  // To a tenth of a square metre, because the sheet writes each area rounded to the centimetre
  // and the two roundings need not fall the same way.
  expect(Math.abs((after[0] ?? 0) - (before[0] ?? 0))).toBeCloseTo(
    Math.abs((after[1] ?? 0) - (before[1] ?? 0)),
    1,
  )
  expect(await sharedRun()).toBeGreaterThanOrEqual(wall - 1e-6)
})

test('the massing of the accepted plan is prisms with straight faces', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()
  await openMass(page)

  // A prism on a rectangle has a roof and four walls; on an L, a roof and six. Nothing in between,
  // because a straightened zone turns four corners or six and every face is one of its walls.
  const faces = await page.evaluate(() =>
    [...document.querySelectorAll('svg.massing-sheet [data-room]')].map(
      (room) => room.querySelectorAll('polygon').length,
    ),
  )
  expect(faces.length).toBeGreaterThan(8)
  expect([...new Set(faces)].sort((one, other) => one - other).every((count) => count <= 7)).toBe(
    true,
  )
})

test('the DXF of the accepted plan carries at most eight corners a room', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  const drawing = await textOf(await exported(page, 'Export DXF'))
  const rooms = drawing.split('0\nPOLYLINE\n8\nS0-ROOMS\n').slice(1)
  expect(rooms.length).toBeGreaterThan(8)
  const corners = rooms.map((room) => room.split('0\nSEQEND')[0]?.split('0\nVERTEX').length ?? 0)
  expect(Math.max(...corners.map((count) => count - 1))).toBeLessThanOrEqual(8)
})

test('the stair morphed on the floor above stacks on the one below', async ({ page }) => {
  await openZoning(page)
  await page.getByRole('button', { name: 'Morph' }).click()
  await page.getByRole('button', { name: 'Accept' }).click()

  const cornersOf = async (): Promise<[number, number][]> =>
    page.evaluate(() => {
      const shape = document.querySelector('[data-room][data-name="Stair"] polygon')
      if (!(shape instanceof SVGPolygonElement)) return []
      const out: [number, number][] = []
      for (let i = 0; i < shape.points.numberOfItems; i++) {
        const at = shape.points.getItem(i)
        out.push([at.x, at.y])
      }
      return out
    })
  const ground = await cornersOf()
  expect(ground.length).toBeGreaterThan(3)

  // A stair is one room on both storeys, so morphing the floor above may not move it: its cells
  // are put down at the footprint it already stands on before the floor is divided at all.
  await page.getByRole('button', { name: 'First', exact: true }).click()
  await expect(page.locator('[data-room][data-name="Stair"]')).toHaveCount(1)
  // The stair is already drawn up here, because it is the same room, so the morph asks first.
  await page.getByRole('button', { name: 'Morph' }).click()
  await expect(page.locator('[data-replace]')).toContainText('Replace the 1 placed room')
  await page.getByRole('button', { name: 'Replace' }).click()
  await expect(page.locator('[data-zone]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Accept' }).click()
  expect(await cornersOf()).toEqual(ground)
})
