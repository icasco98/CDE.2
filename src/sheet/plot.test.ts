import { describe, expect, it } from 'vitest'
import {
  BUILD,
  BUILDABLE_AREA,
  MAX_STOREYS,
  NORTH,
  PLOT,
  PLOT_BOX,
  RATIO,
  RATIO_ALLOWED,
  SIDES,
  SIDE_BUDGET,
  SIDE_NAME,
  STOREY_MARK,
  STOREY_NAME,
  STREET_BUDGET,
  boxCorners,
} from './plot'

describe('the plot', () => {
  it('is the fresh brief’s 500 m² corner plot, north turned 25°', () => {
    expect([PLOT.w, PLOT.h]).toEqual([20, 25])
    expect(PLOT.w * PLOT.h).toBe(500)
    expect(NORTH).toBe(25)
    expect(PLOT_BOX).toEqual({ x: 0, y: 0, w: 20, h: 25 })
  })

  it('sets the setback back 2 m from the service street and 1.5 m elsewhere', () => {
    expect(BUILD).toEqual({ x: 1.5, y: 1.5, w: 17, h: 21.5 })
    expect(PLOT.h - (BUILD.y + BUILD.h)).toBe(2)
    expect(PLOT.w - (BUILD.x + BUILD.w)).toBe(1.5)
    expect(BUILDABLE_AREA).toBe(365.5)
  })

  it('gives every side half its length, the street at most 15 m', () => {
    expect(STREET_BUDGET).toBe(10)
    expect(SIDE_BUDGET).toEqual({ west: 12.5, east: 12.5, north: 10, street: 10 })
    expect(SIDES).toEqual(['west', 'north', 'east', 'street'])
    expect(SIDE_NAME.east).toBe('side-street boundary')
  })

  it('allows three floors and 210 % of the plot', () => {
    expect(MAX_STOREYS).toBe(3)
    expect(RATIO).toBe(2.1)
    expect(RATIO_ALLOWED).toBe(1050)
    expect(STOREY_NAME[0]).toBe('Ground')
    expect(STOREY_MARK[1]).toBe('1st')
  })

  it('walks a box round its four corners', () => {
    expect(boxCorners({ x: 0, y: 0, w: 2, h: 3 })).toEqual([
      [0, 0],
      [2, 0],
      [2, 3],
      [0, 3],
    ])
  })
})
