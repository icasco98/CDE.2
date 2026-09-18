import { describe, expect, it } from 'vitest'
import {
  MOVES_PER_CALL,
  layoutTools,
  roomNamed,
  sheetRead,
  type Desk,
  type SheetRead,
} from './agent'
import { sampleSheet } from './sample'
import { PLOT } from './plot'
import type { Sheet } from './model'

/** A desk over one sheet in hand, as the chat column keeps one while a message runs. */
function desk(start: Sheet = sampleSheet()) {
  let sheet = start
  const said: string[] = []
  const notes: string[] = []
  const at: Desk = {
    read: () => sheet,
    write: (change) => {
      if (change.result.ok) sheet = change.sheet
      return change.result
    },
    say: (line) => said.push(line),
    note: (text) => notes.push(text),
  }
  return { at, said, notes, sheet: () => sheet }
}

const overlapArea = (read: SheetRead) => read.report.overlaps.reduce((sum, o) => sum + o.area, 0)

const toolNamed = (tools: ReturnType<typeof layoutTools>, name: string) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool called ${name}`)
  return tool
}

describe('the tools the assistant is given', () => {
  it('offers four tools, each description under 900 bytes', () => {
    const tools = layoutTools(desk().at, 0)
    expect(tools.map((t) => t.name)).toEqual(['read_sheet', 'place_rooms', 'send_back', 'remember'])
    for (const tool of tools)
      expect(new TextEncoder().encode(tool.description).length).toBeLessThan(900)
  })

  it('reads the embedded sheet: the frames, the waiting rooms and the report', () => {
    const table = desk()
    const read = toolNamed(layoutTools(table.at, 0), 'read_sheet').execute({}) as SheetRead
    expect(read.waiting.map((r) => r.name)).toEqual(['Bedroom'])
    expect(read.placed.find((r) => r.name === 'Diwaniya')).toMatchObject({ angle: 25 })
    expect(read.report.placedArea).toBeCloseTo(343.96, 2)
    expect(read.report.boundary.find((b) => b.side === 'west')).toMatchObject({ overBy: 0.5 })
    expect(read.lineTheGroundFloorMayReach).toEqual({ x0: 0, y0: 0, x1: 20, y1: 25 })
    expect(table.said[0]).toContain('read the sheet')
  })

  it('places a waiting room and snaps it onto the wall it was put beside', () => {
    const table = desk()
    // Formal Living's left wall is at x 11.39; the Bedroom is asked for a hand's width off it.
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }],
    }) as { landed: string[]; sheet: SheetRead }
    const bedroom = out.sheet.placed.find((r) => r.name === 'Bedroom')
    expect(bedroom).toBeDefined()
    expect(bedroom!.x).toBe(11.39)
    expect(out.landed[0]).toContain('Bedroom at')
    expect(table.said[0]).toContain('placed 18 of 18')
  })

  it('holds a room asked for past the plot inside the line', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 40, y: 40 }],
    }) as { sheet: SheetRead }
    const bedroom = out.sheet.placed.find((r) => r.name === 'Bedroom')!
    expect(bedroom.x + bedroom.w).toBeLessThanOrEqual(PLOT.w + 1e-6)
    expect(bedroom.y + bedroom.h).toBeLessThanOrEqual(PLOT.h + 1e-6)
  })

  it('reports the overlaps a room dropped on others leaves, under the waiting rule', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 6, y: 5 }],
    }) as { sheet: SheetRead }
    const bedroom = out.sheet.placed.find((r) => r.name === 'Bedroom')!
    expect([bedroom.x, bedroom.y]).toEqual([6, 5])
    expect(out.sheet.report.overlaps.map((o) => o.b)).toEqual(['Bedroom', 'Bedroom', 'Bedroom'])
    expect(overlapArea(out.sheet)).toBeCloseTo(14, 0)
  })

  it('slides the room lower in the program aside instead when the sheet is set to push', () => {
    const table = desk(sampleSheet({ rule: 'push' }))
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 6, y: 5 }],
    }) as { sheet: SheetRead }
    const bedroom = out.sheet.placed.find((r) => r.name === 'Bedroom')!
    expect([bedroom.x, bedroom.y]).not.toEqual([6, 5])
    expect(overlapArea(out.sheet)).toBeLessThan(14)
  })

  it('resizes and turns a room already on the sheet, then moves it', () => {
    const table = desk()
    const rooms = toolNamed(layoutTools(table.at, 0), 'place_rooms')
    rooms.execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
    rooms.execute({ moves: [{ name: 'Bedroom', x: 15, y: 20, w: 4, h: 3.5, angle: 90 }] })
    const bedroom = sheetRead(table.sheet(), 0).placed.find((r) => r.name === 'Bedroom')!
    // a quarter turn is kept as a square frame with its sides swapped, not as an angle
    expect([bedroom.w, bedroom.h]).toEqual([3.5, 4])
    expect(bedroom.angle).toBe(0)
    expect(bedroom.y).toBeGreaterThan(15)
  })

  it('takes a room back to the program and leaves it waiting', () => {
    const table = desk()
    const tools = layoutTools(table.at, 0)
    const out = toolNamed(tools, 'send_back').execute({ rooms: ['Kitchen', 'Bedroom'] }) as {
      notPlaced: string[]
      sheet: SheetRead
    }
    expect(out.notPlaced).toEqual(['Bedroom'])
    expect(out.sheet.waiting.map((r) => r.name).sort()).toEqual(['Bedroom', 'Kitchen'])
    expect(out.sheet.placed.some((r) => r.name === 'Kitchen')).toBe(false)
  })

  it('refuses a move it cannot make and says so instead of changing the sheet', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Ballroom', x: 2, y: 2 }, { name: 'Bedroom' }],
    }) as { landed: string[] }
    expect(out.landed[0]).toBe('no room called Ballroom')
    expect(out.landed[1]).toBe('Bedroom: x and y are needed')
  })

  it('takes at most forty moves in one call', () => {
    const table = desk()
    const moves = Array.from({ length: MOVES_PER_CALL + 6 }, () => ({ name: 'Nobody', x: 1, y: 1 }))
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({ moves }) as {
      landed: string[]
    }
    expect(out.landed).toHaveLength(MOVES_PER_CALL)
  })

  it('writes one line into its own memory', () => {
    const table = desk()
    toolNamed(layoutTools(table.at, 0), 'remember').execute({
      note: 'the owner wants no diwaniya WC',
    })
    expect(table.notes).toEqual(['the owner wants no diwaniya WC'])
  })

  it('finds a room by its name, the start of it, or its kind', () => {
    const sheet = sampleSheet()
    expect(roomNamed(sheet, 'diwaniya')!.name).toBe('Diwaniya')
    expect(roomNamed(sheet, 'Kitch')!.name).toBe('Kitchen')
    expect(roomNamed(sheet, 'entry-foyer')!.name).toBe('Entry')
    expect(roomNamed(sheet, 'a garage')).toBeNull()
  })
})
