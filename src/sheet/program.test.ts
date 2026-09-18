import { describe, expect, it } from 'vitest'
import { followProgram, roomFromProgram, type ProgramRoom } from './program'
import { DEFAULTS, sheetOf, type Room } from './model'
import { sampleSheet } from './sample'
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
    const { sheet, aside } = followProgram(held, brief)
    expect(sheet.rooms.map((r) => r.name)).toEqual(['Diwaniya', 'Kitchen', 'Master Bedroom'])
    expect(sheet.rooms.map((r) => r.target)).toEqual([52.5, 21, 29])
    expect(aside).toEqual([])
    // the brief puts the master bedroom upstairs, so the sheet has a storey for it
    expect(sheet.storeyCount).toBeGreaterThanOrEqual(2)
  })

  it('leaves a room already drawn where it stands when its target changes', () => {
    const placed: Room = { ...roomFromProgram(brief[0]!, DEFAULTS), x: 3, y: 4, placed: true }
    const held = sheetOf([placed])
    const before = areaOf(placed)
    const { sheet } = followProgram(held, [{ ...brief[0]!, target: 70 }])
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
    const { sheet } = followProgram(held, [{ ...brief[1]!, name: 'Cooking', target: 28 }])
    expect(sheet.rooms[0]!.name).toBe('Cooking')
    expect(sheet.rooms[0]!.w * sheet.rooms[0]!.h).toBeCloseTo(28, 1)
  })

  it('finds its rooms again by kind and name when the ids are not the brief’s', () => {
    const held = sheetOf([{ ...roomFromProgram(brief[0]!, DEFAULTS), id: 'r2', placed: true }])
    const { sheet, aside } = followProgram(held, [brief[0]!])
    expect(sheet.rooms).toHaveLength(1)
    expect(sheet.rooms[0]!.id).toBe('p1')
    expect(sheet.rooms[0]!.placed).toBe(true)
    expect(aside).toEqual([])
  })

  it('keeps a saved sheet’s other rooms aside and says so in the report', () => {
    const { sheet, aside } = followProgram(sampleSheet(), brief)
    expect(sheet.rooms.slice(0, 3).map((r) => r.name)).toEqual([
      'Diwaniya',
      'Kitchen',
      'Master Bedroom',
    ])
    expect(aside.length).toBeGreaterThan(0)
    expect(aside.every((r) => r.extra && r.aside)).toBe(true)
    expect(report(sheet, 0).aside).toContain('Entry')
    // what the brief does not name is not counted in what the brief asks for
    expect(report(sheet, 0).askedArea).toBe(52.5 + 21 + 29)
  })

  it('keeps the program it has when the brief names no rooms at all', () => {
    const held = sampleSheet()
    const { sheet, aside } = followProgram(held, [])
    expect(sheet).toBe(held)
    expect(aside).toEqual([])
  })

  it('hands back the sheet it was given when the two already agree', () => {
    const once = followProgram(sheetOf([]), brief).sheet
    expect(followProgram(once, brief).sheet).toBe(once)
  })
})
