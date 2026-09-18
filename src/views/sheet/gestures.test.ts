import { describe, expect, it } from 'vitest'
import { areaOf, bboxOf, loopsOf, outlineOf, sampleSheet, setSetting } from '../../sheet'
import {
  angleShown,
  beginCorner,
  beginGroupTurn,
  beginMark,
  beginMove,
  beginNew,
  beginTurn,
  beginWall,
  closesPolygon,
  dragTo,
  drawnAt,
  dropOf,
  marked,
  measureClick,
  measurePoint,
  middleOf,
  reorderSide,
  shapePolygon,
  shownRoom,
  startDrawing,
  startMeasure,
} from './gestures'

const still = { shift: false }
const sheet = sampleSheet()
/** The room the gesture tests work on: the Formal Living, a plain rectangle at 11.39, 1.5. */
const formal = () => sheet.rooms.find((r) => r.id === 'r6')!
const kitchen = () => sheet.rooms.find((r) => r.id === 'r8')!

describe('dropping a room from the program', () => {
  it('follows the pointer and snaps onto the wall it comes near', () => {
    const begun = beginNew(sheet, 'nmu436pzls0vk')!
    expect(begun.kind).toBe('new')
    const held = dragTo(begun, [9.465, 4.25], still, sheet, 0)
    if (held.kind !== 'new') throw new Error('the drag lost its shape')
    expect(held.started).toBe(true)
    expect(held.room.x + held.room.w).toBeCloseTo(11.39, 6)
    expect(held.guides.length).toBeGreaterThan(0)
  })

  it('refuses a room that is already on the sheet, and places nothing before it has moved', () => {
    expect(beginNew(sheet, 'r6')).toBeNull()
    const begun = beginNew(sheet, 'nmu436pzls0vk')!
    expect(dropOf(begun, sheet, 0)).toBeNull()
  })

  it('places the room where the preview stands', () => {
    const held = dragTo(beginNew(sheet, 'nmu436pzls0vk')!, [9.465, 4.25], still, sheet, 0)
    const change = dropOf(held, sheet, 0)!
    expect(change.result.ok).toBe(true)
    const placed = change.sheet.rooms.find((r) => r.id === 'nmu436pzls0vk')!
    expect(placed.placed).toBe(true)
    expect(areaOf(placed)).toBeCloseTo(4.25 * 3.29, 4)
  })
})

describe('moving what is in hand', () => {
  it('carries the rooms of the drag and keeps one axis while Shift is held', () => {
    const begun = beginMove(['r6'], 'r6', [14, 4])
    const held = dragTo(begun, [16, 4.2], { shift: true }, sheet, 0)
    if (held.kind !== 'move') throw new Error('the drag lost its shape')
    expect(held.axisLock).toBe(true)
    const shown = held.preview.get('r6')!
    expect(shown.y).toBeCloseTo(formal().y, 6)
    expect(shown.x).toBeGreaterThan(formal().x)
  })

  it('asks for a move of exactly what the hand travelled', () => {
    const held = dragTo(beginMove(['r6'], 'r6', [14, 4]), [15, 5], still, sheet, 0)
    const change = dropOf(held, sheet, 0)!
    const moved = change.sheet.rooms.find((r) => r.id === 'r6')!
    expect(moved.x).not.toBe(formal().x)
  })

  it('leaves the sheet alone when the hand never moved', () => {
    expect(dropOf(beginMove(['r6'], 'r6', [14, 4]), sheet, 0)).toBeNull()
  })
})

describe('the box that selects', () => {
  it('takes every room it touches, and only what was held when it is too small', () => {
    const box = dragTo(beginMark([11, 1], []), [19, 7], still, sheet, 0)
    expect(marked(box, sheet, 0)).toContain('r6')
    const tiny = dragTo(beginMark([11, 1], ['r1']), [11.05, 1.05], still, sheet, 0)
    expect(marked(tiny, sheet, 0)).toEqual(['r1'])
  })
})

describe('one wall of a carved room', () => {
  it('moves that wall alone and leaves the frame’s other sides where they were', () => {
    const wall = outlineOf(kitchen()).findIndex(
      (seg) => seg.n[0] > 0.999 && Math.abs(seg.a[0] - kitchen().w) < 1e-6,
    )
    const held = dragTo(
      beginWall(sheet, 'r8', wall, [7.75, 18.085])!,
      [8.75, 18.085],
      still,
      sheet,
      0,
    )
    if (held.kind !== 'wall') throw new Error('the drag lost its shape')
    const shown = held.preview.get('r8')!
    expect(areaOf(shown)).toBeCloseTo(19.0175, 3)
    const change = dropOf(held, sheet, 0)!
    const after = change.sheet.rooms.find((r) => r.id === 'r8')!
    expect(areaOf(after)).toBeCloseTo(19.0175, 3)
    expect(bboxOf(after).x).toBeCloseTo(1.5, 6)
    expect(bboxOf(after).y).toBeCloseTo(16.37, 6)
  })
})

