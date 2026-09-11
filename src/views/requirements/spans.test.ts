import { describe, expect, it } from 'vitest'
import { spanBetween, startsFor, topAfterStart, topOf, topsFor } from './spans'

describe('the two ends of a stair', () => {
  it('offers every storey but the top to start on, so there is one left to reach', () => {
    expect(startsFor(3)).toEqual([0, 1])
    expect(startsFor(2)).toEqual([0])
    expect(startsFor(1)).toEqual([0])
  })

  it('offers only the storeys above the one it starts on to reach', () => {
    expect(topsFor(0, 3)).toEqual([1, 2])
    expect(topsFor(1, 3)).toEqual([2])
    expect(topsFor(0, 2)).toEqual([1])
  })

  it('has one storey at either end in a house of one storey', () => {
    expect(topsFor(0, 1)).toEqual([0])
    expect(spanBetween(0, 0)).toBe(1)
  })

  it('counts the span between the two ends, both of them included', () => {
    expect(spanBetween(0, 1)).toBe(2)
    expect(spanBetween(0, 2)).toBe(3)
    expect(spanBetween(1, 2)).toBe(2)
  })

  it('reads the far end back off what the room stores', () => {
    expect(topOf({ storey: 0, storeysSpanned: 3 })).toBe(2)
    expect(topOf({ storey: 1, storeysSpanned: 2 })).toBe(2)
    expect(topOf({ storey: 2, storeysSpanned: 0 })).toBe(2)
  })

  it('carries the far end up when the near one passes it', () => {
    expect(topAfterStart(0, 2, 3)).toBe(2)
    expect(topAfterStart(1, 1, 3)).toBe(2)
    expect(topAfterStart(2, 2, 3)).toBe(2)
  })
})
