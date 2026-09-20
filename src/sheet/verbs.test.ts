import { describe, expect, it } from 'vitest'
import { layoutTools, sheetRead, type SheetRead } from './agent'
import type { Changed } from './changes'
import { VERB_NAMES, type Deed } from './verbs'
import { areaOf, r2 } from './geometry'
import type { Desk } from './desk'
import { doorsOf, sheetOf, type Room, type Sheet } from './model'
import { sampleSheet } from './sample'

/** A desk over one sheet in hand, as the chat column keeps one while a message runs. */
function desk(start: Sheet = sampleSheet()) {
  let sheet = start
  const said: string[] = []
  const at: Desk = {
    read: () => sheet,
    write: (change) => {
      if (change.result.ok) sheet = change.sheet
      return change.result
    },
    say: (line) => said.push(line),
    note: () => {},
    request: () => {},
  }
  // one list of tools per desk, as one message has one, so a take-back finds this message's batches
  return { at, said, tools: layoutTools(at, 0), sheet: () => sheet }
}

type Done = { landed: string[]; changed: Changed; house: SheetRead }

const table = desk

/** The deeds applied as one call of `do`, and what came back. */
function doing(at: ReturnType<typeof table>, deeds: Deed[], storey?: string): Done {
  const tool = at.tools.find((one) => one.name === 'do')!
  return tool.execute({ deeds, ...(storey === undefined ? {} : { storey }) }) as Done
}

const one = (at: ReturnType<typeof table>, deed: Deed, storey?: string): string =>
  doing(at, [deed], storey).landed[0]!

const roomOf = (sheet: Sheet, name: string) => sheet.rooms.find((r) => r.name === name)!

const room = (over: Partial<Room> = {}): Room => ({
  id: 'a',
  name: 'A',
  kind: 'room',
  cat: 'shared',
  target: 12,
  x: 6,
  y: 6,
  w: 4,
  h: 3,
  angle: 0,
  pieces: null,
  placed: true,
  placedAt: 1,
  ...over,
})

const quiet = (rooms: Room[], settings = {}): Sheet =>
  sheetOf(rooms, { closeGap: 0, snapDist: 0, grid: 0, ...settings })

/** Four rooms round an 8 m² hole, as the enclosed-space actions are tested on. */
const ring = (settings = {}) =>
  quiet(
    [
      room({ id: 'n', name: 'N', x: 4, y: 4, w: 6, h: 2 }),
      room({ id: 's', name: 'S', x: 4, y: 10, w: 6, h: 2 }),
      room({ id: 'w', name: 'W', x: 4, y: 6, w: 2, h: 4 }),
      room({ id: 'e', name: 'E', x: 8, y: 6, w: 2, h: 4 }),
    ],
    { boundary: 'off', ...settings },
  )

