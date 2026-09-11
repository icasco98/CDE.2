import { describe, expect, it } from 'vitest'
import { rectangleToPolygon, type Footprint, type Polygon } from '../../geometry'
import type { Plot } from '../../model'
import { alignRooms, alreadySquare, northAngle, plotAngle, squaredTo, type Turnable } from './align'

const lot: Polygon = rectangleToPolygon({ left: 0, top: 0, width: 20, depth: 25 })

/** The plot a project opens on: the south side is the street. */
const plot: Plot = { on: true, polygon: lot, north: 0, street: [2] }

function room(
  id: string,
  name: string,
  rect: { left: number; top: number; width: number; depth: number },
  rotation: number,
): Turnable {
  return { id, name, footprint: { polygon: rectangleToPolygon(rect), rotation } }
}

function rotationsOf(placements: readonly { footprint: Footprint }[]): number[] {
  return placements.map((placement) => placement.footprint.rotation)
}

describe('the direction a room is squared to', () => {
  it('takes a room at 17° to 0° under a north of 0', () => {
    expect(squaredTo(17, 0)).toBe(0)
  })

  it('takes a room at 17° to 30° under a north of 30', () => {
    expect(squaredTo(17, 30)).toBe(30)
  })

  it('takes a room at 17° to 12° on a plot whose street side runs at 12°', () => {
    expect(squaredTo(17, 12)).toBe(12)
  })

  it('takes a room at 92° to 90°, never a quarter turn it did not ask for', () => {
    expect(squaredTo(92, 0)).toBe(90)
    expect(squaredTo(268, 0)).toBe(270)
    expect(squaredTo(181, 0)).toBe(180)
  })

  it('takes a room exactly between two orientations to the direction itself', () => {
    expect(squaredTo(45, 0)).toBe(0)
  })

  it('leaves a rotation within half a degree of the one it would be given', () => {
    expect(alreadySquare(90.4, 0)).toBe(true)
    expect(alreadySquare(89.5, 0)).toBe(true)
    expect(alreadySquare(89.4, 0)).toBe(false)
    expect(alreadySquare(30, 30)).toBe(true)
  })
})

describe('the directions a plot offers', () => {
  it('reads north off the plot', () => {
    expect(northAngle(plot)).toBe(0)
    expect(northAngle({ ...plot, north: 30 })).toBe(30)
    expect(northAngle({ ...plot, north: -30 })).toBe(330)
  })

  it('reads the first street side, which for the opening plot runs west along the south', () => {
    expect(plotAngle(plot)).toBe(180)
    expect(plotAngle({ ...plot, street: [0, 2] })).toBe(0)
  })

  it('reads a street side that runs at 12°', () => {
    const slanted: Polygon = [
      [0, 0],
      [9.7815, 2.0791],
      [7.7014, 11.8606],
      [-2.0791, 9.7815],
    ]
    expect(plotAngle({ ...plot, polygon: slanted, street: [0] })).toBeCloseTo(12, 3)
  })

  it('reads the longest side where no side of the plot is on a street', () => {
    expect(plotAngle({ ...plot, street: [] })).toBe(90)
  })
})

describe('rooms squared to a direction', () => {
  it('turns a room about its own centre and leaves its polygon alone', () => {
    const kitchen = room('k', 'Kitchen', { left: 4, top: 4, width: 5, depth: 4 }, 17)
    const aligned = alignRooms([kitchen], [kitchen], lot, 0)
    expect(aligned.skipped).toEqual([])
    expect(rotationsOf(aligned.placements)).toEqual([0])
    expect(aligned.placements[0]?.footprint.polygon).toBe(kitchen.footprint.polygon)
  })

  it('leaves a room already square where it is, so there is nothing to undo', () => {
    const kitchen = room('k', 'Kitchen', { left: 4, top: 4, width: 5, depth: 4 }, 90.2)
    expect(alignRooms([kitchen], [kitchen], lot, 0)).toEqual({ placements: [], skipped: [] })
  })

  it('skips a room that would come to lie over a neighbour, and names it', () => {
    const living = room('a', 'Family Living', { left: 0, top: 0, width: 4.8, depth: 10 }, 0)
    const dining = room('b', 'Dining Room', { left: 4.5, top: 1, width: 8, depth: 2 }, 45)
    const aligned = alignRooms([dining], [living, dining], lot, 0)
    expect(aligned.placements).toEqual([])
    expect(aligned.skipped).toEqual([
      { name: 'Dining Room', reason: 'it would overlap Family Living' },
    ])
  })

  it('skips a room that would be turned out of the plot', () => {
    const hall = room('h', 'Hallway', { left: 1, top: 0.5, width: 18, depth: 2 }, 85)
    const aligned = alignRooms([hall], [hall], lot, 90)
    expect(aligned.placements).toEqual([])
    expect(aligned.skipped).toEqual([{ name: 'Hallway', reason: 'it would leave the plot' }])
  })

  it('turns a room out of the plot where the plot does not bind', () => {
    const hall = room('h', 'Hallway', { left: 1, top: 0.5, width: 18, depth: 2 }, 85)
    expect(rotationsOf(alignRooms([hall], [hall], [], 90).placements)).toEqual([90])
  })

  it('measures each room against the rooms already turned in the same press', () => {
    const first = room('a', 'Kitchen', { left: 1, top: 1, width: 8, depth: 2 }, 45)
    // Clear of the Kitchen either way round while it stands across the corner at 45°, and over
    // it once both of them are squared up.
    const second = room('b', 'Dining Room', { left: 8.5, top: 1.5, width: 6, depth: 1 }, 45)
    const aligned = alignRooms([first, second], [first, second], lot, 0)
    expect(rotationsOf(aligned.placements)).toEqual([0])
    expect(aligned.skipped).toEqual([{ name: 'Dining Room', reason: 'it would overlap Kitchen' }])
  })

  it('turns every room it is given where they stand clear of one another', () => {
    const first = room('a', 'Kitchen', { left: 1, top: 1, width: 4, depth: 3 }, 17)
    const second = room('b', 'Dining Room', { left: 10, top: 10, width: 4, depth: 3 }, 200)
    const aligned = alignRooms([first, second], [first, second], lot, 30)
    expect(aligned.skipped).toEqual([])
    expect(rotationsOf(aligned.placements)).toEqual([30, 210])
  })
})
