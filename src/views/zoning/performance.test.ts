import { expect, it } from 'vitest'
import {
  outlineOf,
  rectangleToPolygon,
  type Footprint,
  type Point,
  type Polygon,
} from '../../geometry'
import { fitCamera, metresPerPixel, viewBoxOf, zoomAbout, ZOOM_STEP } from './camera'
import { extentOf } from './frame'
import { moveFootprint, sheetOf, type Neighbour, type Sheet } from './gestures'

const plot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 34, depth: 30 })

/** Thirty rooms on a six-by-five grid, meeting along their walls, every other one turned. */
function storeyOfThirty(): Neighbour[] {
  return Array.from({ length: 30 }, (_unused, index): Neighbour => {
    const left = (index % 6) * 5 + 1
    const top = Math.floor(index / 6) * 5 + 1
    return {
      id: `room-${index}`,
      name: `Room ${index}`,
      footprint: {
        polygon: rectangleToPolygon({ left, top, width: 4.5, depth: 4.5 }),
        rotation: index % 2 ? 0 : 15,
      },
      pinned: false,
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

const dragged: Footprint = {
  polygon: rectangleToPolygon({ left: 1, top: 26, width: 4.5, depth: 3 }),
  rotation: 0,
}

/** Built once when the hand takes hold, as the view builds it: the other rooms do not move mid-drag. */
const sheet: Sheet = sheetOf(storeyOfThirty(), plot)

it('runs one pointer move against thirty placed rooms in under 2 ms', () => {
  let landed = 0
  const took = milliseconds(() => {
    landed = 0
    for (let step = 0; step < 20; step++) {
      const delta: Point = [step * 0.37, step * 0.11]
      if (moveFootprint(dragged, delta, sheet).ok) landed++
    }
  })
  expect(landed).toBeGreaterThan(0)
  expect(took / 20).toBeLessThan(2)
})

it('runs a pointer move that is refused just as fast', () => {
  const took = milliseconds(() => {
    for (let step = 0; step < 20; step++) {
      const delta: Point = [step * 0.05, -22 + step * 0.05]
      moveFootprint(dragged, delta, sheet)
    }
  })
  expect(took / 20).toBeLessThan(2)
})

/**
 * The whole of what a wheel notch runs: the extent, the door marks and the proposals are memoised
 * on the rooms and are not touched by a camera, and a room group's props do not carry the camera
 * either, so nothing but this arithmetic and one viewBox stands between the notch and the screen.
 */
it('answers a wheel notch over thirty placed rooms in under 4 ms', () => {
  const extent = extentOf(
    plot,
    storeyOfThirty().map((room) => outlineOf(room.footprint)),
  )
  const box = { width: 1100, height: 460 }
  let closest = 1
  const took = milliseconds(() => {
    let camera = fitCamera
    for (let notch = 0; notch < 20; notch++) {
      camera = zoomAbout(extent, camera, [12 + notch * 0.1, 9], ZOOM_STEP)
      viewBoxOf(extent, camera)
      metresPerPixel(extent, camera, box)
    }
    closest = camera.scale
  })
  expect(closest).toBeGreaterThan(1)
  expect(took / 20).toBeLessThan(4)
})
