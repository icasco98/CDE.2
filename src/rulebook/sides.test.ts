import { describe, expect, it } from 'vitest'
import { kerbFor } from './kerb'
import { sidesOf } from './sides'

const plot = {
  polygon: [
    [0, 0],
    [20, 0],
    [20, 25],
    [0, 25],
  ] as const,
  street: [2],
}

function shape(street: readonly number[]) {
  return { polygon: [...plot.polygon], street }
}

describe('the plot read into the sides the rows pull toward', () => {
  it('sets the service street on the line the setback leaves inside the street boundary', () => {
    const sides = sidesOf(shape([2]))
    // Two metres in from a street boundary on a plot under 750 m², running the whole frontage
    // less the metre and a half the side setbacks take off each end.
    expect(sides.service?.from[1]).toBeCloseTo(23, 9)
    expect(sides.service?.to[1]).toBeCloseTo(23, 9)
    expect(sides.service?.length).toBeCloseTo(17, 9)
    expect(sides.service?.inward[1]).toBe(-1)
  })

  it('puts the back opposite the service street and the rest on the sides', () => {
    const sides = sidesOf(shape([2]))
    expect(sides.back?.inward[1]).toBe(1)
    expect(sides.back?.from[1]).toBeCloseTo(1.5, 9)
    expect(sides.sides.map((side) => side.index).sort()).toEqual([1, 3])
  })

  it('addresses the first street on a corner plot and gives the corner where they meet', () => {
    const sides = sidesOf(shape([2, 3]))
    expect(sides.service?.index).toBe(2)
    expect(sides.street).toHaveLength(2)
    expect(sides.corner?.[0]).toBeCloseTo(2, 9)
    expect(sides.corner?.[1]).toBeCloseTo(23, 9)
  })

  it('has no service street on a plot with none, and holds nothing on a plot with no floor', () => {
    expect(sidesOf(shape([])).service).toBeUndefined()
    expect(sidesOf({ polygon: [], street: [] }).every).toEqual([])
  })

  it('stands the entry and the garage on the service street and the service entrance on a side', () => {
    const one = sidesOf(shape([2]))
    expect(kerbFor('entry-foyer', one)?.index).toBe(2)
    expect(kerbFor('garage', one)?.index).toBe(2)
    // With no side street the service entrance goes on the service street beside the garage.
    expect(kerbFor('service-entrance', one)?.index).toBe(2)
    const two = sidesOf(shape([2, 3]))
    expect(kerbFor('service-entrance', two)?.index).toBe(3)
    expect(kerbFor('kitchen', one)).toBeUndefined()
  })
})
