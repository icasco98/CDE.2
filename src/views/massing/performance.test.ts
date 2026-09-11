import { expect, it } from 'vitest'
import { outlineOf, rectangleToPolygon, type Footprint, type Polygon } from '../../geometry'
import {
  ELEVATION_DEG,
  facesOf,
  project,
  roomsInOrder,
  unproject,
  type Face,
  type View,
} from '../../massing'
import type { Room } from '../../model'
import { moveFootprint, sheetOf, type Neighbour, type Sheet } from '../zoning/gestures'

/** No kind's smallest size in the way, so the budget is the geometry and nothing else. */
const anySize = { proportion: 1.25 }

const heights = [3.5, 3.5, 3.5]
const view: View = { azimuth: 45, elevation: ELEVATION_DEG }
const plot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 34, depth: 30 })

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

const storey = rooms()
const dragged: Footprint = {
  polygon: rectangleToPolygon({ left: 1, top: 26, width: 4.5, depth: 3 }),
  rotation: 0,
}

/** The rooms of the storey the dragged room shares, which is what it may not come to lie over. */
const neighbours: Neighbour[] = storey
  .filter((room) => room.storey === 0)
  .map((room): Neighbour => ({
    id: room.id,
    name: room.name,
    footprint: room.footprint ?? dragged,
    pinned: false,
    sizes: anySize,
  }))

/** Built once when the hand takes hold, as the view builds it: the other rooms do not move mid-drag. */
const sheet: Sheet = sheetOf(neighbours, plot)

/**
 * What one pointer move of a drag on a roof runs: the pointer read back onto the room's floor,
 * the move against the storey it stands on, and the whole mass ordered and projected again, which
 * is what the drawing costs once the store has the new footprint.
 */
it('reads a drag on a roof back onto the floor, moves and redraws in under 4 ms', () => {
  const floor = heights[0] ?? 3.5
  let drawn = 0
  const took = milliseconds(() => {
    drawn = 0
    for (let step = 0; step < 20; step++) {
      const at = project([6 + step * 0.2, 27, floor], view)
      const pointer = unproject(at, view, floor)
      const attempt = moveFootprint(dragged, [pointer[0] - 6, pointer[1] - 27], sheet)
      const moved = attempt.ok ? attempt.value : dragged
      const faces: Face[] = storey.flatMap((room) =>
        facesOf(room.id === 'room-0' ? { ...room, footprint: moved } : room, 3, heights),
      )
      for (const group of roomsInOrder(faces, view)) {
        for (const face of group.faces) {
          for (const corner of face.corners) drawn += project(corner, view)[0]
        }
      }
      drawn += outlineOf(moved).length
    }
  })
  expect(drawn).not.toBe(0)
  expect(took / 20).toBeLessThan(4)
})
