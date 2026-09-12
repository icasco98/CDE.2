import { describe, expect, it } from 'vitest'
import { area, signedArea } from '../geometry'
import { gridOver } from './grid'
import { outlineOfCells, zoneOfCells } from './zones'

/*
 * The tracer on its own: cells in, one ring per piece of their boundary out, wound so that a ring
 * inside another takes its area away. Every zone the partition draws comes through here.
 */

const square = gridOver(
  [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
  ],
  [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
  ],
)

/** The cells of a rectangle of the grid, by column and row. */
function block(fromCol: number, fromRow: number, cols: number, rows: number): number[] {
  const out: number[] = []
  for (let row = fromRow; row < fromRow + rows; row++)
    for (let col = fromCol; col < fromCol + cols; col++) out.push(row * square.cols + col)
  return out
}

describe('the tracer', () => {
  it('draws a rectangle of cells as its four corners', () => {
    const ring = zoneOfCells(square, block(2, 2, 4, 8))
    expect(ring.length).toBe(4)
    expect(area(ring)).toBeCloseTo(4 * 8 * square.cellArea, 9)
    expect(signedArea(ring)).toBeGreaterThan(0)
  })

  it('draws an L as its six corners', () => {
    const ring = zoneOfCells(square, [...block(0, 0, 4, 4), ...block(0, 4, 2, 4)])
    expect(ring.length).toBe(6)
    expect(area(ring)).toBeCloseTo(24 * square.cellArea, 9)
  })

  it('winds a hole the other way, so the rings measure the floor between them', () => {
    const held = block(0, 0, 5, 5).filter((cell) => !block(2, 2, 1, 1).includes(cell))
    const rings = outlineOfCells(square, held)
    expect(rings.length).toBe(2)
    const measured = rings.reduce((total, ring) => total + signedArea(ring), 0)
    expect(measured).toBeCloseTo(24 * square.cellArea, 9)
  })

  it('keeps two pieces apart when they meet only at a corner', () => {
    const rings = outlineOfCells(square, [...block(0, 0, 2, 2), ...block(2, 2, 2, 2)])
    expect(rings.length).toBe(2)
    for (const ring of rings) expect(area(ring)).toBeCloseTo(4 * square.cellArea, 9)
  })

  it('gives a zone the larger of its rings, so a footprint is one polygon', () => {
    const ring = zoneOfCells(square, [...block(0, 0, 4, 4), ...block(6, 6, 2, 2)])
    expect(area(ring)).toBeCloseTo(16 * square.cellArea, 9)
  })
})
