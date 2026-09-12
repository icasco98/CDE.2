import { outlineOf, outwardWalls, type Point } from '../geometry'
import { occupiedStoreys, type Room } from '../model'
import type { Point3 } from './projection'

/** A roof or a wall. The floor is never drawn: it is either the ground or the storey below. */
export type FaceKind = 'top' | 'side'

export type Face = {
  readonly roomId: string
  readonly kind: FaceKind
  readonly corners: readonly Point3[]
  /** Which way a wall faces on the sheet, so the drawing can tone it. A top has no such way. */
  readonly facing?: Point
}

/** The level a storey's floor sits at: the heights of every storey below it, added up. */
function floorLevel(storey: number, heights: readonly number[]): number {
  let level = 0
  for (let below = 0; below < storey; below += 1) level += heights[below] ?? 0
  return level
}

/** The two levels a room's prism stands between, in metres above the ground. */
type Levels = { readonly floor: number; readonly ceiling: number }

/**
 * Where one room's prism begins and ends. A prism never runs past the top of the project, whatever
 * the room's span says, and a room left with no storey to stand on has no levels at all. The view
 * reads these to know the plane a drag on a roof is happening over.
 */
export function levelsOf(room: Room, storeys: number, heights: readonly number[]): Levels | null {
  const top = Math.min(storeys, heights.length)
  const levels = occupiedStoreys(room).filter((storey) => storey >= 0 && storey < top)
  const first = levels[0]
  if (first === undefined) return null
  const floor = floorLevel(first, heights)
  const ceiling = levels.reduce((level, storey) => level + (heights[storey] ?? 0), floor)
  return ceiling > floor ? { floor, ceiling } : null
}

/**
 * The prism one placed room stands as: its outline at its own floor level, extruded through every
 * storey it occupies, so a stair is one prism through the storeys it spans. Unplaced, it is nothing.
 */
export function facesOf(room: Room, storeys: number, heights: readonly number[]): readonly Face[] {
  const footprint = room.footprint
  if (!footprint) return []
  const levels = levelsOf(room, storeys, heights)
  if (!levels) return []
  const { floor, ceiling } = levels

  const outline = outlineOf(footprint)
  const faces: Face[] = outwardWalls(outline).map((wall): Face => ({
    roomId: room.id,
    kind: 'side',
    corners: [
      [wall.from[0], wall.from[1], floor],
      [wall.to[0], wall.to[1], floor],
      [wall.to[0], wall.to[1], ceiling],
      [wall.from[0], wall.from[1], ceiling],
    ],
    facing: wall.normal,
  }))
  faces.push({
    roomId: room.id,
    kind: 'top',
    corners: outline.map((point): Point3 => [point[0], point[1], ceiling]),
  })
  return faces
}
