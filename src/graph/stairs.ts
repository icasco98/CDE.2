import type { Check, CheckRoom } from './types'

/**
 * A house of two storeys or more with no stair: nothing in the program leads from one storey to the
 * next, since a room spanning storeys is the only way an edge crosses between them.
 */
export function noStair(rooms: readonly CheckRoom[], storeys: number): readonly Check[] {
  if (Math.trunc(storeys) < 2) return []
  if (rooms.some((room) => Math.trunc(room.storeysSpanned) > 1)) return []
  return [
    {
      code: 'no-stair',
      rooms: [],
      sentence: 'No stair connects the storeys.',
      rule: 'A house of two storeys or more has a stair spanning them.',
      source:
        'MODEL.md, the four stages: a room spanning storeys is the only way an edge crosses from one storey to another.',
    },
  ]
}
