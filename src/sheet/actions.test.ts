import { describe, expect, it } from 'vitest'
import {
  addDoor,
  addRoom,
  addStorey,
  carveBelow,
  clearColor,
  clearHeight,
  clearLabel,
  combine,
  copyTo,
  cutToSetback,
  draw,
  drawnPoint,
  dropTopStorey,
  flipDoor,
  givePocket,
  group,
  hingeDoor,
  lock,
  makeCorridor,
  makeCourt,
  mirror,
  move,
  moveCorner,
  moveDoor,
  newHistory,
  openWall,
  place,
  pullWall,
  pushOthers,
  reattachDoor,
  redo,
  remember,
  removeDoor,
  removeRoom,
  reorder,
  reshape,
  resize,
  restOnGrid,
  restore,
  sendBack,
  sendBackRoom,
  setArea,
  setColor,
  setDoorWidth,
  setHeight,
  setLabel,
  setSetting,
  setSize,
  setStorey,
  slideDoor,
  turn,
  undo,
  ungroup,
  unlock,
  HISTORY_CAP,
} from './actions'
import { DEFAULTS, doorsOf, sheetOf, type Poly, type Room, type Sheet } from './model'
import { areaOf, outlineOf, r2, worldPieces } from './geometry'
import { differencePolygons, area as clipArea } from '../geometry/polygon'
import { sampleSheet } from './sample'
import { report } from './report'
import { pocketsOf } from './pockets'

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

const roomOf = (sheet: Sheet, id: string) => sheet.rooms.find((r) => r.id === id)!

