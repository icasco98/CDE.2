import { describe, expect, it } from 'vitest'
import { sheetOf, type Door, type Point, type Room, type Sheet } from '../sheet'
import { dxfOf } from './dxf'

function room(
  name: string,
  box: { x: number; y: number; w: number; h: number },
  extra: Partial<Room> = {},
): Room {
  return {
    id: name,
    name,
    kind: 'room',
    cat: 'private',
    target: 20,
    angle: 0,
    pieces: null,
    placed: true,
    ...box,
    ...extra,
  }
}

const empty = (storeyCount = 1): Sheet => sheetOf([], {}, storeyCount)

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
  const text = dxfOf(empty())

  it('starts with the header section and ends with the end of file', () => {
    expect(text.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
    expect(text.endsWith('0\nEOF\n')).toBe(true)
  })

  it('says it is R12 and that the drawing is in metres', () => {
    expect(headerValue(text, '$ACADVER', 1)).toBe('AC1009')
    expect(headerValue(text, '$INSUNITS', 70)).toBe('6')
  })

  it('carries a layer per storey, coloured by what it holds', () => {
    const layers = itemsIn(dxfOf(empty(2)), 'TABLES').filter((item) => item.type === 'LAYER')
    expect(layers.map((layer) => [valueOf(layer, 2), valueOf(layer, 62)])).toEqual([
      ['PLOT', '7'],
      ['SETBACK', '5'],
      ['S0-ROOMS', '3'],
      ['S0-DOORS', '1'],
      ['S0-TEXT', '8'],
      ['S1-ROOMS', '3'],
      ['S1-DOORS', '1'],
      ['S1-TEXT', '8'],
      ['NORTH', '7'],
    ])
  })

  it('lands the plot’s corners on (0,0), (20,0), (20,25) and (0,25)', () => {
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

  it('draws the setback line as its own closed polyline, 1.5 m in from the west boundary', () => {
    const items = itemsIn(text, 'ENTITIES')
    const at = items.findIndex((item) => item.type === 'POLYLINE' && valueOf(item, 8) === 'SETBACK')
    expect(valueOf(items[at] as Item, 70)).toBe('1')
    // 2 m from the service street to the south, 1.5 m elsewhere: the box is 17 by 21.5 m.
    expect(items.slice(at + 1, at + 5).map(pointOf)).toEqual([
      [1.5, 23.5],
      [18.5, 23.5],
      [18.5, 2],
      [1.5, 2],
    ])
  })

  it('draws the north arrow as two lines on its own layer', () => {
    const north = itemsIn(text, 'ENTITIES').filter((item) => valueOf(item, 8) === 'NORTH')
    expect(north.map((item) => item.type)).toEqual(['LINE', 'LINE'])
  })
})

describe('one 5 × 4 m room at (2, 3) on the ground', () => {
  const kitchen = room('Kitchen', { x: 2, y: 3, w: 5, h: 4 })
  const items = itemsIn(dxfOf(sheetOf([kitchen], {}, 1)), 'ENTITIES')

  it('is one closed polyline of four vertices on S0-ROOMS, flipped y up', () => {
    const on = items.filter((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')
    expect(on).toHaveLength(1)
    const at = items.findIndex(
      (item) => item.type === 'POLYLINE' && valueOf(item, 8) === 'S0-ROOMS',
    )
    expect(valueOf(items[at] as Item, 70)).toBe('1')
    const vertices = items.slice(at + 1, at + 5)
    expect(vertices.every((vertex) => vertex.type === 'VERTEX')).toBe(true)
    expect(items[at + 5]?.type).toBe('SEQEND')
    expect([...vertices.map(pointOf)].sort()).toEqual(
      [
        [2, 22],
        [7, 22],
        [7, 18],
        [2, 18],
      ].sort(),
    )
  })

  it('letters it once on S0-TEXT at 0.3 m, with its name and its area', () => {
    const texts = items.filter((item) => item.type === 'TEXT' && valueOf(item, 8) === 'S0-TEXT')
    expect(texts).toHaveLength(1)
    expect(valueOf(texts[0] as Item, 1)).toBe('Kitchen 20 m2')
    expect(valueOf(texts[0] as Item, 40)).toBe('0.300000')
    expect(pointOf(texts[0] as Item)).toEqual([4.5, 20])
  })
})

it('draws a door as a line across the opening on the storey’s door layer', () => {
  const door: Door = { id: 'd1', type: 'door', w: 0.9, at: [5, 2], flip: false, hinge: false }
  const kitchen = room('Kitchen', { x: 0, y: 0, w: 5, h: 4 }, { doors: [door] })
  const dining = room('Dining', { x: 5, y: 0, w: 5, h: 4 })
  const doors = itemsIn(dxfOf(sheetOf([kitchen, dining], {}, 1)), 'ENTITIES').filter(
    (item) => valueOf(item, 8) === 'S0-DOORS',
  )
  expect(doors.map((item) => item.type)).toEqual(['LINE'])
  const drawn = doors[0] as Item
  // The shared wall runs down the sheet at x 5 from y 0 to 4, so the door is the 0.9 m about its
  // middle, which is y 22.55 to 23.45 once the drawing is turned y up.
  const ends = [pointOf(drawn), [Number(valueOf(drawn, 11)), Number(valueOf(drawn, 21))]]
  expect([...ends].sort()).toEqual(
    [
      [5, 23.45],
      [5, 22.55],
    ].sort(),
  )
})

it('gives a room carved into two parts a polyline for each', () => {
  const split = room(
    'Split',
    { x: 4, y: 4, w: 6, h: 4 },
    {
      pieces: [
        [
          [0, 0],
          [2, 0],
          [2, 4],
          [0, 4],
        ],
        [
          [4, 0],
          [6, 0],
          [6, 4],
          [4, 4],
        ],
      ],
    },
  )
  const items = itemsIn(dxfOf(sheetOf([split], {}, 1)), 'ENTITIES')
  expect(items.filter((i) => i.type === 'POLYLINE' && valueOf(i, 8) === 'S0-ROOMS')).toHaveLength(2)
})
