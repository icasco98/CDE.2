/**
 * What Check draws over the sheet: a dashed line from a room to each room it has an edge with that
 * is not yet ready or met, bold from the selected room and faint from the one under the pointer, and
 * a red cross on every door that joins a pair kept apart.
 */

import { centreOfFootprint, toWorld, type Point, type Room } from '../../sheet'
import { p4 } from './shape'

export type SheetCheck = {
  readonly lines: readonly { readonly from: string; readonly to: string; readonly bold: boolean }[]
  readonly apartDoors: ReadonlyMap<string, Point>
  readonly apartRooms: ReadonlySet<string>
}

/** Half the reach of the cross on a door, in metres. */
const CROSS = 0.3

const middle = (room: Room) => {
  const [x, y] = centreOfFootprint(room)
  return toWorld(room, x, y)
}

export function CheckMarks(props: { readonly rooms: readonly Room[]; readonly check: SheetCheck }) {
  const byId = new Map(props.rooms.map((room) => [room.id, room]))
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
