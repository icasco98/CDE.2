import { expect, it } from 'vitest'
import { rectangleToPolygon } from '../geometry'
import { PROJECT_VERSION, type Edge, type Project, type Room } from '../model'
import { startingHousehold, startingSite } from '../model/project'
import { dxfOf } from './dxf'
import { pdfOf } from './sheet'

const on = new Date('2026-09-11T09:00:00Z')

/** Thirty rooms, ten to a storey on a five-by-two grid, each joined to the room on its right. */
function house(): Project {
  const rooms: Room[] = []
  const edges: Edge[] = []
  for (let storey = 0; storey < 3; storey += 1) {
    for (let index = 0; index < 10; index += 1) {
      const left = (index % 5) * 6 + 1
      const top = Math.floor(index / 5) * 5 + 1
      const id = `room-${storey}-${index}`
      rooms.push({
        id,
        name: `Room ${storey}.${index}`,
        type: 'bedroom',
        storey,
        storeysSpanned: 1,
        targetArea: 24,
        pinned: false,
        footprint: { polygon: rectangleToPolygon({ left, top, width: 6, depth: 5 }), rotation: 0 },
      })
      if (index % 5 === 4) continue
      edges.push({
        id: `edge-${storey}-${index}`,
        a: id,
        b: `room-${storey}-${index + 1}`,
        kind: 'door',
        storey,
      })
    }
  }
  return {
    id: 'project-1',
    name: 'Thirty rooms',
    storeys: 3,
    heights: [3.5, 3.5, 3.5],
    plot: {
      on: true,
      polygon: rectangleToPolygon({ left: 0, top: 0, width: 32, depth: 12 }),
      north: 0,
      street: [2],
    },
    site: startingSite,
    household: startingHousehold,
    rooms,
    edges,
    weights: {},
    actors: [],
    version: PROJECT_VERSION,
  }
}

/** The best of five runs after a warm-up, so neither compilation nor a stray collection is charged. */
function milliseconds(work: () => void): number {
  for (let run = 0; run < 5; run += 1) work()
  let best = Infinity
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now()
    work()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

const project = house()

it('writes the PDF for thirty rooms on three storeys in under 50 ms', () => {
  let bytes = 0
  const took = milliseconds(() => {
    bytes = pdfOf(project, on).length
  })
  expect(bytes).toBeGreaterThan(1000)
  expect(took).toBeLessThan(50)
})

it('writes the DXF for thirty rooms on three storeys in under 50 ms', () => {
  let letters = 0
  const took = milliseconds(() => {
    letters = dxfOf(project).length
  })
  expect(letters).toBeGreaterThan(1000)
  expect(took).toBeLessThan(50)
})
