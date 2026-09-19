import { describe, expect, it } from 'vitest'
import { NEAR_GAP, meetingOf, meetingsOf } from './meetings'
import { sampleSheet } from './sample'
import { cloneRoom, sheetOf, type Room } from './model'
import { setAngle } from './geometry'

const roomIn = (name: string): Room => sampleSheet().rooms.find((r) => r.name === name)!

/** Two plain rooms side by side, the second's left wall this far from the first's right wall. */
const pair = (gap: number, h = 4, y = 0): [Room, Room] => {
  const one = { ...roomIn('Bedroom'), name: 'One', x: 0, y: 0, w: 5, h: 4, angle: 0 }
  const other = { ...roomIn('Bedroom'), name: 'Other', x: 5 + gap, y, w: 3, h, angle: 0 }
  return [one, other]
}

describe('how the rooms stand to each other', () => {
  it('measures the wall a known pair shares on the embedded sheet', () => {
    // The stair stands at x 1.5..7.75, y 9..12.37; the family living at x 0..7.75, y 0..9.
    // They meet along y = 9 from x 1.5 to x 7.75: six and a quarter metres of shared wall.
    const met = meetingOf(roomIn('Stair'), roomIn('Family Living'))
    expect(met).toEqual({ rooms: ['Stair', 'Family Living'], metres: 6.25 })
  })

  it('says a known pair meets at a corner and shares no wall', () => {
    // The entry's north-west corner and the guest WC's south-east corner are both at 11.39, 7.
    expect(meetingOf(roomIn('Entry'), roomIn('Guest WC'))).toEqual({
      rooms: ['Entry', 'Guest WC'],
      how: 'a corner',
      metres: 0,
    })
  })

  it('reads the embedded ground floor in full, the longest shared wall first', () => {
    const meetings = meetingsOf(sampleSheet(), 0)
    expect(meetings.sharing[0]).toEqual({ rooms: ['Stair', 'Family Living'], metres: 6.25 })
    expect(meetings.sharing.map((one) => one.metres)).toEqual(
      [...meetings.sharing.map((one) => one.metres)].sort((a, b) => b - a),
    )
    expect(meetings.apart.map((one) => one.rooms.join(' and '))).toContain('Entry and Guest WC')
    expect(meetings.sharing.some((one) => one.rooms.includes('Bedroom'))).toBe(false)
  })

  it('names a sliver of a gap, and lets go of a room standing well apart', () => {
    const [one, other] = pair(0.2)
    expect(meetingOf(one, other)).toEqual({ rooms: ['One', 'Other'], how: 'a gap', metres: 0.2 })
    expect(meetingOf(...pair(NEAR_GAP + 0.1))).toBeNull()
  })

  it('counts only the run two walls truly share', () => {
    // the second room stands half off the end of the first: two of its four metres are against it
    const [one, other] = pair(0, 4, 2)
    expect(meetingOf(one, other)).toEqual({ rooms: ['One', 'Other'], metres: 2 })
  })

  it('leaves an overlapping pair to the report, which names it as an overlap', () => {
    const [one, other] = pair(-1)
    expect(meetingOf(one, other)).toBeNull()
  })

  it('follows a turned room, measuring the wall it truly shares', () => {
    const one = { ...roomIn('Bedroom'), name: 'One', x: 0, y: 0, w: 5, h: 4, angle: 0 }
    const turned = cloneRoom(one)
    turned.name = 'Turned'
    turned.x = 5
    setAngle(turned, 20)
    expect(meetingOf(one, turned)).toBeNull()
    setAngle(turned, 0)
    expect(meetingOf(one, turned)).toEqual({ rooms: ['One', 'Turned'], metres: 4 })
  })

  it('reads one storey at a time', () => {
    const [one, other] = pair(0)
    const sheet = sheetOf([one, { ...other, storey: 1 }])
    expect(meetingsOf(sheet, 0).sharing).toEqual([])
    expect(meetingsOf(sheet, 1).sharing).toEqual([])
  })
})
