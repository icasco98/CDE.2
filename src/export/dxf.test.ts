import { describe, expect, it } from 'vitest'
import { arcPoints, rectangleToPolygon, type Point, type Polygon } from '../geometry'
import { PROJECT_VERSION, type Project, type Room } from '../model'
import { startingHousehold, startingPlot, startingSite } from '../model/project'
import { dxfOf, writeDxf } from './dxf'

function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Al Rai villa',
    storeys: 1,
    heights: [3.5],
    plot: startingPlot,
    site: startingSite,
    household: startingHousehold,
    rooms: [],
    edges: [],
    weights: {},
    actors: [],
    version: PROJECT_VERSION,
    ...extra,
  }
}

function room(id: string, polygon: Polygon, storey = 0): Room {
  return {
    id,
    name: id,
    type: 'bedroom',
    storey,
    storeysSpanned: 1,
    targetArea: 20,
    pinned: false,
    footprint: { polygon, rotation: 0 },
  }
}

type Group = { readonly code: number; readonly value: string }
type Item = { readonly type: string; readonly groups: readonly Group[] }

/** A reader of the group codes: an ASCII DXF is nothing but a code and a value on two lines. */
function readGroups(text: string): readonly Group[] {
  const lines = text.split('\n')
  const groups: Group[] = []
  for (let at = 0; at + 1 < lines.length; at += 2) {
    groups.push({ code: Number(lines[at]), value: lines[at + 1] ?? '' })
  }
  return groups
}

/** Every entity of a named section, each with the groups that follow its own code 0. */
function itemsIn(text: string, section: string): readonly Item[] {
  const groups = readGroups(text)
  const opens = groups.findIndex(
    (group, at) =>
      group.code === 2 && group.value === section && groups[at - 1]?.value === 'SECTION',
  )
  const items: { type: string; groups: Group[] }[] = []
  for (let at = opens + 1; at < groups.length; at += 1) {
    const group = groups[at]
    if (!group) break
    if (group.code === 0 && group.value === 'ENDSEC') break
    if (group.code === 0) items.push({ type: group.value, groups: [] })
    else items[items.length - 1]?.groups.push(group)
  }
  return items
}

function valueOf(item: Item, code: number): string | undefined {
  return item.groups.find((group) => group.code === code)?.value
}

function pointOf(item: Item): Point {
  return [Number(valueOf(item, 10)), Number(valueOf(item, 20))]
}

function headerValue(text: string, name: string, code: number): string | undefined {
  const groups = readGroups(text)
  const at = groups.findIndex((group) => group.code === 9 && group.value === name)
  return groups.slice(at + 1).find((group) => group.code === code)?.value
}

