import { bandOf, type Position } from '../../bubbles'

/**
 * A drop assigns a storey only when it lands clearly inside another band: the middle 80% of the
 * band is the target, and the tenth at either edge is too near the boundary to mean anything, so a
 * bubble let go there goes back inside its own band rather than change a storey by a few pixels.
 */
const EDGE = 0.1

/** What a drag on a stair is answered with: its span is the program's to set, not the hand's. */
export const STAIR_STAYS =
  'A stair does not change floors by dragging; set its span in the program.'

/** What the drop has to know about the room: the storey it stands on and how many it spans. */
export type Standing = { readonly storey: number; readonly storeysSpanned: number }

export type BandDrop = {
  /** The storey the drop assigns, which is the room's own when nothing changes. */
  readonly storey: number
  /** Where the bubble comes to rest: where it was let go, or back inside its own band. */
  readonly y: number
  /** Why a storey the drop asked for was not taken: too near a boundary, or a stair spanning storeys. */
  readonly refused?: 'edge' | 'stair'
}

function spanOf(room: Standing): number {
  return Math.max(1, Math.trunc(room.storeysSpanned))
}

/**
 * Held inside the band the room stands on, clear of the boundaries at either end. A stair's other
 * twins hang off this one place, so the lowest band holds it however many storeys it reaches.
 */
export function insideBand(
  at: Position,
  room: Standing,
  storeys: number,
  bandHeight: number,
): number {
  const band = bandOf(room.storey, storeys, bandHeight)
  const margin = (band.bottom - band.top) * EDGE
  return Math.min(Math.max(at.y, band.top + margin), band.bottom - margin)
}

/** The band a height falls in, from the top of the sheet down; off the sheet it counts on past the end. */
function bandAt(y: number, storeys: number, bandHeight: number): number {
  return Math.max(1, Math.trunc(storeys)) - 1 - Math.floor(y / bandHeight)
}

export function bandDrop(
  at: Position,
  room: Standing,
  storeys: number,
  bandHeight: number,
): BandDrop {
  const landed = bandAt(at.y, storeys, bandHeight)
  // A stair is drawn in every band it reaches and moves as one, so a drop that would carry its
  // lowest twin out of its own band carries every twin with it and is refused whole.
  if (spanOf(room) > 1)
    return landed === room.storey
      ? { storey: room.storey, y: at.y }
      : { storey: room.storey, y: insideBand(at, room, storeys, bandHeight), refused: 'stair' }
  const levels = Math.max(1, Math.trunc(storeys))
  const wanted = Math.min(levels - 1, Math.max(0, landed))
  if (wanted === room.storey) return { storey: room.storey, y: at.y }
  const band = bandOf(wanted, storeys, bandHeight)
  const across = (at.y - band.top) / (band.bottom - band.top)
  if (across < EDGE || across > 1 - EDGE)
    return { storey: room.storey, y: insideBand(at, room, storeys, bandHeight), refused: 'edge' }
  return { storey: wanted, y: at.y }
}
