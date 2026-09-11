import { describe, expect, it } from 'vitest'
import { area, rectangleToPolygon } from '../../geometry'
import type { Edge, Plot } from '../../model'
import { edgeMarks } from './doors'
import { joinsOf } from './joins'

function room(id: string, name: string, left: number, top: number, width: number, depth: number) {
  return { id, name, outline: rectangleToPolygon({ left, top, width, depth }) }
}

function edge(id: string, a: string, b: string, kind: Edge['kind'] = 'open'): Edge {
  return { id, a, b, kind, storey: 0 }
}

const plot: Plot = {
  on: true,
  polygon: rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 }),
  north: 0,
  street: [2],
}

/** The open-plan pair the villas are built around: 39 m² of living beside 24 m² of dining. */
const living = room('living', 'Family Living', 0, 0, 6, 6.5)
const dining = room('dining', 'Dining Room', 6, 0, 6, 4)

describe('rooms an open connection joins into one space', () => {
  it('joins two rooms that share a wall and an open edge', () => {
    const joins = joinsOf([living, dining], [edge('e1', 'living', 'dining')])
    expect(joins).toHaveLength(1)
    expect(joins[0]?.ids).toEqual(['living', 'dining'])
    expect(joins[0]?.key).toBe('living:dining')
    expect(joins[0]?.edgeIds).toEqual(['e1'])
  })

  it('does not join two rooms across a door', () => {
    expect(joinsOf([living, dining], [edge('e1', 'living', 'dining', 'door')])).toEqual([])
  })

  it('does not join two rooms that have come apart', () => {
    const away = room('dining', 'Dining Room', 9, 0, 6, 4)
    expect(joinsOf([living, away], [edge('e1', 'living', 'dining')])).toEqual([])
  })

  it('does not join a room to one that is not on the storey', () => {
    expect(joinsOf([living], [edge('e1', 'living', 'dining')])).toEqual([])
  })

  it('makes one join of three rooms chained by open edges', () => {
    const kitchen = room('kitchen', 'Kitchen', 6, 4, 6, 3)
    const joins = joinsOf(
      [living, dining, kitchen],
      [edge('e1', 'living', 'dining'), edge('e2', 'dining', 'kitchen')],
    )
    expect(joins).toHaveLength(1)
    expect(joins[0]?.ids).toEqual(['living', 'dining', 'kitchen'])
    expect(joins[0]?.edgeIds).toEqual(['e1', 'e2'])
    expect(area(joins[0]?.outline ?? [])).toBeCloseTo(39 + 24 + 18, 6)
  })

  it('keeps two joins apart where nothing connects them', () => {
    const study = room('study', 'Study', 0, 8, 4, 4)
    const store = room('store', 'Store', 4, 8, 3, 4)
    const joins = joinsOf(
      [living, dining, study, store],
      [edge('e1', 'living', 'dining'), edge('e2', 'study', 'store')],
    )
    expect(joins.map((join) => join.key)).toEqual(['living:dining', 'study:store'])
  })

  it('draws the union as one outline with no wall standing between the two rooms', () => {
    const joins = joinsOf([living, dining], [edge('e1', 'living', 'dining')])
    expect(joins[0]?.rings).toHaveLength(1)
    expect(area(joins[0]?.outline ?? [])).toBeCloseTo(39 + 24, 6)
    // Six corners: the wall the two rooms hold in common is gone from the outline.
    expect(joins[0]?.outline).toHaveLength(6)
  })

  it('leaves a door into the join to be drawn on the union`s outline, as any door is', () => {
    const kitchen = room('kitchen', 'Kitchen', 12, 0, 4, 4)
    const edges = [edge('e1', 'living', 'dining'), edge('e2', 'dining', 'kitchen', 'door')]
    const joins = joinsOf([living, dining, kitchen], edges)
    expect(joins[0]?.edgeIds).toEqual(['e1'])
    const drawn = edges.filter((each) => !joins[0]?.edgeIds.includes(each.id))
    const { doors } = edgeMarks([living, dining, kitchen], drawn, plot)
    expect(doors.map((door) => door.edgeId)).toEqual(['e2'])
    expect(doors[0]?.at).toEqual([12, 2])
  })

  it('labels the join with both names and both areas, and stands the label inside it', () => {
    const joins = joinsOf([living, dining], [edge('e1', 'living', 'dining')])
    expect(joins[0]?.label).toBe('Family Living 39 m² · Dining Room 24 m²')
    expect(joins[0]?.at[0]).toBeGreaterThan(0)
    expect(joins[0]?.at[0]).toBeLessThan(12)
    expect(joins[0]?.at[1]).toBeGreaterThan(0)
    expect(joins[0]?.at[1]).toBeLessThan(6.5)
  })
})
