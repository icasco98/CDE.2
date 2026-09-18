import { describe, expect, it } from 'vitest'
import {
  bestNeighbour,
  courtWhy,
  givePieces,
  holdsSquare,
  pocketsOf,
  roomFromPocket,
} from './pockets'
import { DEFAULTS, sheetOf, type Poly, type Room } from './model'
import { areaOf, r2 } from './geometry'
import { sampleSheet } from './sample'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 10,
  x: 2,
  y: 2,
  w: 4,
  h: 4,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

/** Rooms round a 2 × 4 hole inside the setback line, the west room giving it the most wall. */
function ringRooms(): Room[] {
  return [
    room({ id: 'n', name: 'N', x: 4, y: 4, w: 6, h: 2 }),
    room({ id: 's', name: 'S', x: 4, y: 10, w: 6, h: 2 }),
    room({ id: 'w', name: 'W', x: 4, y: 6, w: 2, h: 4 }),
    room({ id: 'e1', name: 'E1', x: 8, y: 6, w: 2, h: 2 }),
    room({ id: 'e2', name: 'E2', x: 8, y: 8, w: 2, h: 2 }),
  ]
}

describe('enclosed spaces', () => {
  it('finds the space four rooms leave between them, with the walls round it', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const pockets = pocketsOf(sheet, 0)
    const hole = pockets.find((p) => r2(p.area) === 8)!
    expect(hole).toBeDefined()
    expect(hole.centre.map(r2)).toEqual([7, 8])
    // the two rooms east of it stand on one line, so that run of wall is credited to the first
    expect([...hole.touch.keys()].sort()).toEqual(['e1', 'n', 's', 'w'])
    expect(r2(hole.touch.get('w')!)).toBe(4)
    expect(hole.ring).not.toBeNull()
  })

  /** The frozen mock's own sheet, read by the same pass the mock runs. */
  it('finds 3 spaces on the embedded sheet: 150.8, 0.2 and 5.1 m²', () => {
    const areas = pocketsOf(sampleSheet(), 0).map((p) => Math.round(p.area * 10) / 10)
    expect(areas.length).toBe(3)
    expect(areas).toEqual([150.8, 0.2, 5.1])
  })

  it('holds a square of a side, or does not', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const hole = pocketsOf(sheet, 0).find((p) => r2(p.area) === 8)!
    expect(holdsSquare(hole, 1.5)).toBe(true)
    expect(holdsSquare(hole, 2.5)).toBe(false)
  })

  it('says why a space is no court, in the mock’s words', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const hole = pocketsOf(sheet, 0).find((p) => r2(p.area) === 8)!
    expect(courtWhy(hole, DEFAULTS)).toBe('8 m² is under the 9 m² a court needs.')
    expect(courtWhy(hole, { ...DEFAULTS, courtArea: 8, courtSide: 2.5 })).toBe(
      'No 2.5 m square fits in it.',
    )
    expect(courtWhy(hole, { ...DEFAULTS, courtArea: 8, courtSide: 1.5 })).toBe('')
  })

  it('offers the space to the room that gives it the most wall', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const hole = pocketsOf(sheet, 0).find((p) => r2(p.area) === 8)!
    expect(bestNeighbour(hole, sheet)!.id).toBe('w')
  })

  it('hands a space to a room as more of its own floor', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const hole = pocketsOf(sheet, 0).find((p) => r2(p.area) === 8)!
    const north = sheet.rooms[0]!
    const before = areaOf(north)
    expect(givePieces(north, hole.pieces, sheet, 0)).toBe(north)
    expect(r2(areaOf(north))).toBe(r2(before + 8))
  })

  it('squares the room off round the space when the settings ask and nothing is in the way', () => {
    const one = room({ x: 4, y: 4, w: 4, h: 2 })
    const sheet = sheetOf([one], { boundary: 'off', pocketKeeps: 'square' })
    const space: Poly[] = [
      [
        [4, 6],
        [8, 6],
        [8, 8],
        [4, 8],
      ],
    ]
    givePieces(one, space, sheet, 0)
    expect(one.pieces).toBeNull()
    expect([one.w, one.h]).toEqual([4, 4])
  })

  it('makes a room out of a space, fixed as a court', () => {
    const sheet = sheetOf(ringRooms(), { boundary: 'off' })
    const hole = pocketsOf(sheet, 0).find((p) => r2(p.area) === 8)!
    const court = roomFromPocket(hole, 'court', 'Court', 'open', true, 'x1', 9)
    expect([court.x, court.y, court.w, court.h]).toEqual([6, 6, 2, 4])
    expect(court.pieces).toBeNull()
    expect([court.fixed, court.extra, court.target]).toEqual([true, true, 8])
  })
})
