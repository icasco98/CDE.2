/**
 * What Check draws over the sheet: a dashed line from a zone to each zone it has a connection with that
 * is not yet ready or met, bold from the selected zone and faint from the one under the pointer, and
 * a red cross on every door that joins a pair kept apart.
 */

import { centreOfFootprint, toWorld, type Point, type Zone } from '../../sheet'
import { p4 } from './shape'

export type SheetCheck = {
  readonly lines: readonly { readonly from: string; readonly to: string; readonly bold: boolean }[]
  readonly apartDoors: ReadonlyMap<string, Point>
  readonly apartZones: ReadonlySet<string>
}

/** Half the reach of the cross on a door, in metres. */
const CROSS = 0.3

const middle = (zone: Zone) => {
  const [x, y] = centreOfFootprint(zone)
  return toWorld(zone, x, y)
}

export function CheckMarks(props: { readonly zones: readonly Zone[]; readonly check: SheetCheck }) {
  const byId = new Map(props.zones.map((zone) => [zone.id, zone]))
  return (
    <g className="check-marks">
      {props.check.lines.map((line) => {
        const from = byId.get(line.from)
        const to = byId.get(line.to)
        if (!from || !to) return null
        const [x1, y1] = middle(from)
        const [x2, y2] = middle(to)
        return (
          <line
            key={`${line.from}-${line.to}-${line.bold ? 'bold' : 'faint'}`}
            data-check-line={`${line.from} ${line.to}`}
            className={line.bold ? 'check-line bold' : 'check-line'}
            x1={p4(x1)}
            y1={p4(y1)}
            x2={p4(x2)}
            y2={p4(y2)}
          />
        )
      })}
      {[...props.check.apartDoors].map(([id, [x, y]]) => (
        <path
          key={id}
          data-apart-door={id}
          className="apart-door"
          d={`M${p4(x - CROSS)} ${p4(y - CROSS)}L${p4(x + CROSS)} ${p4(y + CROSS)}M${p4(x + CROSS)} ${p4(y - CROSS)}L${p4(x - CROSS)} ${p4(y + CROSS)}`}
        />
      ))}
    </g>
  )
}