describe('placing and moving', () => {
  it('drops a room from the program where the hand puts it', () => {
    const sheet = quiet([room({ placed: false })])
    const out = place(sheet, { id: 'a', x: 8, y: 9, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(out.result.at).toEqual({ x: 8, y: 9, w: 4, h: 3 })
    expect(out.result.said).toBe('A at 8,9 4×3')
    expect(roomOf(out.sheet, 'a').placed).toBe(true)
    expect(sheet.rooms[0]!.placed).toBe(false)
  })

  it('refuses to place a locked room, and leaves the sheet alone', () => {
    const sheet = quiet([room({ locked: true })])
    const out = place(sheet, { id: 'a', x: 1, y: 1, storey: 0 })
    expect(out.result).toEqual({ ok: false, said: 'A is locked' })
    expect(out.sheet).toBe(sheet)
    expect(place(sheet, { id: 'nope', x: 1, y: 1, storey: 0 }).result.said).toBe(
      'no room called nope',
    )
  })

  it('holds a dropped room inside the line the ground floor may reach', () => {
    const sheet = quiet([room({ placed: false })], { allowSpill: 0, boundary: 'off' })
    const out = place(sheet, { id: 'a', x: 0, y: 0, storey: 0 })
    expect([out.result.at!.x, out.result.at!.y]).toEqual([1.5, 1.5])
  })

  it('moves a room and its group as one', () => {
    const sheet = quiet([room({ group: 'g1' }), room({ id: 'b', x: 12, y: 6, group: 'g1' })])
    const out = move(sheet, { ids: ['a', 'b'], dx: 1, dy: 2, storey: 0 })
    expect([roomOf(out.sheet, 'a').x, roomOf(out.sheet, 'a').y]).toEqual([7, 8])
    expect([roomOf(out.sheet, 'b').x, roomOf(out.sheet, 'b').y]).toEqual([13, 8])
  })

  it('keeps a move to one axis when asked', () => {
    const sheet = quiet([room()])
    const out = move(sheet, { ids: ['a'], dx: 1, dy: 2, storey: 0, axisLock: true })
    expect([roomOf(out.sheet, 'a').x, roomOf(out.sheet, 'a').y]).toEqual([6, 8])
  })

  it('refuses to move nothing, or a locked room', () => {
    expect(move(quiet([room()]), { ids: [], dx: 1, dy: 0, storey: 0 }).result.ok).toBe(false)
    expect(
      move(quiet([room({ locked: true })]), { ids: ['a'], dx: 1, dy: 0, storey: 0 }).result.said,
    ).toBe('nothing to move')
  })

  it('turns a room a quarter, to an angle, and to face north', () => {
    const sheet = quiet([room()])
    expect(roomOf(turn(sheet, { ids: ['a'], storey: 0, quarter: true }).sheet, 'a').w).toBe(3)
    expect(turn(sheet, { ids: ['a'], storey: 0, angle: 37 }).result.said).toBe('A at 30°')
    expect(turn(sheet, { ids: ['a'], storey: 0, faceNorth: true }).result.said).toBe('A at 25°')
  })

  it('snaps a turn onto a neighbour’s angle', () => {
    const sheet = quiet([room(), room({ id: 'b', x: 12, y: 12, angle: 25 })])
    expect(turn(sheet, { ids: ['a'], storey: 0, angle: 27 }).result.said).toBe('A at 25°')
  })

  it('refuses to turn nothing', () => {
    expect(turn(quiet([room()]), { ids: [], storey: 0, quarter: true }).result.said).toBe(
      'nothing to turn',
    )
  })

  it('mirrors a room, and refuses when nothing is in hand', () => {
    const sheet = quiet([
      room({
        pieces: [
          [
            [0, 0],
            [4, 0],
            [4, 3],
          ],
        ],
      }),
    ])
    const out = mirror(sheet, { ids: ['a'], axis: 'x', storey: 0 })
    expect(out.result.said).toBe('A mirrored left to right')
    expect(roomOf(out.sheet, 'a').pieces![0]).toEqual([
      [0, 3],
      [0, 0],
      [4, 0],
    ])
    expect(mirror(sheet, { ids: [], axis: 'y', storey: 0 }).result.said).toBe('nothing to mirror')
  })
})

describe('walls, corners and sizes', () => {
  it('pulls a wall out and the room grows', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 4 })])
    const seg = outlineOf(sheet.rooms[0]!).findIndex((s) => s.n[0] === 1)
    const out = pullWall(sheet, { id: 'a', wall: seg, distance: 1, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(20)
  })

  it('refuses a wall that is not there, and a locked room', () => {
    const sheet = quiet([room()])
    expect(pullWall(sheet, { id: 'a', wall: 9, distance: 1, storey: 0 }).result.said).toBe(
      'A has no such wall',
    )
    expect(
      pullWall(quiet([room({ locked: true })]), { id: 'a', wall: 0, distance: 1, storey: 0 }).result
        .said,
    ).toBe('A is locked')
  })

  it('moves one corner of a drawn room', () => {
    const drawn = room({
      x: 6,
      y: 6,
      w: 4,
      h: 4,
      pieces: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        [
          [0, 0],
          [4, 4],
          [0, 4],
        ],
      ],
    })
    const out = moveCorner(quiet([drawn]), { id: 'a', corner: 0, point: [7, 7], storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(areaOf(roomOf(out.sheet, 'a'))).toBeLessThan(16)
  })

  it('refuses a corner on a plain room and a shape that crosses itself', () => {
    expect(
      moveCorner(quiet([room()]), { id: 'a', corner: 0, point: [7, 7], storey: 0 }).result.said,
    ).toBe('Only a carved or drawn room has corners to move.')
  })

  it('drags a side, and a shared wall drags both rooms', () => {
    const sheet = quiet([
      room({ x: 6, y: 6, w: 4, h: 3 }),
      room({ id: 'b', x: 10, y: 6, w: 4, h: 3 }),
    ])
    const out = resize(sheet, { id: 'a', side: 'right', distance: 1, shared: 'b', storey: 0 })
    expect(roomOf(out.sheet, 'a').w).toBe(5)
    expect([roomOf(out.sheet, 'b').x, roomOf(out.sheet, 'b').w]).toEqual([11, 3])
  })

  it('refuses to resize a locked room', () => {
    expect(
      resize(quiet([room({ locked: true })]), { id: 'a', side: 'top', distance: 1, storey: 0 })
        .result.said,
    ).toBe('A is locked')
  })

  it('takes a typed size and a typed area', () => {
    const sheet = quiet([room()])
    expect(roomOf(setSize(sheet, { id: 'a', w: 5, storey: 0 }).sheet, 'a').w).toBe(5)
    const areaOut = setArea(sheet, { id: 'a', area: 24, storey: 0 })
    expect(r2(areaOf(roomOf(areaOut.sheet, 'a')))).toBeCloseTo(24, 1)
  })

  it('refuses a size or an area out of its range', () => {
    const sheet = quiet([room()])
    expect(setSize(sheet, { id: 'a', w: 90, storey: 0 }).result.said).toBe(
      'A side must be between 0.5 and 30 m.',
    )
    expect(setArea(sheet, { id: 'a', area: 900, storey: 0 }).result.said).toBe(
      'An area must be between 1 and 400 m².',
    )
  })
})

