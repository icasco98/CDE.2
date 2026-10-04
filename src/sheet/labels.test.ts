import { describe, expect, it } from 'vitest'
import { initialsOf, labelPlan, obstaclesOf, spanThrough } from './labels'
import { sheetOf, type Zone } from './model'
import { r2, triangulate } from './geometry'
import { RECT } from './model'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'Family Living',
  kind: 'family-living',
  cat: 'shared',
  target: 45,
  x: 4,
  y: 4,
  w: 6,
  h: 4,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

describe('the name on a zone', () => {
  it('measures how far the footprint runs through a point', () => {
    const span = spanThrough(zone(), [3, 2], [1, 0])
    expect([r2(span.fwd), r2(span.back)]).toEqual([3, 3])
  })

  it('shortens a name to its initials', () => {
    expect(initialsOf('Family Living')).toBe('FL')
    expect(initialsOf('Diwaniya WC')).toBe('DW')
  })

  it('names the zones lying over this one, as edges in its own frame', () => {
    const a = zone()
    const b = zone({ id: 'b', name: 'B', x: 8, y: 4, w: 4, h: 4 })
    const obs = obstaclesOf(a, sheetOf([a, b]), 0)
    expect(obs.others.map((o) => o.id)).toEqual(['b'])
    expect(obs.segs.length).toBe(4)
  })

  it('lays the name at the middle of a plain zone, upright, at full size', () => {
    const r = zone()
    const plan = labelPlan(r, {}, sheetOf([r]), 0)
    expect(plan.name).toBe('Family Living')
    expect(plan.size).toBe(0.5)
    expect(plan.along).toBe(false)
    expect(plan.pt.map(r2)).toEqual([3, 2])
  })

  it('writes the area under the name when it is asked for', () => {
    const r = zone()
    const plan = labelPlan(r, { area: '24 of 45 m²' }, sheetOf([r]), 0)
    expect(plan.lines).toEqual([['24 of 45 m²', 0.42]])
  })

  it('lays the name along a corridor', () => {
    const hall = zone({ name: 'Hallway', kind: 'hallway', cat: 'circulation', w: 1.8, h: 9 })
    const plan = labelPlan(hall, {}, sheetOf([hall]), 0)
    expect(plan.along).toBe(true)
  })

  it('keeps the name out of the part another zone covers', () => {
    const r = zone({ w: 8, h: 4 })
    const over = zone({ id: 'b', name: 'B', x: 4, y: 4, w: 4, h: 4 })
    const plan = labelPlan(r, {}, sheetOf([r, over]), 0)
    expect(plan.pt[0]).toBeGreaterThan(4)
  })

  it('falls to initials in a zone too small for the name', () => {
    const small = zone({ name: 'Guest WC', w: 1.2, h: 1.2 })
    const plan = labelPlan(small, {}, sheetOf([small]), 0)
    expect(plan.name).toBe('GW')
  })

  it('keeps the name where the hand put it', () => {
    const r = zone({ labelAt: [1, 1] })
    expect(labelPlan(r, {}, sheetOf([r]), 0).pt).toEqual([1, 1])
  })

  it('stays inside the body of a carved zone', () => {
    const carved = zone({ pieces: triangulate(RECT(6, 4)).concat() })
    const plan = labelPlan(carved, {}, sheetOf([carved]), 0)
    expect(plan.pt[0]).toBeGreaterThan(0)
    expect(plan.pt[0]).toBeLessThan(6)
  })
})
