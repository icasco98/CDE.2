import { describe, expect, it } from 'vitest'
import { doorDrawing, doorNear, doorRead, newDoors } from './openings'
import { addDoor, removeDoor } from './actions'
import { doorSpot, drawnDoors } from './doors'
import { sheetOf, type Door, type Room, type Sheet } from './model'

const room = (over: Partial<Room> = {}): Room => ({
  id: 'k',
  name: 'Kitchen',
  kind: 'kitchen',
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

const door = (over: Partial<Door>): Door => ({
  id: 'd1',
  edge: 'e1',
  to: 'EXTERIOR',
  type: 'door',
  w: 0.9,
  flip: false,
  hinge: false,
  ...over,
})

/*
 * A kitchen 4 × 3 at (6, 6) beside a dining room 4 × 3 at (10, 6): the two share the wall x = 10.
 * The kitchen has a street door in the middle of its north wall at (8, 6), and a door into the
 * dining room halfway along the shared wall at (10, 7.5).
 */
function house(doors: Door[] = []): Sheet {
  return sheetOf(
    [
      room({
        doors: [
          door({ id: 'street', type: 'street2', w: 1.6, at: [2, 0] }),
          door({ id: 'inner', edge: 'e2', to: 'g', along: 0.5 }),
          ...doors,
        ],
      }),
      room({ id: 'g', name: 'Dining', kind: 'dining-room', x: 10 }),
    ],
    { grid: 0.25 },
  )
}

const kitchen = (sheet: Sheet) => sheet.rooms.find((r) => r.id === 'k')!

/** A door drawn as the sheet draws it: where it stands, at the width it is drawn there. */
const drawingOf = (sheet: Sheet, id: string) => {
  const drawn = drawnDoors(sheet, 0).find((each) => each.door.id === id)
  if (!drawn) throw new Error('that door is not drawn')
  return doorDrawing(drawn.room, { ...drawn.door, w: drawn.w }, drawn.pl, sheet)
}

describe('the door under the hand', () => {
  it('finds the street door from a third of a metre away and nothing from two', () => {
    const sheet = house()
    expect(doorNear(sheet, 0, 8, 6.3, 0.45)?.id).toBe('street')
    expect(doorNear(sheet, 0, 8, 8, 0.45)).toBeNull()
  })

  it('finds no door whose rooms have moved apart, since it is not drawn', () => {
    const sheet = house()
    sheet.rooms[1]!.x = 14
    expect(doorNear(sheet, 0, 10, 7.5, 0.45)).toBeNull()
  })
})

describe('what a placement added', () => {
  it('names the one door a placement put on the wall', () => {
    const before = house()
    const change = addDoor(before, {
      x: 8,
      y: 9,
      type: 'door',
      storey: 0,
      edge: 'e3',
      to: 'EXTERIOR',
    })
    expect(change.result.ok).toBe(true)
    expect(newDoors(before, change.sheet)).toEqual([{ room: 'k', id: 'd1' }])
    expect(newDoors(change.sheet, before)).toEqual([])
  })
})

describe('a door’s drawing', () => {
  it('opens the wall the door’s width', () => {
    const [a, b] = drawingOf(house(), 'inner').gap
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(0.9, 6)
  })

  it('gives a plain door one leaf of its width and a double door two halves', () => {
    const plain = drawingOf(house(), 'inner')
    expect(plain.leaves).toHaveLength(1)
    expect(plain.leaves[0]!.arc.radius).toBeCloseTo(0.9, 6)
    const both = drawingOf(house(), 'street')
    expect(both.leaves).toHaveLength(2)
    expect(both.leaves[0]!.arc.radius).toBeCloseTo(0.8, 6)
    expect(both.streetMark).not.toBeNull()
  })

  it('gives a sliding door two panels and two jambs and no leaf, an opening jambs alone', () => {
    const sheet = house([
      door({ id: 'slide', edge: 'e4', type: 'sliding', w: 1.8, at: [2, 3] }),
      door({ id: 'gap', edge: 'e5', type: 'opening', w: 1.2, at: [0, 1.5] }),
    ])
    const slid = drawingOf(sheet, 'slide')
    expect(slid.leaves).toEqual([])
    expect(slid.panels).toHaveLength(2)
    expect(slid.jambs).toHaveLength(2)
    const open = drawingOf(sheet, 'gap')
    expect(open.leaves).toEqual([])
    expect(open.panels).toEqual([])
    expect(open.jambs).toHaveLength(2)
  })

  it('marks an opened wall with its own line and nothing else', () => {
    const sheet = house()
    kitchen(sheet).doors![1] = door({ id: 'inner', edge: 'e2', to: 'g', type: 'open', along: 0.5 })
    const drawing = drawingOf(sheet, 'inner')
    expect(drawing.openMark).not.toBeNull()
    expect(drawing.leaves).toEqual([])
    expect(drawing.jambs).toEqual([])
    expect(drawing.blocked).toBe(false)
    // the whole 3 m the two share, five centimetres in from each end
    const [a, b] = drawing.gap
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(2.9, 6)
  })

  it('says the leaf cannot open when its swing leaves the room it swings into', () => {
    // a niche half a metre deep cannot take a leaf of 0.9, and the same door swung out can
    const niche = room({ id: 'a', name: 'Niche', h: 0.5, w: 3 })
    const inward = door({ at: [1.5, 0] })
    niche.doors = [inward]
    const sheet = sheetOf([niche])
    const pl = doorSpot(sheet, 0, niche, inward)!
    expect(doorDrawing(niche, inward, pl, sheet).blocked).toBe(true)
    expect(doorDrawing(niche, { ...inward, flip: true }, pl, sheet).blocked).toBe(false)
  })
})

describe('what the sentence says about the door in hand', () => {
  it('names the wall, the room it leads into and the way it swings', () => {
    expect(doorRead(house(), 0, { room: 'k', id: 'inner' })).toEqual({
      label: 'Door',
      room: 'Kitchen',
      width: 0.9,
      across: 'Dining',
      swingsInto: 'Kitchen',
      swings: true,
      hinges: true,
    })
  })

  it('says an opening neither swings nor hinges', () => {
    const sheet = house([door({ id: 'gap', edge: 'e5', type: 'opening', w: 1.2, at: [0, 1.5] })])
    const read = doorRead(sheet, 0, { room: 'k', id: 'gap' })
    expect(read?.swings).toBe(false)
    expect(read?.hinges).toBe(false)
    expect(read?.swingsInto).toBeNull()
  })

  it('has nothing to say about a door that has been removed, or one not drawn', () => {
    const sheet = house()
    const gone = removeDoor(sheet, { room: 'k', door: 'inner' })
    expect(doorRead(gone.sheet, 0, { room: 'k', id: 'inner' })).toBeNull()
    sheet.rooms[1]!.x = 14
    expect(doorRead(sheet, 0, { room: 'k', id: 'inner' })).toBeNull()
  })
})
