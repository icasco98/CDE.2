import { describe, expect, it } from 'vitest'
import {
  MOVES_PER_CALL,
  layoutTools,
  roomNamed,
  sheetRead,
  storeyNamed,
  type Desk,
  type SheetRead,
  type StoreyRead,
} from './agent'
import { sampleSheet } from './sample'
import { DEFAULT_PLOT } from './plot'
import { setStorey } from './actions'
import type { Changed } from './changes'
import type { Sheet } from './model'

/** A desk over one sheet in hand, as the chat column keeps one while a message runs. */
function desk(start: Sheet = sampleSheet()) {
  let sheet = start
  const said: string[] = []
  const notes: string[] = []
  const asked: string[] = []
  const at: Desk = {
    read: () => sheet,
    write: (change) => {
      if (change.result.ok) sheet = change.sheet
      return change.result
    },
    say: (line) => said.push(line),
    note: (text) => notes.push(text),
    request: (text) => asked.push(text),
  }
  return { at, said, notes, asked, sheet: () => sheet }
}

const ground = (read: SheetRead): StoreyRead => read.storeys[0]!

const overlapArea = (read: SheetRead) =>
  ground(read).report.overlaps.reduce((sum, o) => sum + o.area, 0)

const toolNamed = (tools: ReturnType<typeof layoutTools>, name: string) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool called ${name}`)
  return tool
}

type Done = { landed: string[]; changed: Changed; house: SheetRead }

describe('the tools the architect is given', () => {
  it('offers its commands, each description under 900 bytes', () => {
    const tools = layoutTools(desk().at, 0)
    expect(tools.map((t) => t.name)).toEqual([
      'read_sheet',
      'place_against',
      'place_rooms',
      'settle',
      'take_back',
      'remember',
      'send_back',
    ])
    for (const tool of tools)
      expect(new TextEncoder().encode(tool.description).length).toBeLessThan(900)
  })

  it('reads the whole house: the frames, the waiting rooms and the report of each storey', () => {
    const table = desk()
    const read = toolNamed(layoutTools(table.at, 0), 'read_sheet').execute({}) as SheetRead
    expect(read.waiting.map((r) => r.name)).toEqual(['Bedroom'])
    expect(ground(read).placed.find((r) => r.name === 'Diwaniya')).toMatchObject({
      angle: 25,
      storey: 'Ground',
    })
    expect(ground(read).report.placedArea).toBeCloseTo(343.96, 2)
    expect(ground(read).report.boundary.find((b) => b.side === 'west')).toMatchObject({
      overBy: 0.5,
    })
    expect(ground(read).lineTheGroundFloorMayReach).toEqual({ x0: 0, y0: 0, x1: 20, y1: 25 })
    expect(read.onScreen).toBe('Ground')
    expect(read.totals.total).toBeCloseTo(343.96, 2)
    expect(table.said[0]).toContain('read the house')
  })

  it('reads a storey the owner is not looking at, and every storey at once', () => {
    const table = desk()
    const upstairs = table.at.write(setStorey(table.at.read(), { ids: ['r6'], storey: 0, to: 1 }))
    expect(upstairs.ok).toBe(true)
    const read = sheetRead(table.at.read(), 0)
    expect(read.storeys).toHaveLength(2)
    expect(read.storeys[1]!.placed.map((r) => r.name)).toContain('Formal Living')
    expect(read.onScreen).toBe('Ground')
    expect(read.totals.floorAreas).toHaveLength(2)
  })

  it('says how the rooms stand to each other on the embedded sheet', () => {
    const read = sheetRead(sampleSheet(), 0)
    // the stair stands along the whole back of the family living: 6.25 m of shared wall
    expect(ground(read).sharing[0]).toEqual({ rooms: ['Stair', 'Family Living'], metres: 6.25 })
    expect(
      ground(read).allButTouching.find((pair) => pair.rooms.includes('Guest WC')),
    ).toMatchObject({ rooms: ['Entry', 'Guest WC'], how: 'a corner' })
  })

  it('places a waiting room and snaps it onto the wall it was put beside', () => {
    const table = desk()
    // Formal Living's left wall is at x 11.39; the Bedroom is asked for a hand's width off it.
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }],
    }) as Done
    const bedroom = ground(out.house).placed.find((r) => r.name === 'Bedroom')
    expect(bedroom).toBeDefined()
    expect(bedroom!.x).toBe(11.39)
    expect(out.landed[0]).toContain('Bedroom at')
    expect(out.changed.moves).toEqual([{ room: 'Bedroom', how: 'placed' }])
    expect(table.said[0]).toContain('placed 18 of 18')
  })

  it('holds a room asked for past the plot inside the line', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 40, y: 40 }],
    }) as Done
    const bedroom = ground(out.house).placed.find((r) => r.name === 'Bedroom')!
    expect(bedroom.x + bedroom.w).toBeLessThanOrEqual(DEFAULT_PLOT.w + 1e-6)
    expect(bedroom.y + bedroom.h).toBeLessThanOrEqual(DEFAULT_PLOT.h + 1e-6)
  })

  it('reports the overlaps a room dropped on others leaves, under the waiting rule', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 6, y: 5 }],
    }) as Done
    const bedroom = ground(out.house).placed.find((r) => r.name === 'Bedroom')!
    expect([bedroom.x, bedroom.y]).toEqual([6, 5])
    expect(ground(out.house).report.overlaps.map((o) => o.b)).toEqual([
      'Bedroom',
      'Bedroom',
      'Bedroom',
    ])
    expect(out.changed.newOverlaps).toHaveLength(3)
    expect(overlapArea(out.house)).toBeCloseTo(14, 0)
  })

  it('slides the room lower in the program aside instead when the sheet is set to push', () => {
    const table = desk(sampleSheet({ rule: 'push' }))
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Bedroom', x: 6, y: 5 }],
    }) as Done
    const bedroom = ground(out.house).placed.find((r) => r.name === 'Bedroom')!
    expect([bedroom.x, bedroom.y]).not.toEqual([6, 5])
    expect(overlapArea(out.house)).toBeLessThan(14)
  })

  it('resizes and turns a room already on the sheet, then moves it', () => {
    const table = desk()
    const rooms = toolNamed(layoutTools(table.at, 0), 'place_rooms')
    rooms.execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
    rooms.execute({ moves: [{ name: 'Bedroom', x: 15, y: 20, w: 4, h: 3.5, angle: 90 }] })
    const bedroom = ground(sheetRead(table.sheet(), 0)).placed.find((r) => r.name === 'Bedroom')!
    // a quarter turn is kept as a square frame with its sides swapped, not as an angle
    expect([bedroom.w, bedroom.h]).toEqual([3.5, 4])
    expect(bedroom.angle).toBe(0)
    expect(bedroom.y).toBeGreaterThan(15)
  })

  it('takes a room back to the program and leaves it waiting', () => {
    const table = desk()
    const tools = layoutTools(table.at, 0)
    const out = toolNamed(tools, 'send_back').execute({ rooms: ['Kitchen', 'Bedroom'] }) as Done
    expect(out.landed).toContain('Bedroom was not on the sheet')
    expect(out.house.waiting.map((r) => r.name).sort()).toEqual(['Bedroom', 'Kitchen'])
    expect(ground(out.house).placed.some((r) => r.name === 'Kitchen')).toBe(false)
    expect(out.changed.moves).toEqual([{ room: 'Kitchen', how: 'sent back' }])
  })

  it('refuses a move it cannot make and says so instead of changing the sheet', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({
      moves: [{ name: 'Ballroom', x: 2, y: 2 }, { name: 'Bedroom' }],
    }) as Done
    expect(out.landed[0]).toBe('no room called Ballroom')
    expect(out.landed[1]).toBe('Bedroom: x and y are needed')
  })

  it('takes at most forty moves in one call', () => {
    const table = desk()
    const moves = Array.from({ length: MOVES_PER_CALL + 6 }, () => ({ name: 'Nobody', x: 1, y: 1 }))
    const out = toolNamed(layoutTools(table.at, 0), 'place_rooms').execute({ moves }) as Done
    expect(out.landed).toHaveLength(MOVES_PER_CALL)
  })

  it('writes a lesson and a request into its own memory', () => {
    const table = desk()
    toolNamed(layoutTools(table.at, 0), 'remember').execute({
      note: 'the owner wants no diwaniya WC',
      request: 'let me place a door',
    })
    expect(table.notes).toEqual(['the owner wants no diwaniya WC'])
    expect(table.asked).toEqual(['let me place a door'])
  })

  it('finds a room by its name, the start of it, or its kind', () => {
    const sheet = sampleSheet()
    expect(roomNamed(sheet, 'diwaniya')!.name).toBe('Diwaniya')
    expect(roomNamed(sheet, 'Kitch')!.name).toBe('Kitchen')
    expect(roomNamed(sheet, 'entry-foyer')!.name).toBe('Entry')
    expect(roomNamed(sheet, 'a garage')).toBeNull()
  })

  it('finds a storey by its name, and stays where it is told when there is no name', () => {
    expect(storeyNamed('first', 0)).toBe(1)
    expect(storeyNamed('Ground', 1)).toBe(0)
    expect(storeyNamed('', 1)).toBe(1)
    expect(storeyNamed('2', 0)).toBe(2)
    expect(storeyNamed('the attic', 1)).toBe(1)
  })
})

describe('putting a room against a wall', () => {
  it('stands a room flush to each end of the wall, and says what it stands against', () => {
    const along = (align: string) => {
      const table = desk()
      const out = toolNamed(layoutTools(table.at, 0), 'place_against').execute({
        placements: [{ room: 'Bedroom', against: 'Family Living', wall: 'east', along: align }],
      }) as Done
      const bedroom = ground(out.house).placed.find((r) => r.name === 'Bedroom')!
      return { bedroom, out }
    }
    // Family Living stands at x 0..7.75, y 0..9: its east wall is the 9 m run at x = 7.75
    const start = along('start')
    expect(start.bedroom.x).toBe(7.75)
    expect(start.bedroom.y).toBe(0)
    expect(start.out.landed[0]).toContain("against Family Living's east wall")
    const end = along('end')
    expect(end.bedroom.x).toBe(7.75)
    expect(end.bedroom.y + end.bedroom.h).toBeCloseTo(9, 2)
  })

  it('shares a wall with the room it was put against', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_against').execute({
      placements: [{ room: 'Bedroom', against: 'Family Living', wall: 'east', along: 'start' }],
    }) as Done
    const shared = ground(out.house).sharing.find(
      (pair) => pair.rooms.includes('Bedroom') && pair.rooms.includes('Family Living'),
    )
    expect(shared!.metres).toBeGreaterThan(1.5)
  })

  it('takes an offset along the wall instead of an alignment', () => {
    const table = desk()
    toolNamed(layoutTools(table.at, 0), 'place_against').execute({
      placements: [
        { room: 'Bedroom', against: 'Family Living', wall: 'east', offset: 2, w: 4, h: 3 },
      ],
    })
    const bedroom = ground(sheetRead(table.sheet(), 0)).placed.find((r) => r.name === 'Bedroom')!
    expect(bedroom.y).toBeCloseTo(2, 1)
  })

  it('refuses a wall too short for the room, with the reason, and changes nothing', () => {
    const table = desk()
    const before = JSON.stringify(table.sheet().rooms)
    const out = toolNamed(layoutTools(table.at, 0), 'place_against').execute({
      placements: [{ room: 'Bedroom', against: 'Guest WC', wall: 'north', w: 12, h: 4 }],
    }) as Done
    expect(out.landed[0]).toContain('needs 12 m along it')
    expect(JSON.stringify(table.sheet().rooms)).toBe(before)
  })

  it('refuses a room on another storey than the wall it was asked for', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'place_against').execute({
      placements: [{ room: 'Bedroom', against: 'Family Living', wall: 'east' }],
      storey: 'First',
    }) as Done
    expect(out.landed[0]).toContain('stands on the Ground storey')
  })
})

describe('settling and taking back', () => {
  /** The Bedroom dropped on the Kitchen: an overlap the architect made and must settle. */
  const overlapped = () => {
    const table = desk()
    const tools = layoutTools(table.at, 0)
    toolNamed(tools, 'place_rooms').execute({ moves: [{ name: 'Bedroom', x: 6, y: 5 }] })
    return { table, tools }
  }

  it('carves the room lower in the program and leaves no overlap', () => {
    const { table, tools } = overlapped()
    const out = toolNamed(tools, 'settle').execute({
      room: 'Bedroom',
      with: 'Family Living',
      how: 'carve',
    }) as Done
    expect(out.landed[0]).toContain('Family Living kept its shape')
    const left = ground(sheetRead(table.sheet(), 0)).report.overlaps.filter(
      (o) => o.a === 'Family Living' || o.b === 'Family Living',
    )
    expect(left).toEqual([])
  })

  it('pushes the room lower in the program aside instead', () => {
    const { table, tools } = overlapped()
    const before = sheetRead(table.sheet(), 0)
    const was = ground(before).placed.find((r) => r.name === 'Bedroom')!
    const out = toolNamed(tools, 'settle').execute({ room: 'Bedroom', how: 'push' }) as Done
    const now = ground(out.house).placed.find((r) => r.name === 'Bedroom')!
    expect([now.x, now.y]).not.toEqual([was.x, was.y])
    expect(out.changed.moves.some((m) => m.room === 'Bedroom' && m.how === 'moved')).toBe(true)
  })

  it('says so when nothing lies under the room named', () => {
    const table = desk()
    const out = toolNamed(layoutTools(table.at, 0), 'settle').execute({
      room: 'Stair',
      how: 'carve',
    }) as Done
    expect(out.landed[0]).toBe('nothing lies under Stair')
  })

  it('takes its own last batch back exactly, and only its own', () => {
    const table = desk()
    const tools = layoutTools(table.at, 0)
    const before = JSON.stringify(table.sheet().rooms)
    toolNamed(tools, 'place_rooms').execute({ moves: [{ name: 'Bedroom', x: 11.2, y: 1.5 }] })
    const between = JSON.stringify(table.sheet().rooms)
    toolNamed(tools, 'place_rooms').execute({ moves: [{ name: 'Kitchen', x: 2, y: 2 }] })
    expect(JSON.stringify(table.sheet().rooms)).not.toBe(between)
    const out = toolNamed(tools, 'take_back').execute({}) as { tookBack: boolean }
    expect(out.tookBack).toBe(true)
    expect(JSON.stringify(table.sheet().rooms)).toBe(between)
    expect(toolNamed(tools, 'take_back').execute({})).toMatchObject({ tookBack: true })
    expect(JSON.stringify(table.sheet().rooms)).toBe(before)
    expect(toolNamed(tools, 'take_back').execute({})).toMatchObject({ tookBack: false })
  })
})
