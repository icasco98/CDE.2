import { describe, expect, it } from 'vitest'
import { capacityMessage, storeyCapacity, storeyLabel } from './capacity'

const plot20by25 = [
  [0, 0],
  [20, 0],
  [20, 25],
  [0, 25],
] as const

describe('storey labels', () => {
  it('names the ground storey and the levels above it', () => {
    expect([0, 1, 2].map(storeyLabel)).toEqual(['Ground', 'Level 1', 'Level 2'])
  })
})

describe('area against the plot', () => {
  const rooms = [
    { storey: 0, storeysSpanned: 1, targetArea: 300 },
    { storey: 0, storeysSpanned: 1, targetArea: 120 },
    { storey: 1, storeysSpanned: 1, targetArea: 100 },
  ]

  it('adds the target areas of each storey against the plot’s own area', () => {
    expect(storeyCapacity(rooms, plot20by25, 2)).toEqual([
      { storey: 0, needed: 420, available: 500, over: false },
      { storey: 1, needed: 100, available: 500, over: false },
    ])
  })

  it('says a storey is over when its rooms ask for more than the plot has', () => {
    const crowded = [...rooms, { storey: 0, storeysSpanned: 1, targetArea: 200 }]
    expect(storeyCapacity(crowded, plot20by25, 2)[0]).toEqual({
      storey: 0,
      needed: 620,
      available: 500,
      over: true,
    })
  })

  it('counts a stair on every storey it passes through', () => {
    const stair = [{ storey: 0, storeysSpanned: 2, targetArea: 12 }]
    expect(storeyCapacity(stair, plot20by25, 2).map((c) => c.needed)).toEqual([12, 12])
  })

  it('says nothing is over when no plot has been drawn', () => {
    expect(storeyCapacity(rooms, [], 2)).toEqual([
      { storey: 0, needed: 420, available: 0, over: false },
      { storey: 1, needed: 100, available: 0, over: false },
    ])
  })

  it('writes one plain sentence naming the whole plot', () => {
    expect(capacityMessage({ storey: 0, needed: 620, available: 500, over: true })).toBe(
      'The rooms on Ground need 620 m² against the whole plot of 500 m².',
    )
  })
})
