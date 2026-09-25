/**
 * The kinds of room the sheet draws: each one's category and default proportion, what it is called,
 * the door types with the width each arrives at, and the size a room of a kind arrives at.
 */

import { type Category, type Door, type DoorType, type Room, type Settings } from './model'
import { canonicalise, areaOf, r2, snapTo } from './geometry'

/** Every kind the room-type table knows: its category and the proportion its default size takes. */
export const KINDS: Record<string, { cat: Category; ratio: number }> = {
  'entry-foyer': { cat: 'shared', ratio: 1.25 },
  stair: { cat: 'circulation', ratio: 1.9 },
  diwaniya: { cat: 'reception', ratio: 1.5 },
  'diwaniya-wc': { cat: 'service', ratio: 1.3 },
  'prep-kitchen': { cat: 'service', ratio: 1.3 },
  'formal-living': { cat: 'shared', ratio: 1.3 },
  'family-living': { cat: 'shared', ratio: 1.3 },
  'dining-room': { cat: 'shared', ratio: 1.5 },
  kitchen: { cat: 'shared', ratio: 1.4 },
  storage: { cat: 'service', ratio: 1.5 },
  'guest-wc': { cat: 'service', ratio: 1.4 },
  'maid-room': { cat: 'service', ratio: 1.2 },
  'maid-bathroom': { cat: 'service', ratio: 1.3 },
  'driver-room': { cat: 'service', ratio: 1.2 },
  'driver-bathroom': { cat: 'service', ratio: 1.3 },
  hallway: { cat: 'circulation', ratio: 0 },
  'car-bay': { cat: 'open', ratio: 2 },
  garden: { cat: 'open', ratio: 1.3 },
  'master-bedroom': { cat: 'private', ratio: 1.25 },
  bedroom: { cat: 'private', ratio: 1.25 },
  ensuite: { cat: 'private', ratio: 1.4 },
  bathroom: { cat: 'private', ratio: 1.4 },
  dressing: { cat: 'private', ratio: 1.4 },
  office: { cat: 'private', ratio: 1.25 },
  prayer: { cat: 'private', ratio: 1.25 },
  laundry: { cat: 'service', ratio: 1.3 },
  'service-entrance': { cat: 'service', ratio: 1.5 },
  'women-reception': { cat: 'shared', ratio: 1.3 },
  courtyard: { cat: 'open', ratio: 1.3 },
  room: { cat: 'shared', ratio: 1.3 },
  court: { cat: 'open', ratio: 1.3 },
}

/** What each kind is called on the sheet; its size comes from the room-type table. */
export const KIND_LABEL: Record<string, string> = {
  'entry-foyer': 'Entry',
  stair: 'Stair',
  diwaniya: 'Diwaniya',
  'diwaniya-wc': 'Diwaniya WC',
  'prep-kitchen': 'Prep kitchen',
  'formal-living': 'Formal living',
  'family-living': 'Family living',
  'dining-room': 'Dining room',
  kitchen: 'Kitchen',
  'master-bedroom': 'Master bedroom',
  bedroom: 'Bedroom',
  ensuite: 'Ensuite bathroom',
  bathroom: 'Bathroom',
  'guest-wc': 'Guest WC',
  dressing: 'Dressing room',
  office: 'Office / study',
  prayer: 'Prayer room',
  laundry: 'Laundry',
  storage: 'Storage',
  'service-entrance': 'Service entrance',
  hallway: 'Hallway',
  'maid-room': 'Maid room',
  'maid-bathroom': 'Maid bathroom',
  'driver-room': 'Driver room',
  'driver-bathroom': 'Driver bathroom',
  'car-bay': 'Car bay',
  garden: 'Garden',
  courtyard: 'Courtyard',
  room: 'Room (other)',
}

/** The door types the Openings toolbar offers, each with the width it arrives at. */
export const DOOR: Record<DoorType, { w: number; label: string }> = {
  door: { w: 0.9, label: 'Door' },
  double: { w: 1.8, label: 'Double door' },
  sliding: { w: 1.8, label: 'Sliding door' },
  opening: { w: 1.2, label: 'Opening' },
  open: { w: 2.4, label: 'Open wall' },
  street: { w: 1.2, label: 'Street door' },
  street2: { w: 2, label: 'Double street door' },
}

export const isStreetDoor = (d: Door) => d.type === 'street' || d.type === 'street2'
export const hasHinge = (d: Door) => d.type === 'door' || d.type === 'street'
export const hasSwing = (d: Door) =>
  d.type !== 'opening' && d.type !== 'sliding' && d.type !== 'open'

/** The size a kind arrives at for a target area: the width on the quarter-metre grid, the depth exact. */
export function sizeFor(
  kind: string,
  target: number,
  settings: Settings,
): { w: number; h: number } {
  const k = KINDS[kind] ?? KINDS.room!
  if (kind === 'hallway') return { w: settings.hallW, h: r2(target / settings.hallW) }
  const w = snapTo(Math.sqrt(target * k.ratio), 0.25)
  return { w: r2(w), h: r2(target / w) }
}

/**
 * Rooms saved in pieces are put back together as they load. One left in so many pieces that keeping
 * the largest would lose a third of it was never a room any more: it comes back whole, at its target
 * size, where its largest part stood.
 */
export function repair(rooms: Room[], settings: Settings): Room[] {
  const out: Room[] = []
  for (const room of rooms) {
    if (!room.placed || !(room.pieces && room.pieces.length)) {
      out.push(room)
      continue
    }
    const was = areaOf(room)
    const cx = room.x + room.w / 2
    const cy = room.y + room.h / 2
    const kept = canonicalise(room)
    if (!kept) continue
    if (areaOf(kept) >= was * 0.67) {
      out.push(kept)
      continue
    }
    const s = sizeFor(kept.kind, kept.target, settings)
    kept.pieces = null
    kept.lost = null
    kept.w = s.w
    kept.h = s.h
    kept.x = r2(cx - s.w / 2)
    kept.y = r2(cy - s.h / 2)
    out.push(kept)
  }
  return out
}
