import { describe, expect, it } from 'vitest'
import { followProgram, roomFromProgram, type ProgramRoom } from './program'
import { DEFAULTS, sheetOf, type Door, type Room } from './model'
import { fixtureSheet } from './fixture'
import { areaOf } from './geometry'
import { report } from './report'

const entry = (over: Partial<ProgramRoom> & { id: string }): ProgramRoom => ({
  name: 'Bedroom',
  kind: 'bedroom',
  cat: 'private',
  target: 18,
  storey: 0,
  ...over,
})

const none: ReadonlySet<string> = new Set()

const brief: readonly ProgramRoom[] = [
  entry({ id: 'p1', name: 'Diwaniya', kind: 'diwaniya', cat: 'reception', target: 52.5 }),
  entry({ id: 'p2', name: 'Kitchen', kind: 'kitchen', cat: 'shared', target: 21 }),
  entry({ id: 'p3', name: 'Master Bedroom', kind: 'master-bedroom', target: 29, storey: 1 }),
]

describe('the program the sheet draws', () => {
  it('sizes a room of the brief from its target and leaves it waiting', () => {
    const room = roomFromProgram(brief[1]!, DEFAULTS)
    expect([room.id, room.name, room.kind, room.cat]).toEqual([
      'p2',
      'Kitchen',
      'kitchen',
      'shared',
    ])
    expect(room.placed).toBe(false)
    // 21 m² at the kitchen's proportion of 1.4: 5.5 m on the quarter-metre grid by 3.82 m.
    expect([room.w, room.h]).toEqual([5.5, 3.82])
    expect(room.w * room.h).toBeCloseTo(21, 1)
  })

  it('is the brief’s rooms in the brief’s order, whatever order the sheet held them in', () => {
    const held = sheetOf([
      roomFromProgram(brief[2]!, DEFAULTS),
      roomFromProgram(brief[0]!, DEFAULTS),
    ])
    const { sheet, setDown } = followProgram(held, brief, none)
    expect(sheet.rooms.map((r) => r.name)).toEqual(['Diwaniya', 'Kitchen', 'Master Bedroom'])
    expect(sheet.rooms.map((r) => r.target)).toEqual([52.5, 21, 29])
    expect(setDown).toEqual({ rooms: [], doors: [] })
    // the brief puts the master bedroom upstairs, so the sheet has a storey for it
    expect(sheet.storeyCount).toBeGreaterThanOrEqual(2)
  })

  it('leaves a room already drawn where it stands when its target changes', () => {
    const placed: Room = { ...roomFromProgram(brief[0]!, DEFAULTS), x: 3, y: 4, placed: true }
    const held = sheetOf([placed])
    const before = areaOf(placed)
    const { sheet } = followProgram(held, [{ ...brief[0]!, target: 70 }], none)
    const now = sheet.rooms[0]!
    expect([now.x, now.y]).toEqual([3, 4])
    expect(areaOf(now)).toBe(before)
    expect(now.target).toBe(70)
    // the sentence reads the new target against the area the room has
    expect(report(sheet, 0).shortfalls).toEqual([
      { name: 'Diwaniya', area: areaOf(now), target: 70 },
    ])
  })

  it('takes the brief’s words for a room it already holds and resizes one still waiting', () => {
    const held = sheetOf([roomFromProgram(brief[1]!, DEFAULTS)])
    const { sheet } = followProgram(held, [{ ...brief[1]!, name: 'Cooking', target: 28 }], none)
    expect(sheet.rooms[0]!.name).toBe('Cooking')
    expect(sheet.rooms[0]!.w * sheet.rooms[0]!.h).toBeCloseTo(28, 1)
  })

  it('takes a room of the same kind and name but another id for another room', () => {
    const held = sheetOf([{ ...roomFromProgram(brief[0]!, DEFAULTS), id: 'r2', placed: true }])
    const { sheet, setDown } = followProgram(held, [brief[0]!], none)
    expect(sheet.rooms).toMatchObject([{ id: 'p1', placed: false }])
    expect(setDown.rooms.map((r) => r.id)).toEqual(['r2'])
  })

  it('draws only the brief’s rooms: what the brief does not name leaves the sheet', () => {
    const { sheet, setDown } = followProgram(fixtureSheet(), brief, none)
    expect(sheet.rooms.map((r) => r.name)).toEqual(['Diwaniya', 'Kitchen', 'Master Bedroom'])
    expect(setDown.rooms.map((r) => r.name)).toContain('Stair')
    expect(report(sheet, 0).askedArea).toBe(52.5 + 21 + 29)
  })

  it('draws nothing when the brief names no rooms at all', () => {
    const { sheet } = followProgram(fixtureSheet(), [], none)
    expect(sheet.rooms).toEqual([])
  })

  it('puts back a room set down when the brief names it again, where it stood', () => {
    const placed: Room = { ...roomFromProgram(brief[1]!, DEFAULTS), x: 3, y: 4, placed: true }
    const gone = followProgram(sheetOf([placed]), [], none)
    expect(gone.sheet.rooms).toEqual([])
    const back = followProgram(gone.sheet, [brief[1]!], none, gone.setDown)
    expect(back.sheet.rooms).toMatchObject([{ id: 'p2', x: 3, y: 4, placed: true }])
  })

  it('takes a door off with its edge, and puts it back when the edge returns', () => {
    const door: Door = {
      id: 'd1',
      edge: 'e1',
      to: 'p1',
      type: 'door',
      w: 0.9,
      along: 0.3,
      flip: false,
      hinge: false,
    }
    const held = sheetOf([{ ...roomFromProgram(brief[1]!, DEFAULTS), doors: [door] }])
    const cut = followProgram(held, [brief[1]!], none)
    expect(cut.sheet.rooms[0]!.doors).toBeUndefined()
    expect(cut.setDown.doors).toEqual([{ host: 'p2', door }])
    const back = followProgram(cut.sheet, [brief[1]!], new Set(['e1']), cut.setDown)
    expect(back.sheet.rooms[0]!.doors).toEqual([door])
  })

  it('takes every door of an edge off with it, and puts them all back when it returns', () => {
    const door = (id: string, along: number): Door => ({
      id,
      edge: 'e1',
      to: 'p1',
      type: 'door',
      w: 0.9,
      along,
      flip: false,
      hinge: false,
    })
    const both = [door('d1', 0.2), door('d2', 0.8)]
    const held = sheetOf([{ ...roomFromProgram(brief[1]!, DEFAULTS), doors: both }])
    const cut = followProgram(held, [brief[1]!], none)
    expect(cut.sheet.rooms[0]!.doors).toBeUndefined()
    expect(cut.setDown.doors.map((each) => each.door.id)).toEqual(['d1', 'd2'])
    const back = followProgram(cut.sheet, [brief[1]!], new Set(['e1']), cut.setDown)
    expect(back.sheet.rooms[0]!.doors).toEqual(both)
  })

  it('hands back the sheet it was given when the two already agree', () => {
    const once = followProgram(sheetOf([]), brief, none).sheet
    expect(followProgram(once, brief, none).sheet).toBe(once)
  })
})