describe('drawing and reshaping', () => {
  const square: Poly = [
    [6, 6],
    [10, 6],
    [10, 10],
    [6, 10],
  ]

  it('draws a rectangle as the room’s footprint', () => {
    const out = draw(quiet([room({ placed: false })]), {
      id: 'a',
      polygon: square,
      shape: 'rect',
      storey: 0,
    })
    expect(out.result.ok).toBe(true)
    expect(roomOf(out.sheet, 'a').pieces).toBeNull()
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(16)
  })

  it('draws a polygon as convex pieces', () => {
    const out = draw(quiet([room({ placed: false })]), {
      id: 'a',
      polygon: [
        [6, 6],
        [10, 6],
        [10, 10],
      ],
      shape: 'poly',
      storey: 0,
    })
    expect(roomOf(out.sheet, 'a').pieces!.length).toBe(1)
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(8)
  })

  it('refuses a shape too small or crossing itself', () => {
    const sheet = quiet([room({ placed: false })])
    expect(
      draw(sheet, {
        id: 'a',
        polygon: [
          [6, 6],
          [6.5, 6],
          [6.5, 6.5],
        ],
        shape: 'poly',
        storey: 0,
      }).result.said,
    ).toBe('That shape is too small or crosses itself; nothing was placed.')
  })

  it('takes away what a reshape overlaps', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 4 })])
    const out = reshape(sheet, {
      id: 'a',
      polygon: [
        [8, 8],
        [12, 8],
        [12, 12],
        [8, 12],
      ],
      storey: 0,
    })
    expect(out.result.said).toBe('4 m² taken away.')
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(12)
  })

  it('adds a touching shape outside the room', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 4 })])
    const out = reshape(sheet, {
      id: 'a',
      polygon: [
        [10, 6],
        [12, 6],
        [12, 10],
        [10, 10],
      ],
      storey: 0,
    })
    expect(out.result.said).toBe('8 m² added.')
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(24)
  })

  it('splits the smaller part off into the program', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 6, h: 4 })])
    const out = reshape(sheet, {
      id: 'a',
      polygon: [
        [8, 6],
        [9, 6],
        [9, 10],
        [8, 10],
      ],
      storey: 0,
    })
    expect(out.result.born).toEqual(['A, cut'])
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(12)
  })

  it('refuses a shape that does not touch, and one that would take the whole room', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 4 })])
    expect(
      reshape(sheet, {
        id: 'a',
        polygon: [
          [16, 16],
          [18, 16],
          [18, 18],
          [16, 18],
        ],
        storey: 0,
      }).result.said,
    ).toBe('The shape does not touch the room, so nothing changed.')
    expect(
      reshape(sheet, {
        id: 'a',
        polygon: [
          [5, 5],
          [11, 5],
          [11, 11],
          [5, 11],
        ],
        storey: 0,
      }).result.said,
    ).toBe('That would take the whole room away.')
  })
})

