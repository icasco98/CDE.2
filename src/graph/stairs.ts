import type { Check, CheckZone } from './types'

/**
 * A house of two storeys or more with no stair: nothing in the program leads from one storey to the
 * next, since a zone spanning storeys is the only way a connection crosses between them.
 */
export function noStair(zones: readonly CheckZone[], storeys: number): readonly Check[] {
  if (Math.trunc(storeys) < 2) return []
  if (zones.some((zone) => Math.trunc(zone.storeysSpanned) > 1)) return []
  return [
    {
      code: 'no-stair',
      zones: [],
      sentence: 'No stair connects the storeys.',
      rule: 'A house of two storeys or more has a stair spanning them.',
      source:
        'MODEL.md, the four stages: a zone spanning storeys is the only way a connection crosses from one storey to another.',
    },
  ]
}