describe('a corner of a drawn room', () => {
  it('moves the one corner and asks for it in the room’s own frame', () => {
    const loop = loopsOf(kitchen())![0]!.map((e) => e.a)
    const held = dragTo(beginCorner('r8', 0, loop, [1.5, 16.37]), [2.5, 17.2], still, sheet, 0)
    if (held.kind !== 'corner') throw new Error('the drag lost its shape')
    expect(held.moved).toBe(true)
    const change = dropOf(held, sheet, 0)!
    expect(change.result.ok).toBe(true)
  })
})

describe('turning', () => {
  it('locks onto a neighbour’s angle within four degrees and names the room it agreed with', () => {
    const begun = beginTurn(sheet, 'r2')!
    const held = dragTo(begun, [14.546 + 3.565, 18.62 + 1.816], still, sheet, 0)
    if (held.kind !== 'turn') throw new Error('the drag lost its shape')
    expect(held.angle).toBe(115)
    expect(held.lock?.mate?.id).toBe('r3')
    expect(angleShown(held, 0)).toBe(115)
  })

  it('turns a group about the point it was given', () => {
    const pivot = middleOf(sheet, 0, ['r6', 'r0'])
    const held = dragTo(
      beginGroupTurn(['r6', 'r0'], pivot, [pivot[0] + 3, pivot[1]]),
      [pivot[0], pivot[1] + 3],
      still,
      sheet,
      0,
    )
    if (held.kind !== 'groupTurn') throw new Error('the drag lost its shape')
    expect(held.preview.size).toBe(2)
    expect(held.angle).toBe(90)
  })
})

describe('drawing a shape', () => {
  it('reads a rectangle, a circle and a polygon from the corners in hand', () => {
    const rect = {
      ...startDrawing('x', 'rect'),
      from: [1, 1] as [number, number],
      at: [3, 4] as [number, number],
    }
    expect(shapePolygon(rect)).toEqual([
      [1, 1],
      [3, 1],
      [3, 4],
      [1, 4],
    ])
    const circle = {
      ...startDrawing('x', 'circle'),
      from: [5, 5] as [number, number],
      at: [5, 6] as [number, number],
    }
    expect(shapePolygon(circle)!.length).toBe(32)
    const poly = {
      ...startDrawing('x', 'poly'),
      pts: [
        [0, 0],
        [1, 0],
      ] as [number, number][],
    }
    expect(shapePolygon(poly)).toBeNull()
  })

  it('closes a polygon only when the click lands back on its first corner', () => {
    const poly = {
      ...startDrawing('x', 'poly'),
      pts: [
        [0, 0],
        [2, 0],
        [2, 2],
      ] as [number, number][],
    }
    expect(closesPolygon(poly, [0.1, 0.1])).toBe(true)
    expect(closesPolygon(poly, [1, 1])).toBe(false)
  })

  it('pulls a drawn point onto a corner and says so', () => {
    const snap = drawnAt(startDrawing('nmu436pzls0vk', 'poly'), [11.4, 1.52], still, sheet, 0)
    expect(snap.kind).toBe('corner')
    expect(snap.at).toEqual([11.39, 1.5])
  })

  it('leaves a point exactly where the pointer is while Shift is held', () => {
    const snap = drawnAt(startDrawing('x', 'poly'), [11.4, 1.52], { shift: true }, sheet, 0)
    expect(snap.kind).toBe('free')
    expect(snap.at).toEqual([11.4, 1.52])
  })
})

describe('measuring', () => {
  it('takes the first point, then the second, and says what each one caught', () => {
    const first = measureClick(startMeasure(), measurePoint([0.05, 0.05], still, sheet, 0))
    expect(first.a).toEqual([0, 0])
    expect(first.kindA).toBe('corner')
    const second = measureClick(first, measurePoint([7.74, 0.02], still, sheet, 0))
    expect(second.b).toEqual([7.75, 0])
    expect(Math.hypot(second.b![0] - second.a![0], second.b![1] - second.a![1])).toBeCloseTo(
      7.75,
      6,
    )
  })
})

describe('what the sheet draws while the hand holds something', () => {
  it('shows the preview in place of the room, and the room itself otherwise', () => {
    const held = dragTo(beginMove(['r6'], 'r6', [14, 4]), [15, 4], still, sheet, 0)
    expect(shownRoom(formal(), held).x).not.toBe(formal().x)
    expect(shownRoom(formal(), null)).toBe(formal())
    expect(shownRoom(kitchen(), held)).toBe(kitchen())
  })

  it('places a block after the one it was dropped past, and before it otherwise', () => {
    expect(reorderSide(20, { y: 0, height: 26 })).toBe('after')
    expect(reorderSide(6, { y: 0, height: 26 })).toBe('before')
  })
})

describe('a room held inside the plot', () => {
  it('never leaves the ground the settings allow', () => {
    const tight = setSetting(sheet, { name: 'allowSpill', value: 0 }).sheet
    const held = dragTo(beginMove(['r6'], 'r6', [14, 4]), [40, 4], still, tight, 0)
    if (held.kind !== 'move') throw new Error('the drag lost its shape')
    const shown = held.preview.get('r6')!
    expect(shown.x + shown.w).toBeLessThanOrEqual(20.001)
  })
})
