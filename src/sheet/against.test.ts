import { describe, expect, it } from 'vitest'
import { alongNamed, standAgainst, edgeNamed, type Standing } from './against'
import { fixtureSheet } from './fixture'
import { setAngle } from './geometry'
import { cloneRoom, type Room } from './model'
import { meetingOf } from './meetings'

const roomIn = (name: string): Room => fixtureSheet().rooms.find((r) => r.name === name)!

const stood = (
  target: Room,
  edge: 'north' | 'south' | 'east' | 'west',
  mover: { w: number; h: number },
  along: 'start' | 'end' | 'centre',
  offset?: number,
): Standing => {
  const placing = standAgainst(target, edge, { name: 'Bedroom', ...mover }, along, offset)
  if (!placing.ok) throw new Error(placing.why)
  return placing.standing
}

describe('a room put against a named edge', () => {
  // Family Living stands at x 0..7.75, y 0..9, square to the sheet.
  const living = roomIn('Family Living')
  const mover = { w: 4, h: 3 }

  it('lies along the east edge, flush to its start, flush to its end, or centred', () => {
    // the edge runs down the plot, so the room's 4 m goes along y and its 3 m reaches east
    expect(stood(living, 'east', mover, 'start')).toEqual({ x: 7.75, y: 0, w: 3, h: 4, angle: 0 })
    expect(stood(living, 'east', mover, 'end')).toEqual({ x: 7.75, y: 5, w: 3, h: 4, angle: 0 })
    expect(stood(living, 'east', mover, 'centre')).toEqual({
      x: 7.75,
      y: 2.5,
      w: 3,
      h: 4,
      angle: 0,
    })
  })

  it('takes an offset from the start of the edge instead of an alignment', () => {
    expect(stood(living, 'east', mover, 'centre', 2)).toMatchObject({ x: 7.75, y: 2 })
    // an offset that would hang the room off the end is held on the edge
    expect(stood(living, 'east', mover, 'centre', 40)).toMatchObject({ y: 5 })
  })

  it('lies along the south edge, the west end first, and touches it', () => {
    expect(stood(living, 'south', mover, 'start')).toEqual({ x: 0, y: 9, w: 4, h: 3, angle: 0 })
    expect(stood(living, 'south', mover, 'end')).toEqual({ x: 3.75, y: 9, w: 4, h: 3, angle: 0 })
  })

  it('stands outside the north and west edges, not inside them', () => {
    expect(stood(living, 'north', mover, 'start')).toEqual({ x: 0, y: -3, w: 4, h: 3, angle: 0 })
    expect(stood(living, 'west', mover, 'start')).toEqual({ x: -3, y: 0, w: 3, h: 4, angle: 0 })
  })

  it('follows a turned room, lying along the edge it is put against and touching it', () => {
    const turned = cloneRoom(living)
    setAngle(turned, 30)
    const standing = stood(turned, 'east', mover, 'centre')
    // the room's width runs along the edge, so it stands at the edge's own lie, not the room's
    expect(standing).toMatchObject({ angle: 300, w: 4, h: 3 })
    const placed = { ...cloneRoom(living), name: 'Bedroom', ...standing }
    expect(meetingOf(turned, placed)).toEqual({ rooms: ['Family Living', 'Bedroom'], metres: 4 })
  })

  it('refuses an edge too short for the room, in plain words', () => {
    const placing = standAgainst(living, 'south', { name: 'Diwaniya', w: 12, h: 5 }, 'centre')
    expect(placing.ok).toBe(false)
    if (!placing.ok)
      expect(placing.why).toBe(
        "Family Living's south edge is 7.8 m and Diwaniya needs 12 m along it: " +
          'turn it, resize it, or put it against a longer edge',
      )
  })

  it('reads the edge and the alignment the architect named, and nothing else', () => {
    expect(edgeNamed(' North ')).toBe('north')
    expect(edgeNamed('street')).toBeNull()
    expect(alongNamed('End')).toBe('end')
    expect(alongNamed(undefined)).toBe('centre')
  })
})
