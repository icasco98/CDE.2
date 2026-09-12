import { expect, it } from 'vitest'
import { createState, defaultLayout, groundOf, step, type SimulationRoom } from '../../bubbles'
import { rectangleToPolygon } from '../../geometry'
import { startingSite } from '../../model'
import { fitCamera, metresPerPixel, viewBoxOf, zoomAbout, ZOOM_STEP } from '../camera'
import { extentOf } from './frame'

/** The starting plot and the floor the setbacks leave of it. */
const plot = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })
const floor = groundOf({ on: true, polygon: plot, north: 0, street: [2] }, startingSite)

/** Thirty rooms over two storeys, the sizes a villa's program runs to. */
function programOfThirty(): SimulationRoom[] {
  return Array.from({ length: 30 }, (_unused, index) => ({
    id: `room-${index}`,
    storey: index % 3 === 0 ? 1 : 0,
    storeysSpanned: 1,
    targetArea: 8 + (index % 7) * 6,
    pinned: false,
    bubble: { x: 3 + (index % 6) * 2.5, y: 3 + Math.floor(index / 6) * 3.5 },
  }))
}

const edges = Array.from({ length: 29 }, (_unused, index) => ({
  a: `room-${index}`,
  b: `room-${index + 1}`,
  storey: 0,
}))

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

const rooms = programOfThirty()
const state = createState(rooms, edges, floor)
const box = { width: 1100, height: 460 }

/**
 * The whole of what a wheel notch runs: the bodies are memoised on the rooms and no bubble's props
 * carry the camera, so nothing but this arithmetic and one viewBox stands between the notch and the
 * screen.
 */
it('answers a wheel notch over thirty bubbles in under 2 ms', () => {
  let closest = 1
  const took = milliseconds(() => {
    const extent = extentOf(plot, state.bodies)
    let camera = fitCamera
    for (let notch = 0; notch < 20; notch++) {
      camera = zoomAbout(extent, camera, [2 + notch * 0.1, 9], ZOOM_STEP)
      viewBoxOf(extent, camera)
      metresPerPixel(extent, camera, box)
    }
    closest = camera.scale
  })
  expect(closest).toBeGreaterThan(1)
  expect(took / 20).toBeLessThan(2)
})

/**
 * The whole of what one millimetre of a drag runs: the bubble goes where the hand is, every other
 * body answers it in that frame, and the sheet is framed again from where they all ended up.
 */
it('answers a pointer move over thirty bubbles in under 2 ms', () => {
  let moved = state
  const took = milliseconds(() => {
    for (let millimetre = 0; millimetre < 20; millimetre++) {
      const held = {
        ...moved,
        bodies: moved.bodies.map((body, index) =>
          index === 0 ? { ...body, x: body.x + 0.01, pinned: true } : body,
        ),
      }
      moved = step(held, defaultLayout)
      const extent = extentOf(plot, moved.bodies)
      viewBoxOf(extent, fitCamera)
      metresPerPixel(extent, fitCamera, box)
    }
  })
  expect(moved.energy).toBeLessThan(Infinity)
  expect(took / 20).toBeLessThan(2)
})
