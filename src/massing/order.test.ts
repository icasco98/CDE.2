import { describe, expect, it } from 'vitest'
import { rectangleToPolygon } from '../geometry'
import type { Room } from '../model'
import { orderFaces, roomsInOrder } from './order'
import { facesOf } from './solids'
import { ELEVATION_DEG, presets } from './projection'

function box(id: string, left: number): Room {
  return {
    id,
    name: id,
    type: 'bedroom',
    storey: 0,
    storeysSpanned: 1,
    targetArea: 16,
    pinned: false,
    footprint: { polygon: rectangleToPolygon({ left, top: 0, width: 4, depth: 4 }), rotation: 0 },
  }
}

/** Two boxes side by side, west and east, with a gap between them. */
const west = box('west', 0)
const east = box('east', 6)
const faces = [...facesOf(west, 1, [3.5]), ...facesOf(east, 1, [3.5])]

/** Whichever box the viewer stands nearest, by preset. */
const nearer: Readonly<Record<string, string>> = {
  NE: 'east',
  SE: 'east',
  SW: 'west',
  NW: 'west',
}

describe('two boxes side by side', () => {
  it('draws the nearer one last, from every preset', () => {
    for (const preset of presets) {
      const ordered = orderFaces(faces, preset)
      const first = ordered.findIndex((face) => face.roomId === nearer[preset.id])
      const last = ordered.map((face) => face.roomId).lastIndexOf(nearer[preset.id] ?? '')
      expect([preset.id, first, last]).toEqual([preset.id, faces.length / 2, faces.length - 1])
    }
  })

  it('gathers each box into one group, the nearer group last', () => {
    for (const preset of presets) {
      expect([preset.id, roomsInOrder(faces, preset).map((group) => group.roomId)]).toEqual([
        preset.id,
        preset.id === 'NE' || preset.id === 'SE' ? ['west', 'east'] : ['east', 'west'],
      ])
    }
  })
})

it('draws a prism’s top after its own walls', () => {
  for (const preset of presets) {
    const ordered = orderFaces(faces, preset)
    for (const id of ['west', 'east']) {
      const mine = ordered.filter((face) => face.roomId === id)
      expect([preset.id, id, mine[mine.length - 1]?.kind]).toEqual([preset.id, id, 'top'])
    }
  }
})

it('draws a taller prism over the low one it stands behind', () => {
  const low = box('low', 0)
  const tall = {
    ...box('tall', 0),
    id: 'tall',
    footprint: {
      polygon: rectangleToPolygon({ left: 0, top: 6, width: 4, depth: 4 }),
      rotation: 0,
    },
  }
  const both = [...facesOf(low, 1, [3.5]), ...facesOf(tall, 1, [3.5])]
  // From the south-east the southern box stands nearest, so it is drawn last.
  const order = roomsInOrder(both, { azimuth: 135, elevation: ELEVATION_DEG }).map(
    (group) => group.roomId,
  )
  expect(order).toEqual(['low', 'tall'])
})

it('falls back on the order the faces came in when two lie at the same depth', () => {
  // Due north the two boxes stand the same distance away, so nothing separates them but their order.
  expect(
    roomsInOrder(faces, { azimuth: 0, elevation: ELEVATION_DEG }).map((group) => group.roomId),
  ).toEqual(['west', 'east'])
})
