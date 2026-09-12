import { describe, expect, it } from 'vitest'
import { gridOver } from './grid'
import {
  addOn,
  armSide,
  cutOut,
  jogsRun,
  joined,
  shapeOfCells,
  slidStep,
  touching,
  type Box,
} from './shape'

/*
 * The vocabulary the straightening is written in, on a plain ten-metre square: what a rectangle
 * and an arm may be, what they may never be, and the two ways floor changes hands between them.
 */

const square = gridOver(
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
)

function box(col: number, row: number, cols: number, rows: number): Box {
  return { col, row, cols, rows }
}

/** The cells of a set of boxes, which is how a shape is read back out of a division. */
function cellsOf(...boxes: readonly Box[]): readonly number[] {
  const out: number[] = []
  for (const each of boxes)
    for (let row = each.row; row < each.row + each.rows; row++)
      for (let col = each.col; col < each.col + each.cols; col++) out.push(row * square.cols + col)
  return out
}

describe('two rectangles put together', () => {
  it('are one rectangle where they are flush at both ends', () => {
    expect(joined(box(0, 0, 8, 8), box(8, 0, 4, 8))).toEqual({
      main: box(0, 0, 12, 8),
      arm: null,
    })
  })

  it('are an L where they are flush at one end', () => {
    expect(joined(box(0, 0, 8, 12), box(8, 0, 4, 8))).toEqual({
      main: box(0, 0, 8, 12),
      arm: box(8, 0, 4, 8),
    })
  })

  it('are nothing where they are flush at neither: a Z turns eight corners', () => {
    expect(joined(box(0, 0, 8, 12), box(8, 2, 4, 8))).toBeNull()
  })

  it('are nothing where they do not touch along a side', () => {
    expect(joined(box(0, 0, 8, 8), box(9, 0, 4, 8))).toBeNull()
  })
})

describe('a shape read back off its cells', () => {
  it('is the rectangle the cells make', () => {
    expect(shapeOfCells(square, cellsOf(box(3, 4, 8, 6)))).toEqual({
      main: box(3, 4, 8, 6),
      arm: null,
    })
  })

  it('is the L the cells make, the taller run first', () => {
    expect(shapeOfCells(square, cellsOf(box(3, 4, 8, 12), box(11, 4, 5, 6)))).toEqual({
      main: box(3, 4, 8, 12),
      arm: box(11, 4, 5, 6),
    })
  })

  it('is nothing where the cells make a T', () => {
    expect(shapeOfCells(square, cellsOf(box(3, 4, 8, 12), box(11, 7, 5, 6)))).toBeNull()
  })

  it('is nothing where the cells fall in two pieces', () => {
    expect(shapeOfCells(square, cellsOf(box(3, 4, 6, 6), box(12, 4, 6, 6)))).toBeNull()
  })

  it('refuses a jog under the metre', () => {
    const thin = shapeOfCells(square, cellsOf(box(3, 4, 8, 12), box(11, 4, 5, 10)))
    expect(thin && jogsRun(thin)).toBe(false)
  })
})

describe('floor changing hands', () => {
  it('takes a slab off one end and leaves a rectangle', () => {
    expect(cutOut({ main: box(0, 0, 12, 12), arm: null }, box(0, 0, 12, 4))).toEqual({
      main: box(0, 4, 12, 8),
      arm: null,
    })
  })

  it('takes a block off one corner and leaves an L', () => {
    expect(cutOut({ main: box(0, 0, 12, 12), arm: null }, box(0, 0, 4, 4))).toEqual({
      main: box(4, 0, 8, 12),
      arm: box(0, 4, 4, 8),
    })
  })

  it('refuses a block out of the middle of a side', () => {
    expect(cutOut({ main: box(0, 0, 12, 12), arm: null }, box(4, 0, 4, 4))).toBeNull()
  })

  it('joins a rectangle that squares the shape up', () => {
    expect(addOn({ main: box(0, 0, 12, 8), arm: null }, box(12, 0, 4, 8))).toEqual({
      main: box(0, 0, 16, 8),
      arm: null,
    })
  })
})

describe('the step of an L', () => {
  const shape = { main: box(0, 0, 12, 20), arm: box(12, 0, 8, 8) }

  it('says which side the arm stands on', () => {
    expect(armSide(shape)).toBe(1)
  })

  it('slides a cell towards the arm, taking the floor the arm does not stand on', () => {
    expect(slidStep(shape, true)).toEqual({
      shape: { main: box(0, 0, 13, 20), arm: box(13, 0, 7, 8) },
      band: box(12, 8, 1, 12),
    })
  })

  it('measures the wall two shapes share as the run where their sides meet', () => {
    expect(
      touching({ main: box(0, 0, 12, 20), arm: null }, { main: box(12, 4, 8, 8), arm: null }),
    ).toBe(8)
  })
})