describe('settling an overlap by hand', () => {
  const pair = () =>
    quiet([
      room({ id: 'over', name: 'Over', x: 6, y: 6, w: 4, h: 4, placedAt: 2 }),
      room({ id: 'under', name: 'Under', x: 8, y: 6, w: 4, h: 4, placedAt: 1 }),
    ])

  it('carves the zones below', () => {
    const out = carveBelow(pair(), { ids: ['over'], storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(roomOf(out.sheet, 'under')))).toBe(8)
  })

  it('pushes the zones below aside', () => {
    const out = pushOthers(pair(), { ids: ['over'], storey: 0 })
    expect(out.result.moved).toEqual(['under'])
    expect(roomOf(out.sheet, 'under').x).toBe(10)
  })

  it('refuses when nothing lies under the zone', () => {
    const sheet = quiet([room()])
    expect(carveBelow(sheet, { ids: ['a'], storey: 0 }).result.said).toBe('Nothing lies under it.')
    expect(pushOthers(sheet, { ids: [], storey: 0 }).result.said).toBe('nothing selected')
  })

  it('cuts a room by the setback line, and says when nothing stands past it', () => {
    const sheet = quiet([room({ x: 0, y: 6, w: 4, h: 3 })])
    const out = cutToSetback(sheet, { ids: ['a'], storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(7.5)
    expect(cutToSetback(quiet([room()]), { ids: ['a'], storey: 0 }).result.said).toBe(
      'Nothing stands past the setback line.',
    )
  })
})

describe('a turned room cut and restored', () => {
  /**
   * The mock's own diwaniya: 5.38 × 7.16 turned 25°, with a 3 × 3 room standing over one corner. The
   * area it loses is the area the two really share, measured here by an independent clipper.
   */
  it('a 5.38 × 7.16 room turned 25° loses exactly the 3 × 3 overlap, and restore gives it back', () => {
    const diwaniya = room({ name: 'Diwaniya', x: 8, y: 8, w: 5.38, h: 7.16, angle: 25 })
    const cutter = room({ id: 'b', name: 'Cut', x: 7, y: 7, w: 3, h: 3 })
    const sheet = quiet([diwaniya, cutter])
    const whole = worldPieces(diwaniya)[0]!
    const bite = worldPieces(cutter)[0]!
    const left = differencePolygons(whole, [bite]).reduce(
      (sum, piece) => sum + (piece[0] ? clipArea(piece[0]) : 0),
      0,
    )
    const overlap = clipArea(whole) - left
    expect(overlap).toBeGreaterThan(1)
    const out = carveBelow(sheet, { ids: ['b'], storey: 0 })
    const cut = roomOf(out.sheet, 'a')
    expect(areaOf(diwaniya) - areaOf(cut)).toBeCloseTo(overlap, 4)
    const back = restore(out.sheet, { id: 'a', storey: 0 })
    expect(areaOf(roomOf(back.sheet, 'a'))).toBeCloseTo(5.38 * 7.16, 4)
    expect(roomOf(back.sheet, 'a').pieces).toBeNull()
  })

  it('refuses to restore a room that was never cut', () => {
    expect(restore(quiet([room()]), { id: 'a', storey: 0 }).result.said).toBe(
      'A has nothing to restore.',
    )
  })
})

describe('combining, grouping and locking', () => {
  it('combines two rooms that share a wall into the survivor', () => {
    const sheet = quiet([
      room({ id: 'a', name: 'A', x: 6, y: 6, w: 4, h: 3 }),
      room({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 3 }),
    ])
    const out = combine(sheet, { ids: ['a', 'b'], survivor: 'a', storey: 0 })
    expect(out.result.said).toBe('B combined into A')
    expect(r2(areaOf(roomOf(out.sheet, 'a')))).toBe(24)
    expect(roomOf(out.sheet, 'b').placed).toBe(false)
  })

  it('refuses rooms that share no wall', () => {
    const sheet = quiet([room(), room({ id: 'b', x: 14, y: 14 })])
    expect(combine(sheet, { ids: ['a', 'b'], survivor: 'a', storey: 0 }).result.said).toBe(
      'Those rooms do not share a wall, so they cannot be combined. Close the gap first.',
    )
    expect(combine(sheet, { ids: ['a'], survivor: 'a', storey: 0 }).result.said).toBe(
      'Pick the room that survives.',
    )
  })

  it('groups and ungroups', () => {
    const sheet = quiet([room(), room({ id: 'b', x: 14, y: 14 })])
    const grouped = group(sheet, { ids: ['a', 'b'], storey: 0 })
    expect(roomOf(grouped.sheet, 'a').group).toBe(roomOf(grouped.sheet, 'b').group)
    const out = ungroup(grouped.sheet, { ids: ['a'], storey: 0 })
    expect(roomOf(out.sheet, 'b').group).toBeUndefined()
    expect(group(sheet, { ids: ['a'], storey: 0 }).result.said).toBe(
      'Two rooms at least make a group.',
    )
    expect(ungroup(sheet, { ids: ['a'], storey: 0 }).result.said).toBe('Nothing here is grouped.')
  })

  it('locks and unlocks', () => {
    const sheet = quiet([room()])
    const locked = lock(sheet, { ids: ['a'], storey: 0 })
    expect(roomOf(locked.sheet, 'a').locked).toBe(true)
    expect(roomOf(unlock(locked.sheet, { ids: ['a'], storey: 0 }).sheet, 'a').locked).toBe(false)
    expect(lock(sheet, { ids: [], storey: 0 }).result.said).toBe('nothing selected')
  })
})

describe('the program', () => {
  it('sends a room back to the tray, shape, doors and all', () => {
    const sheet = quiet([
      room({
        pieces: [
          [
            [0, 0],
            [4, 0],
            [4, 3],
          ],
        ],
        angle: 25,
      }),
    ])
    const out = sendBack(sheet, { ids: ['a'] })
    const back = roomOf(out.sheet, 'a')
    expect([back.placed, back.pieces, back.angle]).toEqual([false, null, 0])
    expect(sendBack(sheet, { ids: ['nope'] }).result.said).toBe('nothing to send back')
  })

  it('takes a court off the sheet altogether', () => {
    const sheet = quiet([room({ id: 'x1', extra: true, fixed: true, kind: 'court', cat: 'open' })])
    sendBackRoom(sheet, sheet.rooms[0]!)
    expect(sheet.rooms.length).toBe(0)
  })

  it('adds a room of a kind at big, medium or small, or a typed area', () => {
    const sheet = quiet([])
    expect(addRoom(sheet, { kind: 'bedroom', size: 'big' }).sheet.rooms[0]!.target).toBe(22)
    expect(addRoom(sheet, { kind: 'bedroom', size: 'small' }).sheet.rooms[0]!.target).toBe(14)
    expect(addRoom(sheet, { kind: 'bedroom' }).sheet.rooms[0]!.target).toBe(18)
    const named = addRoom(sheet, { kind: 'bedroom', name: 'Boys', area: 16 })
    expect([named.sheet.rooms[0]!.name, named.sheet.rooms[0]!.target]).toEqual(['Boys', 16])
    expect(addRoom(sheet, { kind: 'nothing' }).result.said).toBe('no kind called nothing')
  })

  it('removes a room from the program', () => {
    const sheet = quiet([room()])
    expect(removeRoom(sheet, { id: 'a' }).sheet.rooms.length).toBe(0)
    expect(removeRoom(sheet, { id: 'b' }).result.said).toBe('no room called b')
  })

  it('reorders the program, which is the order of importance', () => {
    const sheet = quiet([room({ id: 'a' }), room({ id: 'b' }), room({ id: 'c' })])
    const out = reorder(sheet, { id: 'c', before: 'a' })
    expect(out.sheet.rooms.map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(reorder(sheet, { id: 'a', before: null }).sheet.rooms.map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(reorder(sheet, { id: 'a', before: 'a' }).result.said).toBe(
      'A room cannot move before itself.',
    )
    expect(reorder(sheet, { id: 'a', before: 'nope' }).result.said).toBe('no room called nope')
  })
})

describe('storeys and heights', () => {
  it('moves a room up a storey, held inside the setback there', () => {
    const sheet = quiet([room()])
    const out = setStorey(sheet, { ids: ['a'], storey: 0, to: 1 })
    expect(out.result.said).toBe('A on the first storey')
    expect(roomOf(out.sheet, 'a').storey).toBe(1)
  })

  it('refuses to move the stair, which stands on every storey', () => {
    const sheet = quiet([room({ kind: 'stair', cat: 'circulation' })])
    expect(setStorey(sheet, { ids: ['a'], storey: 0, to: 1 }).result.said).toBe(
      'The stair stands on every storey already.',
    )
  })

  it('copies a room to the storey above, with copy in its name', () => {
    const sheet = quiet([room()])
    const out = copyTo(sheet, { ids: ['a'], storey: 0, to: 1 })
    expect(out.result.born).toEqual(['A copy'])
    const copy = out.sheet.rooms.find((r) => r.name === 'A copy')!
    expect([copy.storey, copy.x, copy.y]).toEqual([1, 6, 6])
    expect(copyTo(sheet, { ids: [], storey: 0, to: 1 }).result.said).toBe('nothing to copy')
  })

  it('copies a room beside itself on the same storey', () => {
    const out = copyTo(quiet([room()]), { ids: ['a'], storey: 0, to: 0 })
    const copy = out.sheet.rooms.find((r) => r.name === 'A copy')!
    expect([copy.x, copy.y]).toEqual([7, 7])
  })

  it('adds a storey up to three and takes an empty top one away', () => {
    const one = addStorey(quiet([]))
    expect(one.sheet.storeyCount).toBe(3)
    expect(addStorey(one.sheet).result.said).toBe('The rulebook allows three floors.')
    expect(dropTopStorey(one.sheet).sheet.storeyCount).toBe(2)
    expect(dropTopStorey(quiet([])).result.said).toBe('The ground and the first storey stay.')
    const busy = addStorey(quiet([room({ storey: 2 })])).sheet
    expect(dropTopStorey(busy).result.said).toBe('The second storey is not empty.')
  })

  it('sets a height, snapping to the floor above, and gives it back to the storey', () => {
    const sheet = quiet([room()])
    const out = setHeight(sheet, { id: 'a', metres: 3.6 })
    expect(out.result.said).toBe('A 3.5 m · the floor above')
    expect(roomOf(out.sheet, 'a').height).toBe(3.5)
    expect(clearHeight(out.sheet, { id: 'a' }).sheet.rooms[0]!.height).toBeUndefined()
    expect(clearHeight(sheet, { id: 'a' }).result.said).toBe(
      'That room keeps its storey height already.',
    )
    expect(setHeight(sheet, { id: 'nope', metres: 4 }).result.said).toBe(
      'no such room on the sheet',
    )
  })
})

describe('enclosed spaces', () => {
  const ring = () =>
    quiet(
      [
        room({ id: 'n', name: 'N', x: 4, y: 4, w: 6, h: 2 }),
        room({ id: 's', name: 'S', x: 4, y: 10, w: 6, h: 2 }),
        room({ id: 'w', name: 'W', x: 4, y: 6, w: 2, h: 4 }),
        room({ id: 'e', name: 'E', x: 8, y: 6, w: 2, h: 4 }),
      ],
      { boundary: 'off' },
    )

  const holeIndex = (sheet: Sheet) => pocketsOf(sheet, 0).findIndex((p) => r2(p.area) === 8)

  it('gives the space to the room that walls it in', () => {
    const sheet = ring()
    const out = givePocket(sheet, { pocket: holeIndex(sheet), room: 'n', storey: 0 })
    expect(out.result.area).toBe(8)
    expect(r2(areaOf(roomOf(out.sheet, 'n')))).toBe(20)
  })

  it('makes a court of it when it is big enough, and says why not when it is not', () => {
    const sheet = ring()
    const i = holeIndex(sheet)
    expect(makeCourt(sheet, { pocket: i, storey: 0 }).result.said).toBe(
      '8 m² is under the 9 m² a court needs.',
    )
    const roomy = sheetOf(sheet.rooms, { boundary: 'off', courtArea: 8, closeGap: 0 })
    const out = makeCourt(roomy, { pocket: holeIndex(roomy), storey: 0 })
    expect(out.result.born).toEqual(['Court'])
    const court = out.sheet.rooms.find((r) => r.kind === 'court')!
    expect([court.fixed, court.cat, r2(areaOf(court))]).toEqual([true, 'open', 8])
  })

  it('makes a corridor of it, or gives it to the hallway that reaches it', () => {
    const sheet = ring()
    const out = makeCorridor(sheet, { pocket: holeIndex(sheet), storey: 0 })
    expect(out.result.born).toEqual(['Hallway'])
    const hall = out.sheet.rooms.find((r) => r.kind === 'hallway')!
    expect(r2(areaOf(hall))).toBe(8)
  })

  it('refuses when there is no space there', () => {
    expect(givePocket(quiet([room()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
    expect(makeCourt(quiet([room()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
    expect(makeCorridor(quiet([room()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
  })
})

describe('doors', () => {
  const walled = () => quiet([room({ x: 6, y: 6, w: 4, h: 3 })], { grid: 0.25, snapDist: 0.4 })

  it('puts a door on the wall under the hand', () => {
    const out = addDoor(walled(), { x: 8, y: 6, type: 'door', storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(out.result.said).toBe('Door on A, middle of the wall')
    expect(doorsOf(roomOf(out.sheet, 'a')).length).toBe(1)
  })

  it('refuses a door where there is no wall, and on the boundary', () => {
    expect(addDoor(walled(), { x: 1, y: 1, type: 'door', storey: 0 }).result.said).toBe(
      'No wall there.',
    )
    const onEdge = quiet([room({ x: 0, y: 6, w: 4, h: 3 })])
    expect(addDoor(onEdge, { x: 0, y: 7.5, type: 'door', storey: 0 }).result.said).toBe(
      'A wall on the boundary takes no door.',
    )
  })

  it('slides, widens, swings, hinges and removes a door', () => {
    const placed = addDoor(walled(), { x: 8, y: 6, type: 'door', storey: 0 }).sheet
    const id = doorsOf(roomOf(placed, 'a'))[0]!.id
    const slid = slideDoor(placed, { room: 'a', door: id, step: 0.25 })
    expect(r2(doorsOf(roomOf(slid.sheet, 'a'))[0]!.at[0])).toBe(2.25)
    const wide = setDoorWidth(placed, { room: 'a', door: id, w: 1.2 })
    expect(doorsOf(roomOf(wide.sheet, 'a'))[0]!.w).toBe(1.2)
    expect(doorsOf(roomOf(flipDoor(placed, { room: 'a', door: id }).sheet, 'a'))[0]!.flip).toBe(
      true,
    )
    expect(doorsOf(roomOf(hingeDoor(placed, { room: 'a', door: id }).sheet, 'a'))[0]!.hinge).toBe(
      true,
    )
    expect(doorsOf(roomOf(removeDoor(placed, { room: 'a', door: id }).sheet, 'a')).length).toBe(0)
  })

  it('refuses to adjust a door that is not there', () => {
    const sheet = walled()
    expect(slideDoor(sheet, { room: 'a', door: 'd9', step: 1 }).result.said).toBe('no such door')
    expect(setDoorWidth(sheet, { room: 'a', door: 'd9', w: 1 }).result.said).toBe('no such door')
    expect(removeDoor(sheet, { room: 'a', door: 'd9' }).result.said).toBe('no such door')
    expect(moveDoor(sheet, { room: 'a', door: 'd9', x: 8, y: 6, storey: 0 }).result.said).toBe(
      'no such door',
    )
  })

  it('refuses a swing on an opening and a hinge on a double door', () => {
    const placed = addDoor(walled(), { x: 8, y: 6, type: 'opening', storey: 0 }).sheet
    const id = doorsOf(roomOf(placed, 'a'))[0]!.id
    expect(flipDoor(placed, { room: 'a', door: id }).result.said).toBe('A opening does not swing.')
    expect(hingeDoor(placed, { room: 'a', door: id }).result.said).toBe('A opening has no hinge.')
  })

  it('moves a door to another room’s wall', () => {
    const sheet = quiet(
      [room({ x: 6, y: 6, w: 4, h: 3 }), room({ id: 'b', name: 'B', x: 12, y: 6, w: 4, h: 3 })],
      { grid: 0.25, snapDist: 0.4 },
    )
    const placed = addDoor(sheet, { x: 8, y: 6, type: 'door', storey: 0 }).sheet
    const id = doorsOf(roomOf(placed, 'a'))[0]!.id
    const out = moveDoor(placed, { room: 'a', door: id, x: 14, y: 6, storey: 0 })
    expect(out.result.said).toBe('Door on B')
    expect(doorsOf(roomOf(out.sheet, 'a')).length).toBe(0)
    expect(doorsOf(roomOf(out.sheet, 'b')).length).toBe(1)
  })

  it('puts a door that lost its wall back on the nearest wall', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 3 })], { grid: 0.25, snapDist: 0.4 })
    const placed = addDoor(sheet, { x: 8, y: 6, type: 'door', storey: 0 }).sheet
    const id = doorsOf(roomOf(placed, 'a'))[0]!.id
    roomOf(placed, 'a').doors![0]!.at = [2, 9]
    const out = reattachDoor(placed, { room: 'a', door: id, storey: 0 })
    expect(out.result.said).toBe('Door on A')
    expect(doorsOf(roomOf(out.sheet, 'a'))[0]!.at[1]).toBe(3)
  })

  it('refuses to put back a door that is on a wall already, or one that is not there', () => {
    const sheet = quiet([room({ x: 6, y: 6, w: 4, h: 3 })], { grid: 0.25, snapDist: 0.4 })
    const placed = addDoor(sheet, { x: 8, y: 6, type: 'door', storey: 0 }).sheet
    const id = doorsOf(roomOf(placed, 'a'))[0]!.id
    expect(reattachDoor(placed, { room: 'a', door: id, storey: 0 }).result.said).toBe(
      'That door is on a wall already.',
    )
    expect(reattachDoor(placed, { room: 'a', door: 'd9', storey: 0 }).result.said).toBe(
      'no such door',
    )
  })

  it('opens a wall two rooms share, and refuses one they do not', () => {
    const sheet = quiet(
      [room({ x: 6, y: 6, w: 4, h: 3 }), room({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 3 })],
      { grid: 0.25, snapDist: 0.4 },
    )
    const out = openWall(sheet, { x: 10, y: 7.5, storey: 0 })
    expect(out.result.ok).toBe(true)
    const opening = doorsOf(roomOf(out.sheet, 'a')).concat(doorsOf(roomOf(out.sheet, 'b')))[0]!
    expect(opening.type).toBe('open')
    expect(openWall(walled(), { x: 10, y: 7.5, storey: 0 }).result.said).toBe(
      'That wall meets no room. Only a wall shared with a neighbour can be opened.',
    )
  })
})

describe('settings', () => {
  it('changes a setting and holds the rooms to the new line', () => {
    const sheet = quiet([room({ x: 0, y: 0 })], { allowSpill: 1, boundary: 'all' })
    const out = setSetting(sheet, { name: 'allowSpill', value: 0 })
    expect(out.result.said).toBe('allowSpill is 0')
    const held = setSetting(out.sheet, { name: 'boundary', value: 'off' })
    expect(roomOf(held.sheet, 'a').x).toBe(1.5)
  })

  it('keeps every value inside its range and on its steps', () => {
    const sheet = quiet([])
    expect(setSetting(sheet, { name: 'jamb', value: 9 }).sheet.settings.jamb).toBe(0.5)
    expect(setSetting(sheet, { name: 'grid', value: 0.3 }).sheet.settings.grid).toBe(0.25)
    expect(setSetting(sheet, { name: 'rotSnap', value: 7 }).sheet.settings.rotSnap).toBe(5)
    expect(setSetting(sheet, { name: 'dur', value: 9999 }).sheet.settings.dur).toBe(1500)
    expect(setSetting(sheet, { name: 'rule', value: 'nonsense' }).sheet.settings.rule).toBe('wait')
    expect(
      setSetting(sheet, { name: 'color.shared', value: '#123456' }).sheet.settings.colors.shared,
    ).toBe('#123456')
  })

  it('refuses a setting it does not know and a value it cannot read', () => {
    const sheet = quiet([])
    expect(setSetting(sheet, { name: 'nothing', value: 1 }).result.said).toBe(
      'no setting called nothing',
    )
    expect(setSetting(sheet, { name: 'jamb', value: 'wide' }).result.said).toBe(
      'jamb takes a number.',
    )
    expect(setSetting(sheet, { name: 'boundary', value: 'somewhere' }).result.said).toBe(
      'boundary is one of off, sides, all.',
    )
    expect(setSetting(sheet, { name: 'color.nothing', value: '#123456' }).result.ok).toBe(false)
    expect(setSetting(sheet, { name: 'colors', value: {} }).result.ok).toBe(false)
  })

  it('resizes every hallway when the hallway width changes', () => {
    const sheet = quiet([
      room({ id: 'h', name: 'Hall', kind: 'hallway', cat: 'circulation', w: 1.8, h: 10 }),
    ])
    const out = setSetting(sheet, { name: 'hallW', value: 1.2 })
    expect(roomOf(out.sheet, 'h').w).toBe(1.2)
  })
})

describe('undo and redo', () => {
  it('goes back to the sheet as it was, and forward again', () => {
    const sheet = quiet([room()])
    let history = remember(newHistory(), sheet)
    const moved = move(sheet, { ids: ['a'], dx: 2, dy: 0, storey: 0 }).sheet
    const back = undo(moved, { history })
    expect(roomOf(back.sheet, 'a').x).toBe(6)
    history = back.history
    const forward = redo(back.sheet, { history })
    expect(roomOf(forward.sheet, 'a').x).toBe(8)
  })

  it('says when there is nothing to undo or redo', () => {
    const sheet = quiet([room()])
    expect(undo(sheet, { history: newHistory() }).result.said).toBe('Nothing to undo.')
    expect(redo(sheet, { history: newHistory() }).result.said).toBe('Nothing to redo.')
  })

  it('keeps 200 sheets and no more', () => {
    const sheet = quiet([room()])
    let history = newHistory()
    for (let i = 0; i < HISTORY_CAP + 5; i++) history = remember(history, sheet)
    expect(history.past.length).toBe(HISTORY_CAP)
  })

  it('drops what was undone as soon as something else is done', () => {
    const sheet = quiet([room()])
    const history = { past: [sheet], future: [sheet] }
    expect(remember(history, sheet).future).toEqual([])
  })
})

describe('the sheet under the actions', () => {
  it('keeps the report reading right after a move on the embedded sheet', () => {
    const sheet = sampleSheet()
    const out = move(sheet, { ids: ['r15'], dx: 0.5, dy: 0, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(report(out.sheet, 0).walk!.reached).toBe(17)
    expect(report(sheet, 0).placedArea).toBe(343.96)
  })

  it('keeps a drawn point on the plot and rests a room on the grid', () => {
    expect(drawnPoint(sheetOf([]), 0, [-4, 40])).toEqual([0, 25])
    expect(restOnGrid(room({ x: 6.1, y: 6.1 }), DEFAULTS).x).toBe(6)
  })
})

describe('a room’s own colour and where its name is written', () => {
  it('gives the selected rooms a colour and puts them back to their category’s', () => {
    const sheet = quiet([room()])
    const out = setColor(sheet, { ids: ['a'], color: '#123456' })
    expect(out.result.ok).toBe(true)
    expect(roomOf(out.sheet, 'a').color).toBe('#123456')
    expect(clearColor(out.sheet, { ids: ['a'] }).sheet.rooms[0]!.color).toBeUndefined()
  })

  it('refuses a colour that is not written as #rrggbb, and a reset with nothing to reset', () => {
    const sheet = quiet([room()])
    expect(setColor(sheet, { ids: ['a'], color: 'blue' }).result).toEqual({
      ok: false,
      said: 'A colour is written as #rrggbb.',
    })
    expect(clearColor(sheet, { ids: ['a'] }).result.ok).toBe(false)
    expect(setColor(sheet, { ids: ['nope'], color: '#123456' }).result.ok).toBe(false)
  })

  it('writes the name where the hand put it, and puts it back by itself', () => {
    const sheet = quiet([room()])
    const out = setLabel(sheet, { id: 'a', at: [1.5, 2] })
    expect(roomOf(out.sheet, 'a').labelAt).toEqual([1.5, 2])
    expect(clearLabel(out.sheet, { ids: ['a'] }).sheet.rooms[0]!.labelAt).toBeUndefined()
    expect(clearLabel(sheet, { ids: ['a'] }).result).toEqual({
      ok: false,
      said: 'Those names lie where they go by themselves.',
    })
  })

  it('refuses to write the name of a room that is not on the sheet', () => {
    const sheet = quiet([room({ placed: false })])
    expect(setLabel(sheet, { id: 'a', at: [1, 1] }).result).toEqual({
      ok: false,
      said: 'no such room on the sheet',
    })
  })
})
