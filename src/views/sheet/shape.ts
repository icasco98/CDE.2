/** How a zone's own frame is written on the sheet, so the zones and the doors on them agree. */

import type { Zone } from '../../sheet'

export const p4 = (v: number) => Number(v.toFixed(4))

export const frameOf = (r: Zone) =>
  `translate(${p4(r.x)} ${p4(r.y)}) rotate(${r.angle || 0} ${p4(r.w / 2)} ${p4(r.h / 2)})`
