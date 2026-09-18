import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLOT,
  FRESH_PLOT,
  MAX_STOREYS,
  RATIO,
  SIDES,
  STOREY_MARK,
  STOREY_NAME,
  boxCorners,
  plotFrom,
} from './plot'

describe('the plot', () => {
  it('is the fresh brief\u2019s 500 m\u00b2 corner plot, north turned 25\u00b0', () => {
    expect([DEFAULT_PLOT.w, DEFAULT_PLOT.h]).toEqual([20, 25])
    expect(DEFAULT_PLOT.w * DEFAULT_PLOT.h).toBe(500)
    expect(DEFAULT_PLOT.north).toBe(25)
    expect(DEFAULT_PLOT.box).toEqual({ x: 0, y: 0, w: 20, h: 25 })
    expect(DEFAULT_PLOT.streets).toEqual(['east', 'street'])
    expect(DEFAULT_PLOT.service).toBe('street')
  })

  it('sets the setback back 2 m from the service street and 1.5 m elsewhere', () => {
    const plot = plotFrom(FRESH_PLOT)
    expect(plot.build).toEqual({ x: 1.5, y: 1.5, w: 17, h: 21.5 })
    expect(plot.h - (plot.build.y + plot.build.h)).toBe(2)
    expect(plot.w - (plot.build.x + plot.build.w)).toBe(1.5)
    expect(plot.buildable).toBe(365.5)
  })

  it('gives every side half its length, a street side at most 15 m', () => {
    expect(DEFAULT_PLOT.budget).toEqual({ west: 12.5, east: 12.5, north: 10, street: 10 })
    expect(SIDES).toEqual(['west', 'north', 'east', 'street'])
    expect(DEFAULT_PLOT.name.east).toBe('side-street boundary')
    expect(DEFAULT_PLOT.name.street).toBe('street boundary')
    expect(DEFAULT_PLOT.name.west).toBe('west boundary')
  })

  it('allows three floors and 210 % of the plot', () => {
    expect(MAX_STOREYS).toBe(3)
    expect(RATIO).toBe(2.1)
    expect(DEFAULT_PLOT.allowed).toBe(1050)
    expect(STOREY_NAME[0]).toBe('Ground')
    expect(STOREY_MARK[1]).toBe('1st')
  })

  it('reads a 900 m\u00b2 plot on the north street: 3 m there, 2 m elsewhere', () => {
    // 900 m\u00b2 is over the 750 m\u00b2 the Municipality parts its two setback bands on.
    const plot = plotFrom({ w: 30, h: 30, north: 10, streets: ['north'] })
    expect(plot.service).toBe('north')
    expect(plot.build).toEqual({ x: 2, y: 3, w: 26, h: 25 })
    expect(plot.budget).toEqual({ west: 15, east: 15, north: 15, street: 15 })
    expect(plot.name.north).toBe('street boundary')
    expect(plot.allowed).toBe(1890)
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