describe('the file a CAD program opens', () => {
  const text = dxfOf(project())

  it('starts with the header section and ends with the end of file', () => {
    expect(text.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
    expect(text.endsWith('0\nEOF\n')).toBe(true)
  })

  it('says it is R12 and that the drawing is in metres', () => {
    expect(headerValue(text, '$ACADVER', 1)).toBe('AC1009')
    expect(headerValue(text, '$INSUNITS', 70)).toBe('6')
  })

  it('carries a layer per storey, coloured by what it holds', () => {
    const layers = itemsIn(dxfOf(project({ storeys: 2, heights: [3.5, 3.5] })), 'TABLES').filter(
      (item) => item.type === 'LAYER',
    )
    const named = layers.map((layer) => [valueOf(layer, 2), valueOf(layer, 62)])
    expect(named).toEqual([
      ['PLOT', '7'],
      ['S0-ROOMS', '3'],
      ['S0-DOORS', '1'],
      ['S0-TEXT', '8'],
      ['S1-ROOMS', '3'],
      ['S1-DOORS', '1'],
      ['S1-TEXT', '8'],
      ['NORTH', '7'],
    ])
  })

  it('lands the starting plot’s corners on (0,0), (20,0), (20,25) and (0,25)', () => {
    const items = itemsIn(text, 'ENTITIES')
    const plot = items.findIndex((item) => item.type === 'POLYLINE' && valueOf(item, 8) === 'PLOT')
    const corners = items
      .slice(plot + 1, plot + 5)
      .map((vertex) => pointOf(vertex).map((value) => Math.round(value * 1e6) / 1e6))
    expect(items[plot + 1]?.type).toBe('VERTEX')
    expect([...corners].sort()).toEqual(
      [
        [0, 0],
        [0, 25],
        [20, 0],
        [20, 25],
      ].sort(),
    )
    expect(headerValue(text, '$EXTMIN', 10)).toBe('0.000000')
    expect(headerValue(text, '$EXTMIN', 20)).toBe('0.000000')
  })

  it('draws the north arrow as two lines on its own layer', () => {
    const north = itemsIn(text, 'ENTITIES').filter((item) => valueOf(item, 8) === 'NORTH')
    expect(north.map((item) => item.type)).toEqual(['LINE', 'LINE'])
  })
})

describe('one 5 × 4 m room at (2, 3) on the ground', () => {
  const kitchen = room('Kitchen', rectangleToPolygon({ left: 2, top: 3, width: 5, depth: 4 }))
  const items = itemsIn(dxfOf(project({ rooms: [kitchen] })), 'ENTITIES')

  it('is one closed polyline of four vertices on S0-ROOMS, flipped y up', () => {
    const at = items.findIndex(
      (item) => item.type === 'POLYLINE' && valueOf(item, 8) === 'S0-ROOMS',
    )
    expect(items.filter((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')).toHaveLength(
      1,
    )
    const polyline = items[at]
    expect(valueOf(polyline as Item, 70)).toBe('1')
    const vertices = items.slice(at + 1, at + 5)
    expect(vertices.every((vertex) => vertex.type === 'VERTEX')).toBe(true)
    expect(items[at + 5]?.type).toBe('SEQEND')
    expect(vertices.map(pointOf)).toEqual([
      [2, 22],
      [7, 22],
      [7, 18],
      [2, 18],
    ])
  })

  it('letters it once on S0-TEXT at 0.3 m, with its name and its area', () => {
    const texts = items.filter((item) => item.type === 'TEXT' && valueOf(item, 8) === 'S0-TEXT')
    expect(texts).toHaveLength(1)
    expect(valueOf(texts[0] as Item, 1)).toBe('Kitchen 20 m2')
    expect(valueOf(texts[0] as Item, 40)).toBe('0.300000')
    expect(pointOf(texts[0] as Item)).toEqual([4.5, 20])
  })
})

it('round-trips an arc through the group codes it was written in', () => {
  const text = writeDxf({
    layers: [{ name: 'PLOT', colour: 7 }],
    entities: [
      {
        kind: 'arc',
        layer: 'PLOT',
        centre: [3.25, 4.5],
        radius: 2.5,
        fromDegrees: 30,
        toDegrees: 150,
      },
    ],
  })
  const arcs = itemsIn(text, 'ENTITIES').filter((item) => item.type === 'ARC')
  expect(arcs).toHaveLength(1)
  const arc = arcs[0] as Item
  expect(valueOf(arc, 8)).toBe('PLOT')
  expect(pointOf(arc)).toEqual([3.25, 4.5])
  expect(Number(valueOf(arc, 40))).toBe(2.5)
  expect(Number(valueOf(arc, 50))).toBe(30)
  expect(Number(valueOf(arc, 51))).toBe(150)
})

it('draws a door as a line across the opening on the storey’s door layer', () => {
  const a = room('Kitchen', rectangleToPolygon({ left: 0, top: 0, width: 5, depth: 4 }))
  const b = room('Dining', rectangleToPolygon({ left: 5, top: 0, width: 5, depth: 4 }))
  const text = dxfOf(
    project({
      rooms: [a, b],
      edges: [{ id: 'edge-1', a: 'Kitchen', b: 'Dining', kind: 'door', storey: 0 }],
    }),
  )
  const doors = itemsIn(text, 'ENTITIES').filter((item) => valueOf(item, 8) === 'S0-DOORS')
  expect(doors.map((item) => item.type)).toEqual(['LINE'])
  const door = doors[0] as Item
  // The shared wall runs down the sheet at x 5 from y 0 to 4, so the door is the 0.9 m about its
  // middle, which is y 22.55 to 23.45 once the drawing is turned y up.
  expect(pointOf(door)).toEqual([5, 23.45])
  expect([Number(valueOf(door, 11)), Number(valueOf(door, 21))]).toEqual([5, 22.55])
})

describe('a room with a curved wall', () => {
  /** The reference circle: 5 m across, standing with its centre at (10, 12) on the sheet. */
  const centre: Point = [10, 12]
  const radius = 2.5
  const ring = arcPoints(centre, radius, 0, 0, true).slice(0, -1)
  const diwaniya: Room = {
    ...room('Diwaniya', ring),
    footprint: {
      polygon: ring,
      rotation: 0,
      arcs: [{ from: 0, to: 0, centre, radius, clockwise: true }],
    },
  }
  const items = itemsIn(dxfOf(project({ rooms: [diwaniya] })), 'ENTITIES')

  it('writes one ARC on the room’s layer at the right centre and radius', () => {
    const arcs = items.filter((item) => item.type === 'ARC' && valueOf(item, 8) === 'S0-ROOMS')
    expect(arcs).toHaveLength(1)
    const arc = arcs[0] as Item
    // The sheet runs y down and the plot is 25 m deep, so the centre lands at (10, 13) y up.
    expect(pointOf(arc)).toEqual([10, 13])
    expect(Number(valueOf(arc, 40))).toBe(2.5)
    expect(Number(valueOf(arc, 50))).toBe(0)
    expect(Number(valueOf(arc, 51))).toBe(360)
  })

  it('leaves no polyline on the room’s layer, the whole wall being the arc', () => {
    expect(items.filter((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')).toHaveLength(
      0,
    )
    expect(valueOf(items.find((i) => valueOf(i, 8) === 'S0-TEXT') as Item, 1)).toBe(
      'Diwaniya 19.6 m2',
    )
  })

  it('splits a bay off the straight runs, which between them cover the rest of the wall', () => {
    // A half-round bay on the east wall of an 8 by 3 m room: it leaves the wall at (14, 8.5),
    // bulges east through (15.5, 10) and comes back to it at (14, 11.5).
    const bay = arcPoints([14, 10], 1.5, -Math.PI / 2, Math.PI / 2, true).slice(1, -1)
    const polygon: Polygon = [[6, 8.5], [14, 8.5], ...bay, [14, 11.5], [6, 11.5]]
    const bayRoom: Room = {
      ...room('Majlis', polygon),
      footprint: {
        polygon,
        rotation: 0,
        arcs: [{ from: 1, to: bay.length + 2, centre: [14, 10], radius: 1.5, clockwise: true }],
      },
    }
    const drawn = itemsIn(dxfOf(project({ rooms: [bayRoom] })), 'ENTITIES')
    const arcs = drawn.filter((item) => item.type === 'ARC' && valueOf(item, 8) === 'S0-ROOMS')
    expect(arcs).toHaveLength(1)
    expect(Number(valueOf(arcs[0] as Item, 40))).toBe(1.5)
    // DXF sweeps counterclockwise in its own y-up space, so the ends come back the other way
    // round: from the south end of the bay, through the east where it bulges, to the north end.
    expect(Number(valueOf(arcs[0] as Item, 50))).toBe(270)
    expect(Number(valueOf(arcs[0] as Item, 51))).toBe(90)
    const runs = drawn.filter((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')
    expect(runs).toHaveLength(1)
    // The arc carries every wall of the bay, so the three straight walls of the room are left,
    // and they are written as one open run with the four corners that carry them.
    const opens = drawn.findIndex((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')
    const ends = drawn.findIndex((item, index) => index > opens && item.type === 'SEQEND')
    expect(drawn.slice(opens + 1, ends).map(pointOf)).toEqual([
      [14, 13.5],
      [6, 13.5],
      [6, 16.5],
      [14, 16.5],
    ])
    expect(valueOf(runs[0] as Item, 70)).toBe('0')
  })
})
