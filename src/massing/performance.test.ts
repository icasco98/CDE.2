import { expect, it } from 'vitest'
import { rectangleToPolygon } from '../geometry'
import type { Room } from '../model'
import { ELEVATION_DEG, facesOf, presets, project, roomsInOrder, type Face } from '.'

/** Thirty rooms on a six-by-five grid, on three storeys, every other one turned. */
function rooms(): Room[] {
  return Array.from({ length: 30 }, (_unused, index): Room => {
    const left = (index % 6) * 5 + 1
    const top = Math.floor(index / 6) * 5 + 1
    return {
      id: `room-${index}`,
      name: `Room ${index}`,
      type: 'bedroom',
      storey: index % 3,
      storeysSpanned: 1,
      targetArea: 20,
      pinned: false,
      footprint: {
        polygon: rectangleToPolygon({ left, top, width: 4.5, depth: 4.5 }),
        rotation: index % 2 ? 0 : 15,
      },
    }
  })
}

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged to the budget. */
function milliseconds(work: () => void): number {
  for (let i = 0; i < 5; i++) work()
  let best = Infinity
  for (let i = 0; i < 5; i++) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

/** The prisms do not change when the view turns, so they are built once, as the screen builds them. */
const heights = [3.5, 3.5, 3.5]
const faces: readonly Face[] = rooms().flatMap((room) => facesOf(room, 3, heights))

/** What one view change costs: order every face for the new angle and project every corner of it. */
function draw(azimuth: number): number {
  let drawn = 0
  const view = { azimuth, elevation: ELEVATION_DEG }
  for (const group of roomsInOrder(faces, view)) {
    for (const face of group.faces) {
      for (const corner of face.corners) drawn += project(corner, view)[0]
    }
  }
  return drawn
}

it('orders and projects thirty rooms on three storeys in under 4 ms a view change', () => {
  let drawn = 0
  const took = milliseconds(() => {
    drawn = 0
    for (let step = 0; step < 20; step++) drawn += draw(step * 3.5)
  })
  expect(drawn).not.toBe(0)
  expect(took / 20).toBeLessThan(4)
})

it('costs a preset no more than a step of a drag', () => {
  const took = milliseconds(() => {
    for (const preset of presets) draw(preset.azimuth)
  })
  expect(took / presets.length).toBeLessThan(4)
})
