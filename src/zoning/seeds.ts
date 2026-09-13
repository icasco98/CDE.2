import { boundingBox, pointInPolygon } from '../geometry'
import { cellCentre, OFF } from './grid'
import type { Division, PartitionRoom } from './types'

/*
 * What is put down before the rooms are laid: a room that already stands on another storey, a
 * stair, keeps its cells, and no band may take them, so the floor above stacks on the floor below.
 */

/**
 * A room that already stands somewhere and may not be moved: its own cells are put down fixed, so
 * no band may take them. A stair is one room on every storey it serves, and the floor above must
 * stack on the floor below.
 */
export function layPlaced(division: Division, room: PartitionRoom, index: number): void {
  for (const cell of placedCells(division, room)) {
    if ((division.grid.place[cell] ?? OFF) === OFF) continue
    division.owner[cell] = index
    division.fixed[cell] = 1
  }
}

/** The cells of the footprint a room already stands on, read off the polygon and not off the floor. */
export function placedCells(division: Division, room: PartitionRoom): readonly number[] {
  const standing = room.placed
  if (!standing || standing.length < 3) return []
  const grid = division.grid
  const bounds = boundingBox(standing)
  const lowCol = Math.max(0, Math.floor((bounds.left - grid.left) / grid.step))
  const highCol = Math.min(
    grid.cols - 1,
    Math.ceil((bounds.left + bounds.width - grid.left) / grid.step),
  )
  const lowRow = Math.max(0, Math.floor((bounds.top - grid.top) / grid.step))
  const highRow = Math.min(
    grid.rows - 1,
    Math.ceil((bounds.top + bounds.depth - grid.top) / grid.step),
  )
  const out: number[] = []
  for (let row = lowRow; row <= highRow; row++)
    for (let col = lowCol; col <= highCol; col++) {
      const cell = row * grid.cols + col
      if (pointInPolygon(standing, cellCentre(grid, cell))) out.push(cell)
    }
  return out
}
