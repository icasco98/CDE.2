import { bandOf, type Position } from '../../bubbles'

/**
 * A drop assigns a storey only when it lands clearly inside another band: the middle 80% of the
 * band is the target, and the tenth at either edge is too near the boundary to mean anything, so a
 * bubble let go there goes back inside its own band rather than change a storey by a few pixels.
 */
const EDGE = 0.1

/** What the drop has to know about the room: the storey it stands on and how many it spans. */
export type Standing = { readonly storey: number; readonly storeysSpanned: number }

export type BandDrop = {
  /** The storey the drop assigns, which is the room's own when nothing changes. */
  readonly storey: number
  /** Where the bubble comes to rest: where it was let go, or back inside its own bands. */
  readonly y: number
  /** Why a storey the drop asked for was not taken: too near a boundary, or a stair spanning storeys. */
  readonly refused?: 'edge' | 'stair'
}

function spanOf(room: Standing): number {
  return Math.max(1, Math.trunc(room.storeysSpanned))
}

/** Held inside the bands the room already stands on, clear of the boundaries at either end. */
export function insideBands(
  at: Position,
  room: Standing,
  storeys: number,
  bandHeight: number,
): number {
  const lowest = bandOf(room.storey, storeys, bandHeight)
  const highest = bandOf(room.storey + spanOf(room) - 1, storeys, bandHeight)
  const margin = (lowest.bottom - lowest.top) * EDGE
  return Math.min(Math.max(at.y, highest.top + margin), lowest.bottom - margin)
}

/** The band a height falls in, from the top of the sheet down, held to the storeys there are. */
function bandAt(y: number, storeys: number, bandHeight: number): number {
  const levels = Math.max(1, Math.trunc(storeys))
  const fromTop = Math.floor(y / bandHeight)
  return levels - 1 - Math.min(levels - 1, Math.max(0, fromTop))
}

export function bandDrop(
  at: Position,
  room: Standing,
  storeys: number,
  bandHeight: number,
): BandDrop {
  const wanted = bandAt(at.y, storeys, bandHeight)
  const span = spanOf(room)
  if (wanted >= room.storey && wanted < room.storey + span) return { storey: room.storey, y: at.y }
  const band = bandOf(wanted, storeys, bandHeight)
  const across = (at.y - band.top) / (band.bottom - band.top)
  const refused = across < EDGE || across > 1 - EDGE ? 'edge' : span > 1 ? 'stair' : undefined
  if (refused)
    return { storey: room.storey, y: insideBands(at, room, storeys, bandHeight), refused }
  return { storey: wanted, y: at.y }
}