describe('the one command carrying the verbs', () => {
  it('offers the verbs the page teaches, and nothing else', () => {
    expect(VERB_NAMES).toEqual([
      'turn',
      'mirror',
      'resize',
      'reshape',
      'carve',
      'push',
      'court',
      'corridor',
      'give',
      'combine',
      'lock',
      'unlock',
      'group',
      'ungroup',
      'height',
      'storey',
      'copy',
      'cut',
      'restore',
      'door',
      'open_wall',
      'send_back',
    ])
  })

  it('refuses a verb it does not have, and leaves the sheet alone', () => {
    const at = table()
    const before = JSON.stringify(at.sheet().rooms)
    expect(one(at, { verb: 'fly', room: 'Kitchen' })).toContain('fly is no verb of mine')
    expect(JSON.stringify(at.sheet().rooms)).toBe(before)
  })

  it('turns a room, and refuses when it is not told how far', () => {
    const at = table()
    // a quarter turn of a rectangle is its sides swapped, which is how the sheet keeps it
    expect(one(at, { verb: 'turn', room: 'Store', quarter: true })).toBe('turn · Store at 0°')
    expect([roomOf(at.sheet(), 'Store').w, roomOf(at.sheet(), 'Store').h]).toEqual([1.95, 3])
    expect(one(at, { verb: 'turn', room: 'Store', degrees: 45 })).toBe('turn · Store at 45°')
    // the sample's north arrow stands at 25°, and Face north brings the room onto it
    expect(one(at, { verb: 'turn', room: 'Store', face: 'north' })).toBe('turn · Store at 25°')
    expect(one(at, { verb: 'turn', room: 'Store' })).toBe(
      'turn refused · say degrees, or quarter, or face: north',
    )
    expect(one(at, { verb: 'turn', room: 'Bedroom', degrees: 90 })).toBe(
      'turn refused · Bedroom is not on the sheet yet',
    )
  })

  it('mirrors a room, and refuses an axis that is neither', () => {
    const at = table()
    expect(one(at, { verb: 'mirror', room: 'Store', axis: 'x' })).toBe(
      'mirror · Store mirrored left to right',
    )
    expect(one(at, { verb: 'mirror', room: 'Store', axis: 'up' })).toContain('mirror refused · ')
  })

  it('resizes a room by its sides or its area, and refuses a side out of range', () => {
    const at = table()
    expect(one(at, { verb: 'resize', room: 'Store', w: 4, h: 3 })).toBe('resize · Store 4 × 3 m')
    expect(one(at, { verb: 'resize', room: 'Store', area: 20 })).toBe('resize · Store 20 m²')
    expect(one(at, { verb: 'resize', room: 'Store', w: 40 })).toBe(
      'resize refused · A side must be between 0.5 and 30 m.',
    )
    expect(one(at, { verb: 'resize', room: 'Store' })).toBe(
      'resize refused · say w and h in metres, or an area',
    )
  })

  it('reshapes a room to a polygon, and refuses a polygon that is not one', () => {
    const at = table(quiet([room()]))
    expect(
      one(at, {
        verb: 'reshape',
        room: 'A',
        polygon: [
          [8, 8],
          [12, 8],
          [12, 12],
          [8, 12],
        ],
      }),
    ).toBe('reshape · 2 m² taken away.')
    expect(one(at, { verb: 'reshape', room: 'A', polygon: 'a square' })).toBe(
      'reshape refused · the polygon is three corners or more, each [x, y] in plot metres',
    )
  })

  it("carves one room's shape out of another's, and refuses where they do not lie over", () => {
    const at = table(
      quiet([
        room({ x: 6, y: 6, w: 6, h: 4 }),
        room({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 2 }),
      ]),
    )
    expect(one(at, { verb: 'carve', room: 'B', out_of: 'A' })).toContain('m² taken away')
    expect(r2(areaOf(roomOf(at.sheet(), 'A')))).toBe(20)
    const apart = table(quiet([room(), room({ id: 'b', name: 'B', x: 14, y: 14, w: 3, h: 3 })]))
    expect(one(apart, { verb: 'carve', room: 'B', out_of: 'A' })).toBe(
      'carve refused · B does not lie over A',
    )
    expect(one(apart, { verb: 'carve', room: 'A', out_of: 'A' })).toBe(
      'carve refused · a room cannot be carved out of itself',
    )
  })

  it('pushes what lies under a room aside, and refuses when nothing does', () => {
    const at = table(
      quiet([
        room({ x: 6, y: 6, w: 6, h: 4 }),
        room({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 2 }),
      ]),
    )
    expect(one(at, { verb: 'push', room: 'B' })).toBe('push · the zones under it slid aside')
    expect(one(at, { verb: 'push', room: 'B' })).toBe('push refused · Nothing lies under it.')
  })

  it('makes an enclosed space a court, and refuses one too small for one', () => {
    const roomy = table(ring({ courtArea: 8, closeGap: 0 }))
    expect(one(roomy, { verb: 'court', between: ['N', 'S', 'W', 'E'] })).toBe('court · court 8 m²')
    expect(roomy.sheet().rooms.some((r) => r.kind === 'court')).toBe(true)
    const tight = table(ring())
    expect(one(tight, { verb: 'court', between: ['N', 'S'] })).toBe(
      'court refused · 8 m² is under the 9 m² a court needs.',
    )
    const small = table()
    expect(one(small, { verb: 'court', between: ['Maid Room', 'Stair'] })).toContain(
      'is under the 9 m² a court needs',
    )
  })

  it('makes an enclosed space a corridor, and says which spaces there are when none is named', () => {
    const at = table(ring())
    expect(one(at, { verb: 'corridor', between: ['N', 'S', 'W', 'E'] })).toBe(
      'corridor · Hallway 8 m²',
    )
    const empty = table(quiet([]))
    expect(one(empty, { verb: 'corridor' })).toBe(
      'corridor refused · no enclosed space on the Ground storey',
    )
    const many = table()
    expect(one(many, { verb: 'corridor' })).toContain('enclosed spaces here')
  })

  it('gives an enclosed space to a room that walls it in, and refuses one that does not', () => {
    const at = table(ring())
    expect(one(at, { verb: 'give', between: ['N', 'S', 'W', 'E'], to: 'N' })).toBe(
      'give · 8 m² given to N',
    )
    expect(r2(areaOf(roomOf(at.sheet(), 'N')))).toBe(20)
    const other = table(
      quiet([...ring().rooms, room({ id: 'f', name: 'F', x: 14, y: 14, w: 3, h: 3 })], {
        boundary: 'off',
      }),
    )
    expect(one(other, { verb: 'give', between: ['N', 'S', 'W', 'E'], to: 'F' })).toBe(
      'give refused · F does not wall that space in',
    )
  })

  it('combines rooms that share a wall, and refuses rooms that share none', () => {
    const at = table()
    expect(one(at, { verb: 'combine', rooms: ['Kitchen', 'Store'], into: 'Kitchen' })).toBe(
      'combine · Store combined into Kitchen',
    )
    const apart = table()
    expect(
      one(apart, { verb: 'combine', rooms: ['Kitchen', 'Formal Living'], into: 'Kitchen' }),
    ).toBe(
      'combine refused · Those rooms do not share a wall, so they cannot be combined. ' +
        'Close the gap first.',
    )
    expect(one(apart, { verb: 'combine', rooms: ['Kitchen'], into: 'Kitchen' })).toBe(
      'combine refused · name two rooms or more, and which of them survives',
    )
    expect(one(apart, { verb: 'combine', rooms: ['Kitchen', 'Store'] })).toContain(
      'say which of Kitchen, Store survives, as into',
    )
  })

  it('locks and unlocks a room, and refuses a name that is no room', () => {
    const at = table()
    expect(one(at, { verb: 'lock', rooms: ['Store'] })).toBe('lock · Store locked in place')
    expect(roomOf(at.sheet(), 'Store').locked).toBe(true)
    expect(one(at, { verb: 'unlock', rooms: ['Store'] })).toBe('unlock · Store unlocked')
    expect(one(at, { verb: 'lock', rooms: ['a garage'] })).toBe(
      'lock refused · no room called a garage',
    )
  })

  it('groups rooms and ungroups them, and refuses a group of one', () => {
    const at = table()
    expect(one(at, { verb: 'group', rooms: ['Kitchen', 'Store'] })).toBe('group · 2 rooms grouped')
    expect(one(at, { verb: 'ungroup', rooms: ['Kitchen'] })).toBe('ungroup · ungrouped')
    expect(one(at, { verb: 'group', rooms: ['Kitchen'] })).toBe(
      'group refused · Two rooms at least make a group.',
    )
    expect(one(at, { verb: 'ungroup', rooms: ['Kitchen'] })).toBe(
      'ungroup refused · Nothing here is grouped.',
    )
  })

  it('sets a height, and refuses one above the cap', () => {
    const at = table()
    expect(one(at, { verb: 'height', room: 'Kitchen', metres: 3.6 })).toBe(
      'height · Kitchen 3.5 m · the floor above',
    )
    expect(one(at, { verb: 'height', room: 'Kitchen', metres: 20 })).toBe(
      'height refused · Kitchen may stand 15 m tall at most',
    )
    expect(one(at, { verb: 'height', room: 'Kitchen' })).toBe(
      'height refused · say the height in metres',
    )
  })

  it('moves a room to another storey, and refuses a storey the plan does not have', () => {
    const at = table()
    expect(one(at, { verb: 'storey', rooms: ['Store'], to: 'First' })).toBe(
      'storey · Store on the first storey',
    )
    expect(one(at, { verb: 'storey', rooms: ['Kitchen'], to: 'Second' })).toBe(
      'storey refused · the plan stands 2 storeys high, so there is no Second storey: add one first',
    )
    expect(one(at, { verb: 'storey', rooms: ['Kitchen'], to: 'the attic' })).toBe(
      'storey refused · the attic is no storey: name it Ground, First or Second',
    )
  })

  it('copies a room to another storey, and refuses one the plan does not have', () => {
    const at = table()
    expect(one(at, { verb: 'copy', room: 'Store', to: 'First' })).toBe('copy · Store copy')
    expect(sheetRead(at.sheet(), 0).storeys[1]!.placed.map((r) => r.name)).toContain('Store copy')
    expect(one(at, { verb: 'copy', room: 'Store', to: 'Second' })).toContain('copy refused · ')
  })

  it('cuts a room by the setback line and puts its shape back', () => {
    const inside = table(quiet([room()]))
    expect(one(inside, { verb: 'cut', rooms: ['A'] })).toBe(
      'cut refused · Nothing stands past the setback line.',
    )
    expect(one(inside, { verb: 'restore', room: 'A' })).toBe(
      'restore refused · A has nothing to restore.',
    )
    const over = table(quiet([room({ x: 18, y: 6, w: 4, h: 3 })]))
    expect(one(over, { verb: 'cut', rooms: ['A'] })).toBe('cut · A cut by the setback')
    // the setback line stands at x 18.5, so half a metre of the room's width is what is left
    expect(r2(areaOf(roomOf(over.sheet(), 'A')))).toBe(1.5)
    expect(one(over, { verb: 'restore', room: 'A' })).toContain('restore · ')
    expect(r2(areaOf(roomOf(over.sheet(), 'A')))).toBe(12)
  })

  it('puts a door on a named wall, and refuses one on the boundary', () => {
    const at = table(quiet([room({ x: 6, y: 6, w: 4, h: 3 })], { grid: 0.25, snapDist: 0.4 }))
    expect(one(at, { verb: 'door', room: 'A', wall: 'north', along: 0.5 })).toBe(
      'door · Door on A, middle of the wall',
    )
    expect(doorsOf(roomOf(at.sheet(), 'A')).length).toBe(1)
    const edge = table(quiet([room({ x: 0, y: 6, w: 4, h: 3 })]))
    expect(one(edge, { verb: 'door', room: 'A', wall: 'west', along: 0.5 })).toBe(
      'door refused · A wall on the boundary takes no door.',
    )
    expect(one(edge, { verb: 'door', room: 'A', wall: 'up' })).toBe(
      'door refused · the wall is north, south, east or west',
    )
    expect(one(edge, { verb: 'door', room: 'A', wall: 'north', type: 'gate' })).toContain(
      'is no door',
    )
  })

  it('opens a wall two rooms share, and refuses a wall that meets no room', () => {
    const at = table(
      quiet([
        room({ x: 6, y: 6, w: 4, h: 3 }),
        room({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 3 }),
      ]),
    )
    expect(one(at, { verb: 'open_wall', room: 'A', wall: 'east', along: 0.5 })).toBe(
      'door · A: wall opened',
    )
    expect(one(at, { verb: 'open_wall', room: 'A', wall: 'north', along: 0.5 })).toBe(
      'door refused · That wall meets no room. Only a wall shared with a neighbour can be opened.',
    )
  })

  it('sends a room back to the program, and refuses one that is not on the sheet', () => {
    const at = table()
    expect(one(at, { verb: 'send_back', rooms: ['Store'] })).toBe('send back · sent back: Store')
    expect(one(at, { verb: 'send_back', rooms: ['Store'] })).toBe(
      'send back refused · Store is not on the sheet yet',
    )
  })
})

