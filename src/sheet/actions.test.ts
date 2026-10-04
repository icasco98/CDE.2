import { describe, expect, it } from 'vitest'
import {
  addDoor,
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
  place,
  pullEdge,
  pushOthers,
  redo,
  remember,
  removeDoor,
  reshape,
  resize,
  restOnGrid,
  restore,
  sendBack,
  sendBackZone,
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
import { DEFAULTS, doorsOf, sheetOf, type Poly, type Zone, type Sheet } from './model'
import { areaOf, outlineOf, r2, worldPieces } from './geometry'
import { differencePolygons, area as clipArea } from '../geometry/polygon'
import { fixtureSheet } from './fixture'
import { report } from './report'
import { drawnDoors } from './doors'
import { pocketsOf } from './pockets'

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 'a',
  name: 'A',
  kind: 'zone',
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

const quiet = (zones: Zone[], settings = {}): Sheet =>
  sheetOf(zones, { closeGap: 0, snapDist: 0, grid: 0, ...settings })

const zoneOf = (sheet: Sheet, id: string) => sheet.zones.find((r) => r.id === id)!

describe('placing and moving', () => {
  it('drops a zone from the program where the hand puts it', () => {
    const sheet = quiet([zone({ placed: false })])
    const out = place(sheet, { id: 'a', x: 8, y: 9, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(out.result.at).toEqual({ x: 8, y: 9, w: 4, h: 3 })
    expect(out.result.said).toBe('A at 8,9 4×3')
    expect(zoneOf(out.sheet, 'a').placed).toBe(true)
    expect(sheet.zones[0]!.placed).toBe(false)
  })

  it('refuses to place a locked zone, and leaves the sheet alone', () => {
    const sheet = quiet([zone({ locked: true })])
    const out = place(sheet, { id: 'a', x: 1, y: 1, storey: 0 })
    expect(out.result).toEqual({ ok: false, said: 'A is locked' })
    expect(out.sheet).toBe(sheet)
    expect(place(sheet, { id: 'nope', x: 1, y: 1, storey: 0 }).result.said).toBe(
      'no zone called nope',
    )
  })

  it('holds a dropped zone inside the line the ground floor may reach', () => {
    const sheet = quiet([zone({ placed: false })], { allowSpill: 0, boundary: 'off' })
    const out = place(sheet, { id: 'a', x: 0, y: 0, storey: 0 })
    expect([out.result.at!.x, out.result.at!.y]).toEqual([1.5, 1.5])
  })

  it('moves a zone and its group as one', () => {
    const sheet = quiet([zone({ group: 'g1' }), zone({ id: 'b', x: 12, y: 6, group: 'g1' })])
    const out = move(sheet, { ids: ['a', 'b'], dx: 1, dy: 2, storey: 0 })
    expect([zoneOf(out.sheet, 'a').x, zoneOf(out.sheet, 'a').y]).toEqual([7, 8])
    expect([zoneOf(out.sheet, 'b').x, zoneOf(out.sheet, 'b').y]).toEqual([13, 8])
  })

  it('keeps a move to one axis when asked', () => {
    const sheet = quiet([zone()])
    const out = move(sheet, { ids: ['a'], dx: 1, dy: 2, storey: 0, axisLock: true })
    expect([zoneOf(out.sheet, 'a').x, zoneOf(out.sheet, 'a').y]).toEqual([6, 8])
  })

  it('refuses to move nothing, or a locked zone', () => {
    expect(move(quiet([zone()]), { ids: [], dx: 1, dy: 0, storey: 0 }).result.ok).toBe(false)
    expect(
      move(quiet([zone({ locked: true })]), { ids: ['a'], dx: 1, dy: 0, storey: 0 }).result.said,
    ).toBe('nothing to move')
  })

  it('turns a zone a quarter, to an angle, and to face north', () => {
    const sheet = quiet([zone()])
    expect(zoneOf(turn(sheet, { ids: ['a'], storey: 0, quarter: true }).sheet, 'a').w).toBe(3)
    expect(turn(sheet, { ids: ['a'], storey: 0, angle: 37 }).result.said).toBe('A at 30°')
    expect(turn(sheet, { ids: ['a'], storey: 0, faceNorth: true }).result.said).toBe('A at 25°')
  })

  it('snaps a turn onto a neighbour’s angle', () => {
    const sheet = quiet([zone(), zone({ id: 'b', x: 12, y: 12, angle: 25 })])
    expect(turn(sheet, { ids: ['a'], storey: 0, angle: 27 }).result.said).toBe('A at 25°')
  })

  it('refuses to turn nothing', () => {
    expect(turn(quiet([zone()]), { ids: [], storey: 0, quarter: true }).result.said).toBe(
      'nothing to turn',
    )
  })

  it('mirrors a zone, and refuses when nothing is in hand', () => {
    const sheet = quiet([
      zone({
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
    expect(zoneOf(out.sheet, 'a').pieces![0]).toEqual([
      [0, 3],
      [0, 0],
      [4, 0],
    ])
    expect(mirror(sheet, { ids: [], axis: 'y', storey: 0 }).result.said).toBe('nothing to mirror')
  })
})

describe('edges, corners and sizes', () => {
  it('pulls an edge out and the zone grows', () => {
    const sheet = quiet([zone({ x: 6, y: 6, w: 4, h: 4 })])
    const seg = outlineOf(sheet.zones[0]!).findIndex((s) => s.n[0] === 1)
    const out = pullEdge(sheet, { id: 'a', edge: seg, distance: 1, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(20)
  })

  it('refuses an edge that is not there, and a locked zone', () => {
    const sheet = quiet([zone()])
    expect(pullEdge(sheet, { id: 'a', edge: 9, distance: 1, storey: 0 }).result.said).toBe(
      'A has no such edge',
    )
    expect(
      pullEdge(quiet([zone({ locked: true })]), { id: 'a', edge: 0, distance: 1, storey: 0 }).result
        .said,
    ).toBe('A is locked')
  })

  it('moves one corner of a drawn zone', () => {
    const drawn = zone({
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
    expect(areaOf(zoneOf(out.sheet, 'a'))).toBeLessThan(16)
  })

  it('refuses a corner on a plain zone and a shape that crosses itself', () => {
    expect(
      moveCorner(quiet([zone()]), { id: 'a', corner: 0, point: [7, 7], storey: 0 }).result.said,
    ).toBe('Only a carved or drawn zone has corners to move.')
  })

  it('drags a side, and a shared edge drags both zones', () => {
    const sheet = quiet([
      zone({ x: 6, y: 6, w: 4, h: 3 }),
      zone({ id: 'b', x: 10, y: 6, w: 4, h: 3 }),
    ])
    const out = resize(sheet, { id: 'a', side: 'right', distance: 1, shared: 'b', storey: 0 })
    expect(zoneOf(out.sheet, 'a').w).toBe(5)
    expect([zoneOf(out.sheet, 'b').x, zoneOf(out.sheet, 'b').w]).toEqual([11, 3])
  })

  it('refuses to resize a locked zone', () => {
    expect(
      resize(quiet([zone({ locked: true })]), { id: 'a', side: 'top', distance: 1, storey: 0 })
        .result.said,
    ).toBe('A is locked')
  })

  it('takes a typed size and a typed area', () => {
    const sheet = quiet([zone()])
    expect(zoneOf(setSize(sheet, { id: 'a', w: 5, storey: 0 }).sheet, 'a').w).toBe(5)
    const areaOut = setArea(sheet, { id: 'a', area: 24, storey: 0 })
    expect(r2(areaOf(zoneOf(areaOut.sheet, 'a')))).toBeCloseTo(24, 1)
  })

  it('refuses a size or an area out of its range', () => {
    const sheet = quiet([zone()])
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

  it('draws a rectangle as the zone’s footprint', () => {
    const out = draw(quiet([zone({ placed: false })]), {
      id: 'a',
      polygon: square,
      shape: 'rect',
      storey: 0,
    })
    expect(out.result.ok).toBe(true)
    expect(zoneOf(out.sheet, 'a').pieces).toBeNull()
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(16)
  })

  it('draws a polygon as convex pieces', () => {
    const out = draw(quiet([zone({ placed: false })]), {
      id: 'a',
      polygon: [
        [6, 6],
        [10, 6],
        [10, 10],
      ],
      shape: 'poly',
      storey: 0,
    })
    expect(zoneOf(out.sheet, 'a').pieces!.length).toBe(1)
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(8)
  })

  it('refuses a shape too small or crossing itself', () => {
    const sheet = quiet([zone({ placed: false })])
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
    const sheet = quiet([zone({ x: 6, y: 6, w: 4, h: 4 })])
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
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(12)
  })

  it('adds a touching shape outside the zone', () => {
    const sheet = quiet([zone({ x: 6, y: 6, w: 4, h: 4 })])
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
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(24)
  })

  it('splits the smaller part off into the program', () => {
    const sheet = quiet([zone({ x: 6, y: 6, w: 6, h: 4 })])
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
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(12)
  })

  it('refuses a shape that does not touch, and one that would take the whole zone', () => {
    const sheet = quiet([zone({ x: 6, y: 6, w: 4, h: 4 })])
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
    ).toBe('The shape does not touch the zone, so nothing changed.')
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
    ).toBe('That would take the whole zone away.')
  })
})

describe('settling an overlap by hand', () => {
  const pair = () =>
    quiet([
      zone({ id: 'over', name: 'Over', x: 6, y: 6, w: 4, h: 4, placedAt: 2 }),
      zone({ id: 'under', name: 'Under', x: 8, y: 6, w: 4, h: 4, placedAt: 1 }),
    ])

  it('carves the zones below', () => {
    const out = carveBelow(pair(), { ids: ['over'], storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(zoneOf(out.sheet, 'under')))).toBe(8)
  })

  it('pushes the zones below aside', () => {
    const out = pushOthers(pair(), { ids: ['over'], storey: 0 })
    expect(out.result.moved).toEqual(['under'])
    expect(zoneOf(out.sheet, 'under').x).toBe(10)
  })

  it('refuses when nothing lies under the zone', () => {
    const sheet = quiet([zone()])
    expect(carveBelow(sheet, { ids: ['a'], storey: 0 }).result.said).toBe('Nothing lies under it.')
    expect(pushOthers(sheet, { ids: [], storey: 0 }).result.said).toBe('nothing selected')
  })

  it('cuts a zone by the setback line, and says when nothing stands past it', () => {
    const sheet = quiet([zone({ x: 0, y: 6, w: 4, h: 3 })])
    const out = cutToSetback(sheet, { ids: ['a'], storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(7.5)
    expect(cutToSetback(quiet([zone()]), { ids: ['a'], storey: 0 }).result.said).toBe(
      'Nothing stands past the setback line.',
    )
  })
})

describe('a turned zone cut and restored', () => {
  /**
   * The mock's own diwaniya: 5.38 × 7.16 turned 25°, with a 3 × 3 zone standing over one corner. The
   * area it loses is the area the two really share, measured here by an independent clipper.
   */
  it('a 5.38 × 7.16 zone turned 25° loses exactly the 3 × 3 overlap, and restore gives it back', () => {
    const diwaniya = zone({ name: 'Diwaniya', x: 8, y: 8, w: 5.38, h: 7.16, angle: 25 })
    const cutter = zone({ id: 'b', name: 'Cut', x: 7, y: 7, w: 3, h: 3 })
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
    const cut = zoneOf(out.sheet, 'a')
    expect(areaOf(diwaniya) - areaOf(cut)).toBeCloseTo(overlap, 4)
    const back = restore(out.sheet, { id: 'a', storey: 0 })
    expect(areaOf(zoneOf(back.sheet, 'a'))).toBeCloseTo(5.38 * 7.16, 4)
    expect(zoneOf(back.sheet, 'a').pieces).toBeNull()
  })

  it('refuses to restore a zone that was never cut', () => {
    expect(restore(quiet([zone()]), { id: 'a', storey: 0 }).result.said).toBe(
      'A has nothing to restore.',
    )
  })
})

describe('combining, grouping and locking', () => {
  it('combines two zones that share an edge into the survivor', () => {
    const sheet = quiet([
      zone({ id: 'a', name: 'A', x: 6, y: 6, w: 4, h: 3 }),
      zone({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 3 }),
    ])
    const out = combine(sheet, { ids: ['a', 'b'], survivor: 'a', storey: 0 })
    expect(out.result.said).toBe('B combined into A')
    expect(r2(areaOf(zoneOf(out.sheet, 'a')))).toBe(24)
    expect(zoneOf(out.sheet, 'b').placed).toBe(false)
  })

  it('refuses zones that share no edge', () => {
    const sheet = quiet([zone(), zone({ id: 'b', x: 14, y: 14 })])
    expect(combine(sheet, { ids: ['a', 'b'], survivor: 'a', storey: 0 }).result.said).toBe(
      'Those zones do not share an edge, so they cannot be combined. Close the gap first.',
    )
    expect(combine(sheet, { ids: ['a'], survivor: 'a', storey: 0 }).result.said).toBe(
      'Pick the zone that survives.',
    )
  })

  it('groups and ungroups', () => {
    const sheet = quiet([zone(), zone({ id: 'b', x: 14, y: 14 })])
    const grouped = group(sheet, { ids: ['a', 'b'], storey: 0 })
    expect(zoneOf(grouped.sheet, 'a').group).toBe(zoneOf(grouped.sheet, 'b').group)
    const out = ungroup(grouped.sheet, { ids: ['a'], storey: 0 })
    expect(zoneOf(out.sheet, 'b').group).toBeUndefined()
    expect(group(sheet, { ids: ['a'], storey: 0 }).result.said).toBe(
      'Two zones at least make a group.',
    )
    expect(ungroup(sheet, { ids: ['a'], storey: 0 }).result.said).toBe('Nothing here is grouped.')
  })

  it('locks and unlocks', () => {
    const sheet = quiet([zone()])
    const locked = lock(sheet, { ids: ['a'], storey: 0 })
    expect(zoneOf(locked.sheet, 'a').locked).toBe(true)
    expect(zoneOf(unlock(locked.sheet, { ids: ['a'], storey: 0 }).sheet, 'a').locked).toBe(false)
    expect(lock(sheet, { ids: [], storey: 0 }).result.said).toBe('nothing selected')
  })
})

describe('the program', () => {
  it('sends a zone back to the tray, shape, doors and all', () => {
    const sheet = quiet([
      zone({
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
    const back = zoneOf(out.sheet, 'a')
    expect([back.placed, back.pieces, back.angle]).toEqual([false, null, 0])
    expect(sendBack(sheet, { ids: ['nope'] }).result.said).toBe('nothing to send back')
  })

  it('sends a court back to the program like any zone, no longer fixed', () => {
    const sheet = quiet([zone({ id: 'x1', fixed: true, kind: 'court', cat: 'open' })])
    sendBackZone(sheet, sheet.zones[0]!)
    expect([sheet.zones.length, sheet.zones[0]!.placed, sheet.zones[0]!.fixed]).toEqual([
      1,
      false,
      undefined,
    ])
  })

  it('keeps a zone’s doors when it goes back, to stand again wherever it is placed', () => {
    const sheet = quiet([
      zone({
        doors: [
          {
            id: 'd1',
            connection: 'e1',
            to: 'b',
            type: 'door',
            w: 0.9,
            along: 0.5,
            flip: false,
            hinge: false,
          },
        ],
      }),
    ])
    expect(doorsOf(zoneOf(sendBack(sheet, { ids: ['a'] }).sheet, 'a'))).toHaveLength(1)
  })
})

describe('storeys and heights', () => {
  it('moves a zone up a storey, held inside the setback there', () => {
    const sheet = quiet([zone()])
    const out = setStorey(sheet, { ids: ['a'], storey: 0, to: 1 })
    expect(out.result.said).toBe('A on the first storey')
    expect(zoneOf(out.sheet, 'a').storey).toBe(1)
  })

  it('refuses to move the stair, which stands on every storey', () => {
    const sheet = quiet([zone({ kind: 'stair', cat: 'circulation' })])
    expect(setStorey(sheet, { ids: ['a'], storey: 0, to: 1 }).result.said).toBe(
      'The stair stands on every storey already.',
    )
  })

  it('copies a zone to the storey above, with copy in its name', () => {
    const sheet = quiet([zone()])
    const out = copyTo(sheet, { ids: ['a'], storey: 0, to: 1 })
    expect(out.result.born).toEqual(['A copy'])
    const copy = out.sheet.zones.find((r) => r.name === 'A copy')!
    expect([copy.storey, copy.x, copy.y]).toEqual([1, 6, 6])
    expect(copyTo(sheet, { ids: [], storey: 0, to: 1 }).result.said).toBe('nothing to copy')
  })

  it('copies a zone beside itself on the same storey', () => {
    const out = copyTo(quiet([zone()]), { ids: ['a'], storey: 0, to: 0 })
    const copy = out.sheet.zones.find((r) => r.name === 'A copy')!
    expect([copy.x, copy.y]).toEqual([7, 7])
  })

  it('adds a storey up to three and takes an empty top one away', () => {
    const one = addStorey(quiet([]))
    expect(one.sheet.storeyCount).toBe(3)
    expect(addStorey(one.sheet).result.said).toBe('The rulebook allows three floors.')
    expect(dropTopStorey(one.sheet).sheet.storeyCount).toBe(2)
    expect(dropTopStorey(quiet([])).result.said).toBe('The ground and the first storey stay.')
    const busy = addStorey(quiet([zone({ storey: 2 })])).sheet
    expect(dropTopStorey(busy).result.said).toBe('The second storey is not empty.')
  })

  it('sets a height, snapping to the floor above, and gives it back to the storey', () => {
    const sheet = quiet([zone()])
    const out = setHeight(sheet, { id: 'a', metres: 3.6 })
    expect(out.result.said).toBe('A 3.5 m · the floor above')
    expect(zoneOf(out.sheet, 'a').height).toBe(3.5)
    expect(clearHeight(out.sheet, { id: 'a' }).sheet.zones[0]!.height).toBeUndefined()
    expect(clearHeight(sheet, { id: 'a' }).result.said).toBe(
      'That zone keeps its storey height already.',
    )
    expect(setHeight(sheet, { id: 'nope', metres: 4 }).result.said).toBe(
      'no such zone on the sheet',
    )
  })
})

describe('enclosed spaces', () => {
  const ring = () =>
    quiet(
      [
        zone({ id: 'n', name: 'N', x: 4, y: 4, w: 6, h: 2 }),
        zone({ id: 's', name: 'S', x: 4, y: 10, w: 6, h: 2 }),
        zone({ id: 'w', name: 'W', x: 4, y: 6, w: 2, h: 4 }),
        zone({ id: 'e', name: 'E', x: 8, y: 6, w: 2, h: 4 }),
      ],
      { boundary: 'off' },
    )

  const holeIndex = (sheet: Sheet) => pocketsOf(sheet, 0).findIndex((p) => r2(p.area) === 8)

  it('gives the space to the zone that encloses it', () => {
    const sheet = ring()
    const out = givePocket(sheet, { pocket: holeIndex(sheet), zone: 'n', storey: 0 })
    expect(out.result.area).toBe(8)
    expect(r2(areaOf(zoneOf(out.sheet, 'n')))).toBe(20)
  })

  it('makes a court of it when it is big enough, and says why not when it is not', () => {
    const sheet = ring()
    const i = holeIndex(sheet)
    expect(makeCourt(sheet, { pocket: i, storey: 0 }).result.said).toBe(
      '8 m² is under the 9 m² a court needs.',
    )
    const roomy = sheetOf(sheet.zones, { boundary: 'off', courtArea: 8, closeGap: 0 })
    const out = makeCourt(roomy, { pocket: holeIndex(roomy), storey: 0 })
    expect(out.result.born).toEqual(['Court'])
    const court = out.sheet.zones.find((r) => r.kind === 'court')!
    expect([court.fixed, court.cat, r2(areaOf(court))]).toEqual([true, 'open', 8])
  })

  it('makes a corridor of it, or gives it to the hallway that reaches it', () => {
    const sheet = ring()
    const out = makeCorridor(sheet, { pocket: holeIndex(sheet), storey: 0 })
    expect(out.result.born).toEqual(['Hallway'])
    const hall = out.sheet.zones.find((r) => r.kind === 'hallway')!
    expect(r2(areaOf(hall))).toBe(8)
  })

  it('refuses when there is no space there', () => {
    expect(givePocket(quiet([zone()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
    expect(makeCourt(quiet([zone()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
    expect(makeCorridor(quiet([zone()]), { pocket: 9, storey: 0 }).result.said).toBe(
      'No enclosed space there.',
    )
  })
})

describe('doors', () => {
  const alone = () => quiet([zone({ x: 6, y: 6, w: 4, h: 3 })], { grid: 0.25, snapDist: 0.4 })
  const out = { connection: 'e1', to: 'EXTERIOR' }
  /** A beside B, sharing the edge x = 10 from y 6 to 9. */
  const pair = () =>
    quiet(
      [zone({ x: 6, y: 6, w: 4, h: 3 }), zone({ id: 'b', name: 'B', x: 10, y: 6, w: 4, h: 3 })],
      { grid: 0.25, snapDist: 0.4 },
    )

  it('puts a door on the edge under the hand, drawing the connection it is given', () => {
    const placed = addDoor(alone(), { x: 8, y: 6, type: 'door', storey: 0, ...out })
    expect(placed.result.ok).toBe(true)
    expect(placed.result.said).toBe('Door on A, middle of the edge')
    expect(doorsOf(zoneOf(placed.sheet, 'a'))).toMatchObject([
      { connection: 'e1', to: 'EXTERIOR', at: [2, 0] },
    ])
  })

  it('puts a door between two zones on the edge they share, halfway along it', () => {
    const placed = addDoor(pair(), {
      x: 10,
      y: 7.5,
      type: 'door',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    expect(placed.result.ok).toBe(true)
    expect(doorsOf(zoneOf(placed.sheet, 'a'))).toMatchObject([
      { connection: 'e2', to: 'b', along: 0.5 },
    ])
  })

  it('puts a second door on a connection beside the first, and keeps the connection met when one goes', () => {
    const once = addDoor(pair(), {
      x: 10,
      y: 6.6,
      type: 'door',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    const twice = addDoor(once.sheet, {
      x: 10,
      y: 8.2,
      type: 'sliding',
      width: 1.2,
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    expect(twice.result.ok).toBe(true)
    const doors = doorsOf(zoneOf(twice.sheet, 'a')).concat(doorsOf(zoneOf(twice.sheet, 'b')))
    expect(doors.map((d) => [d.connection, d.type])).toEqual([
      ['e2', 'door'],
      ['e2', 'sliding'],
    ])
    const first = doors[0]!
    const host = twice.sheet.zones.find((r) => doorsOf(r).includes(first))!
    const left = removeDoor(twice.sheet, { zone: host.id, door: first.id }).sheet
    expect(drawnDoors(left, 0).map((each) => [each.door.connection, each.door.type])).toEqual([
      ['e2', 'sliding'],
    ])
  })

  it('refuses a door that would overlap one already on the edge', () => {
    const once = addDoor(pair(), {
      x: 10,
      y: 7.5,
      type: 'door',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    const onTop = addDoor(once.sheet, {
      x: 10,
      y: 7.9,
      type: 'door',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    expect(onTop.result.ok).toBe(false)
    expect(onTop.result.said).toBe("That would overlap the door already on A's edge.")
    expect(onTop.sheet).toBe(once.sheet)
  })

  it('refuses a door where there is no edge, on the boundary, and on an edge the two do not share', () => {
    expect(addDoor(alone(), { x: 1, y: 1, type: 'door', storey: 0, ...out }).result.said).toBe(
      'No edge there.',
    )
    const onBoundary = quiet([zone({ x: 0, y: 6, w: 4, h: 3 })])
    expect(addDoor(onBoundary, { x: 0, y: 7.5, type: 'door', storey: 0, ...out }).result.said).toBe(
      'An edge on the boundary takes no door.',
    )
    expect(
      addDoor(pair(), { x: 8, y: 6, type: 'door', storey: 0, connection: 'e2', to: 'b' }).result
        .said,
    ).toBe('A and B share no edge there.')
  })

  it('slides, widens, swings, hinges and removes a door', () => {
    const placed = addDoor(alone(), { x: 8, y: 6, type: 'door', storey: 0, ...out }).sheet
    const id = doorsOf(zoneOf(placed, 'a'))[0]!.id
    const slid = slideDoor(placed, { zone: 'a', door: id, step: 0.25, storey: 0 })
    expect(r2(doorsOf(zoneOf(slid.sheet, 'a'))[0]!.at![0])).toBe(2.25)
    const wide = setDoorWidth(placed, { zone: 'a', door: id, w: 1.2, storey: 0 })
    expect(doorsOf(zoneOf(wide.sheet, 'a'))[0]!.w).toBe(1.2)
    // the 4 m edge holds a 3 m door with 5 cm to spare at each end, and nothing wider
    expect(setDoorWidth(placed, { zone: 'a', door: id, w: 3, storey: 0 }).result.ok).toBe(true)
    const narrow = quiet([zone({ x: 6, y: 6, w: 2.6, h: 3 })], { grid: 0.25, snapDist: 0.4 })
    const inNarrow = addDoor(narrow, { x: 7.3, y: 6, type: 'door', storey: 0, ...out }).sheet
    const narrowId = doorsOf(zoneOf(inNarrow, 'a'))[0]!.id
    expect(
      setDoorWidth(inNarrow, { zone: 'a', door: narrowId, w: 2.6, storey: 0 }).result.said,
    ).toBe('That edge is too short for a door that wide.')
    expect(doorsOf(zoneOf(flipDoor(placed, { zone: 'a', door: id }).sheet, 'a'))[0]!.flip).toBe(
      true,
    )
    expect(doorsOf(zoneOf(hingeDoor(placed, { zone: 'a', door: id }).sheet, 'a'))[0]!.hinge).toBe(
      true,
    )
    expect(doorsOf(zoneOf(removeDoor(placed, { zone: 'a', door: id }).sheet, 'a')).length).toBe(0)
  })

  it('refuses to adjust a door that is not there', () => {
    const sheet = alone()
    expect(slideDoor(sheet, { zone: 'a', door: 'd9', step: 1, storey: 0 }).result.said).toBe(
      'no such door',
    )
    expect(setDoorWidth(sheet, { zone: 'a', door: 'd9', w: 1, storey: 0 }).result.said).toBe(
      'no such door',
    )
    expect(removeDoor(sheet, { zone: 'a', door: 'd9' }).result.said).toBe('no such door')
    expect(moveDoor(sheet, { zone: 'a', door: 'd9', x: 8, y: 6, storey: 0 }).result.said).toBe(
      'no such door',
    )
  })

  it('refuses a swing on an opening and a hinge on a double door', () => {
    const placed = addDoor(alone(), { x: 8, y: 6, type: 'opening', storey: 0, ...out }).sheet
    const id = doorsOf(zoneOf(placed, 'a'))[0]!.id
    expect(flipDoor(placed, { zone: 'a', door: id }).result.said).toBe('A opening does not swing.')
    expect(hingeDoor(placed, { zone: 'a', door: id }).result.said).toBe('A opening has no hinge.')
  })

  it('slides a door along the edge its zones share, and never onto another edge', () => {
    const placed = addDoor(pair(), {
      x: 10,
      y: 7.5,
      type: 'door',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    const id = doorsOf(zoneOf(placed.sheet, 'a'))[0]!.id
    const slid = moveDoor(placed.sheet, { zone: 'a', door: id, x: 10, y: 8.2, storey: 0 })
    expect(slid.result.ok).toBe(true)
    expect(r2(doorsOf(zoneOf(slid.sheet, 'a'))[0]!.along!)).toBe(0.73)
    expect(
      moveDoor(placed.sheet, { zone: 'a', door: id, x: 14, y: 6, storey: 0 }).result.said,
    ).toBe('A door stays on the edge A and B share.')
  })

  it('opens the whole edge two zones share, and refuses one they do not', () => {
    const opened = addDoor(pair(), {
      x: 10,
      y: 7.5,
      type: 'open',
      storey: 0,
      connection: 'e2',
      to: 'b',
    })
    expect(opened.result.said).toBe('A: edge opened')
    expect(doorsOf(zoneOf(opened.sheet, 'a'))).toMatchObject([
      { type: 'open', w: 2.9, along: 0.5, connection: 'e2' },
    ])
    expect(addDoor(alone(), { x: 10, y: 7.5, type: 'open', storey: 0, ...out }).result.said).toBe(
      'Only an edge shared with a neighbour can be opened.',
    )
  })

  it('keeps the connection it draws when the door slides', () => {
    const placed = addDoor(alone(), { x: 8, y: 6, type: 'door', storey: 0, ...out }).sheet
    const door = doorsOf(zoneOf(placed, 'a'))[0]!
    const slid = slideDoor(placed, { zone: 'a', door: door.id, step: 0.25, storey: 0 })
    expect(doorsOf(zoneOf(slid.sheet, 'a'))[0]!).toMatchObject({ connection: 'e1', to: 'EXTERIOR' })
  })
})

describe('settings', () => {
  it('changes a setting and holds the zones to the new line', () => {
    const sheet = quiet([zone({ x: 0, y: 0 })], { allowSpill: 1, boundary: 'all' })
    const out = setSetting(sheet, { name: 'allowSpill', value: 0 })
    expect(out.result.said).toBe('allowSpill is 0')
    const held = setSetting(out.sheet, { name: 'boundary', value: 'off' })
    expect(zoneOf(held.sheet, 'a').x).toBe(1.5)
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
      zone({ id: 'h', name: 'Hall', kind: 'hallway', cat: 'circulation', w: 1.8, h: 10 }),
    ])
    const out = setSetting(sheet, { name: 'hallW', value: 1.2 })
    expect(zoneOf(out.sheet, 'h').w).toBe(1.2)
  })
})

describe('undo and redo', () => {
  it('goes back to the sheet as it was, and forward again', () => {
    const sheet = quiet([zone()])
    let history = remember(newHistory(), sheet)
    const moved = move(sheet, { ids: ['a'], dx: 2, dy: 0, storey: 0 }).sheet
    const back = undo(moved, { history })
    expect(zoneOf(back.sheet, 'a').x).toBe(6)
    history = back.history
    const forward = redo(back.sheet, { history })
    expect(zoneOf(forward.sheet, 'a').x).toBe(8)
  })

  it('says when there is nothing to undo or redo', () => {
    const sheet = quiet([zone()])
    expect(undo(sheet, { history: newHistory() }).result.said).toBe('Nothing to undo.')
    expect(redo(sheet, { history: newHistory() }).result.said).toBe('Nothing to redo.')
  })

  it('keeps 200 sheets and no more', () => {
    const sheet = quiet([zone()])
    let history = newHistory()
    for (let i = 0; i < HISTORY_CAP + 5; i++) history = remember(history, sheet)
    expect(history.past.length).toBe(HISTORY_CAP)
  })

  it('drops what was undone as soon as something else is done', () => {
    const sheet = quiet([zone()])
    const history = { past: [sheet], future: [sheet] }
    expect(remember(history, sheet).future).toEqual([])
  })
})

describe('the sheet under the actions', () => {
  it('keeps the report reading right after a move on the test plan', () => {
    const sheet = fixtureSheet()
    const out = move(sheet, { ids: ['r15'], dx: 0.5, dy: 0, storey: 0 })
    expect(out.result.ok).toBe(true)
    expect(report(out.sheet, 0).placedArea).toBe(343.96)
    expect(report(sheet, 0).placedArea).toBe(343.96)
  })

  it('keeps a drawn point on the plot and rests a zone on the grid', () => {
    expect(drawnPoint(sheetOf([]), 0, [-4, 40])).toEqual([0, 25])
    expect(restOnGrid(zone({ x: 6.1, y: 6.1 }), DEFAULTS).x).toBe(6)
  })
})

describe('a zone’s own colour and where its name is written', () => {
  it('gives the selected zones a colour and puts them back to their category’s', () => {
    const sheet = quiet([zone()])
    const out = setColor(sheet, { ids: ['a'], color: '#123456' })
    expect(out.result.ok).toBe(true)
    expect(zoneOf(out.sheet, 'a').color).toBe('#123456')
    expect(clearColor(out.sheet, { ids: ['a'] }).sheet.zones[0]!.color).toBeUndefined()
  })

  it('refuses a colour that is not written as #rrggbb, and a reset with nothing to reset', () => {
    const sheet = quiet([zone()])
    expect(setColor(sheet, { ids: ['a'], color: 'blue' }).result).toEqual({
      ok: false,
      said: 'A colour is written as #rrggbb.',
    })
    expect(clearColor(sheet, { ids: ['a'] }).result.ok).toBe(false)
    expect(setColor(sheet, { ids: ['nope'], color: '#123456' }).result.ok).toBe(false)
  })

  it('writes the name where the hand put it, and puts it back by itself', () => {
    const sheet = quiet([zone()])
    const out = setLabel(sheet, { id: 'a', at: [1.5, 2] })
    expect(zoneOf(out.sheet, 'a').labelAt).toEqual([1.5, 2])
    expect(clearLabel(out.sheet, { ids: ['a'] }).sheet.zones[0]!.labelAt).toBeUndefined()
    expect(clearLabel(sheet, { ids: ['a'] }).result).toEqual({
      ok: false,
      said: 'Those names lie where they go by themselves.',
    })
  })

  it('refuses to write the name of a zone that is not on the sheet', () => {
    const sheet = quiet([zone({ placed: false })])
    expect(setLabel(sheet, { id: 'a', at: [1, 1] }).result).toEqual({
      ok: false,
      said: 'no such zone on the sheet',
    })
  })
})
