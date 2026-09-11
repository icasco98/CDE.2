import { expect, it } from 'vitest'
import { createState, type SimulationRoom } from '../../bubbles'
import { fitCamera, metresPerPixel, viewBoxOf, zoomAbout, ZOOM_STEP } from '../camera'
import { bandDrop } from './bands'
import { extentOf } from './frame'

/** Thirty rooms over two storeys, the sizes a villa's program runs to. */
function programOfThirty(): SimulationRoom[] {
  return Array.from({ length: 30 }, (_unused, index) => ({
    id: `room-${index}`,
    storey: index % 3 === 0 ? 1 : 0,
    storeysSpanned: 1,
    targetArea: 8 + (index % 7) * 6,
    pinned: false,
    bubble: { x: (index % 6) * 6 - 15, y: 4 + Math.floor(index / 6) * 5 },
  }))
}

const edges = Array.from({ length: 29 }, (_unused, index) => ({
  a: `room-${index}`,
  b: `room-${index + 1}`,
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
const state = createState(rooms, edges, 2)
const box = { width: 1100, height: 460 }

/**
 * The whole of what a wheel notch runs: the bodies are memoised on the rooms and no bubble's props
 * carry the camera, so nothing but this arithmetic and one viewBox stands between the notch and the
 * screen.
 */
it('answers a wheel notch over thirty bubbles in under 4 ms', () => {
  let closest = 1
  const took = milliseconds(() => {
    const extent = extentOf(state.bodies, state.storeys, state.bandHeight, box.width / box.height)
    let camera = fitCamera
    for (let notch = 0; notch < 20; notch++) {
      camera = zoomAbout(extent, camera, [2 + notch * 0.1, 9], ZOOM_STEP)
      viewBoxOf(extent, camera)
      metresPerPixel(extent, camera, box)
    }
    closest = camera.scale
  })
  expect(closest).toBeGreaterThan(1)
  expect(took / 20).toBeLessThan(4)
})

/**
 * The whole of what a drop in a band runs: the rule, then the bodies and the extent the changed
 * program is drawn from, which is everything the view does again before the next frame.
 */
it('answers a drop in a band over thirty bubbles in under 4 ms', () => {
  let moved = 0
  const took = milliseconds(() => {
    moved = 0
    for (let drop = 0; drop < 20; drop++) {
      const room = rooms[drop % rooms.length]
      if (!room) continue
      const at = { x: 1, y: (drop % 2) * state.bandHeight + state.bandHeight / 2 }
      const landed = bandDrop(at, room, 2, state.bandHeight)
      if (landed.storey !== room.storey) moved++
      const next = createState(
        rooms.map((each) => (each.id === room.id ? { ...each, storey: landed.storey } : each)),
        edges,
        2,
      )
      const extent = extentOf(next.bodies, next.storeys, next.bandHeight, box.width / box.height)
      viewBoxOf(extent, fitCamera)
    }
  })
  expect(moved).toBeGreaterThan(0)
  expect(took / 20).toBeLessThan(4)
})