describe('a list of deeds', () => {
  it('applies the rest when the third refuses, and reports every refusal', () => {
    const at = table()
    const out = doing(at, [
      { verb: 'turn', room: 'Kitchen', degrees: 90 },
      { verb: 'resize', room: 'Store', w: 4, h: 3 },
      { verb: 'height', room: 'Kitchen', metres: 40 },
      { verb: 'lock', rooms: ['Store'] },
    ])
    expect(out.landed).toEqual([
      'turn · Kitchen at 0°',
      'resize · Store 4 × 3 m',
      'height refused · Kitchen may stand 15 m tall at most',
      'lock · Store locked in place',
    ])
    expect(roomOf(at.sheet(), 'Kitchen').height).toBeUndefined()
    expect(roomOf(at.sheet(), 'Store').locked).toBe(true)
    expect(out.changed.moves.some((m) => m.room === 'Store')).toBe(true)
    expect(out.house.storeys[0]!.placed.find((r) => r.name === 'Kitchen')!.w).toBe(3.43)
  })

  it('works on the storey it is told to, and leaves the owner’s view where it is', () => {
    const at = table()
    expect(one(at, { verb: 'storey', rooms: ['Store'], to: 'First' })).toContain('first storey')
    const out = doing(at, [{ verb: 'turn', room: 'Store', degrees: 45 }], 'First')
    expect(out.landed).toEqual(['turn · Store at 45°'])
    expect(out.house.onScreen).toBe('Ground')
  })

  it('is one undo: the whole list goes back together', () => {
    const at = table()
    const before = JSON.stringify(at.sheet().rooms)
    doing(at, [
      { verb: 'turn', room: 'Kitchen', degrees: 90 },
      { verb: 'resize', room: 'Store', w: 4, h: 3 },
      { verb: 'lock', rooms: ['Store'] },
    ])
    expect(JSON.stringify(at.sheet().rooms)).not.toBe(before)
    // the take-back of this message is the architect's own, so one call puts the whole list back
    const back = at.tools.find((one) => one.name === 'take_back')!.execute({}) as {
      tookBack: boolean
    }
    expect(back.tookBack).toBe(true)
    expect(JSON.stringify(at.sheet().rooms)).toBe(before)
  })
})
