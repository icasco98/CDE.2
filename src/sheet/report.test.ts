import { describe, expect, it } from 'vitest'
import { report, boundaryWalls, sideOver, sideUsed } from './report'
import { sampleSheet } from './sample'
import { sheetOf, type Room } from './model'
import { fmt } from './geometry'

const room = (over: Partial<Room>): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 10,
  x: 5,
  y: 5,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

describe('the report of the embedded sheet', () => {
  /**
   * The frozen mock's own sheet: 343.96 m² placed of 305 asked, west 13 of 12.5, north 7.8 of 10,
   * street 0 of 10, the side street untouched, 17 of 17 reached, Ground Hallway 7 doors, service
   * hallway 4. The parent brief's 352.2 m² and its 5.5 m on the side street belong to an earlier
   * embedded sheet that also held an 8.25 m² zone (5.5 × 1.5) against the side-street boundary;
   * that zone is not in the frozen mock, and every other number of the two agrees.
   */
  it('reads 343.96 m² placed of 305 asked, west 13 of 12.5, north 7.8 of 10, walk 17 of 17', () => {
    const rep = report(sampleSheet(), 0)
    expect(rep.placedArea).toBe(343.96)
    expect(rep.askedArea).toBe(305)
    expect(rep.buildableArea).toBe(365.5)
    const side = (name: string) => rep.boundary.find((b) => b.side === name)!
    expect([side('west').used, side('west').budget, side('west').overBy]).toEqual([13, 12.5, 0.5])
    expect(side('west').over).toBe(true)
    expect([fmt(side('north').used), side('north').budget]).toEqual(['7.8', 10])
    expect([side('east').used, side('east').budget, side('east').read]).toEqual([0, 12.5, false])
    expect([side('street').used, side('street').budget, side('street').read]).toEqual([0, 10, true])
    expect(rep.walk).not.toBeNull()
    expect([rep.walk!.reached, rep.walk!.all]).toEqual([17, 17])
    expect(rep.walk!.hallways).toEqual([
      { name: 'Ground Hallway', doors: 7 },
      { name: 'service hallway', doors: 4 },
    ])
    expect(rep.walk!.unreached).toEqual([])
    expect(rep.walk!.cannotOpen).toEqual([])
    expect(rep.walk!.entryWithoutOutsideDoor).toBeNull()
    expect(rep.walk!.diwaniyaWithoutStreetDoor).toBeNull()
  })

  it('reads the ratio of both storeys against 1,050 m²', () => {
    const rep = report(sampleSheet(), 0)
    expect(rep.allowed).toBe(1050)
    expect(rep.floors).toEqual([343.96, 0])
    expect(rep.total).toBe(343.96)
    expect(rep.overRatio).toBe(false)
  })

  it('names the rooms short of their target', () => {
    const rep = report(sampleSheet(), 0)
    expect(rep.shortfalls.map((s) => s.name)).toEqual(['Diwaniya', 'Kitchen', 'Store'])
  })

  it('counts enclosed spaces only where the settings show them', () => {
    expect(report(sampleSheet(), 0).pockets.count).toBe(0)
    expect(report(sampleSheet({ showPockets: 1 }), 0).pockets.count).toBe(3)
  })

  it('names an overlap and a spill', () => {
    const sheet = sheetOf(
      [
        room({}),
        room({ id: 'b', name: 'B', x: 6, y: 6 }),
        room({ id: 'c', name: 'C', x: 19, y: 5 }),
      ],
      { allowSpill: 1, boundary: 'off' },
    )
    const rep = report(sheet, 0)
    expect(rep.overlaps).toEqual([{ a: 'A', b: 'B', area: 6 }])
    expect(rep.spills).toContain('C')
  })
})

describe('the boundary', () => {
  it('finds a wall on the west boundary and measures overlapping runs once', () => {
    const sheet = sheetOf([
      room({ x: 0, y: 2, w: 3, h: 6 }),
      room({ id: 'b', name: 'B', x: 0, y: 5, w: 3, h: 6 }),
    ])
    expect(boundaryWalls(sheet.rooms[0]!, sheet.plot).map((w) => w.side)).toEqual(['west'])
    expect(sideUsed(sheet, 'west')).toBe(9)
    expect(sideOver(sheet, 'west')).toBe(false)
  })

  it('leaves a court and open ground out of the boundary reading', () => {
    const sheet = sheetOf([
      room({ x: 0, y: 0, w: 3, h: 20, fixed: true, kind: 'court', cat: 'open' }),
      room({ id: 'b', name: 'Garden', cat: 'open', kind: 'garden', x: 0, y: 20, w: 3, h: 5 }),
    ])
    expect(sideUsed(sheet, 'west')).toBe(0)
  })
})
