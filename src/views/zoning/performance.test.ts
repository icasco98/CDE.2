import { expect, it } from 'vitest'
import {
  outlineOf,
  rectangleToPolygon,
  sharedWalls,
  WALL_TOLERANCE,
  type Footprint,
  type Point,
  type Polygon,
} from '../../geometry'
import type { Edge } from '../../model'
import { fitCamera, metresPerPixel, viewBoxOf, zoomAbout, ZOOM_STEP } from '../camera'
import { wallPairs } from './doors'
import { extentOf } from './frame'
import { moveFootprint, moveSharedWall, sheetOf, type Neighbour, type Sheet } from './gestures'
import { joinsOf } from './joins'

/** No kind's smallest size in the way, so the budget is the geometry and nothing else. */
const anySize = { proportion: 1.25 }

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
      sizes: anySize,
    }
  })
}

/** The same storey laid out wall to wall, which is the storey a wall can be dragged on. */
function storeyFlush(): Neighbour[] {
  return Array.from({ length: 30 }, (_unused, index): Neighbour => {
    const left = (index % 6) * 5 + 1
    const top = Math.floor(index / 6) * 5 + 1
    return {
      id: `room-${index}`,
      name: `Room ${index}`,
      footprint: { polygon: rectangleToPolygon({ left, top, width: 5, depth: 5 }), rotation: 0 },
      pinned: false,
      sizes: anySize,
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

/**
 * What one pointer move of a wall drag runs: the strip taken off one room and given to the other,
 * and the pass over the storey that puts every wall handle back where its wall now is.
 */
it('answers one pointer move of a wall drag over thirty placed rooms in under 2 ms', () => {
  const rooms = storeyFlush()
  const standing = rooms.map((room) => ({ id: room.id, outline: outlineOf(room.footprint) }))
  const [a, b] = rooms
  if (!a || !b) throw new Error('the storey is empty')
  const wall = sharedWalls(outlineOf(a.footprint), outlineOf(b.footprint), WALL_TOLERANCE)[0]
  if (!wall) throw new Error('these two rooms share no wall')
  let moved = 0
  const took = milliseconds(() => {
    moved = 0
    for (let step = 0; step < 20; step++) {
      const attempt = moveSharedWall(a, b, wall, (step - 10) * 0.13)
      if (attempt.ok && attempt.value.distance !== 0) moved++
      wallPairs(standing)
    }
  })
  expect(moved).toBeGreaterThan(15)
  expect(took / 20).toBeLessThan(2)
})

/**
 * What one render of a joined storey runs: the open edges read for the walls their rooms share,
 * and the union drawn for each join. Thirty rooms wall to wall with ten open connections among
 * them is a fuller storey than any villa this tool draws.
 */
it('joins thirty placed rooms across ten open edges in under 2 ms', () => {
  const standing = storeyFlush().map((room) => ({
    id: room.id,
    name: room.name,
    outline: outlineOf(room.footprint),
  }))
  const edges: Edge[] = Array.from({ length: 10 }, (_unused, index) => ({
    id: `edge-${index}`,
    a: `room-${index * 2}`,
    b: `room-${index * 2 + 1}`,
    kind: 'open',
    storey: 0,
  }))
  let joins = 0
  const took = milliseconds(() => {
    joins = joinsOf(standing, edges).length
  })
  expect(joins).toBe(10)
  expect(took).toBeLessThan(2)
})
