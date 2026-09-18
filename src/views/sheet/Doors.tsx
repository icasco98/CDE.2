/**
 * The doors on the sheet: each one drawn on its wall in its room's frame, a red ring where one has
 * lost its wall, and the door the hand is about to place drawn faint over the wall under it.
 */

import {
  Fragment,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  doorDrawing,
  doorPlace,
  doorsOf,
  toWorld,
  type Door,
  type DoorDrawing,
  type DoorRef,
  type Hit,
  type Place,
  type Poly,
  type Room,
  type Sheet,
} from '../../sheet'
import { frameOf, p4 } from './shape'

/** What the Openings step adds to the drawing: the door in hand, the one armed, the one dragged. */
export type OpeningsDraw = {
  selected: DoorRef | null
  /** The type armed in the toolbar, and where it would land under the pointer. */
  armed: { type: Door['type']; w: number } | null
  armedAt: Hit | null
  /** Where the dragged door would land; refused walls are drawn in the warning colour. */
  draggedTo: Hit | null
  dragged: { type: Door['type']; w: number } | null
  onDoorDown: (room: Room, door: Door, event: ReactPointerEvent) => void
  onDoorMenu: (room: Room, door: Door, event: ReactMouseEvent) => void
}

type DoorsProps = {
  sheet: Sheet
  storey: number
  rooms: Room[]
  openings: OpeningsDraw | null
}

const points = (p: Poly) => p.map((v) => `${p4(v[0])},${p4(v[1])}`).join(' ')

const preview = (type: Door['type'], w: number): Door => ({
  id: 'preview',
  type,
  w,
  at: [0, 0],
  flip: false,
  hinge: false,
})

export function Doors(props: DoorsProps) {
  const { sheet, storey, rooms, openings } = props
  const armed = openings?.armedAt
  const dragged = openings?.draggedTo
  return (
    <Fragment>
      {rooms
        .filter((r) => doorsOf(r).length)
        .map((r) => (
          <g key={`doors-${r.id}`} className="doors" transform={frameOf(r)}>
            {doorsOf(r).map((d) => {
              const pl = doorPlace(r, d)
              const picked = openings?.selected?.id === d.id
              if (!pl)
                return (
                  <circle
                    key={d.id}
                    className={`door-lost${picked ? ' selected' : ''}`}
                    cx={p4(d.at[0])}
                    cy={p4(d.at[1])}
                    r={0.22}
                    onPointerDown={(event) => openings?.onDoorDown(r, d, event)}
                    onContextMenu={(event) => openings?.onDoorMenu(r, d, event)}
                  />
                )
              return (
                <DoorMark
                  key={d.id}
                  door={d}
                  drawing={doorDrawing(r, d, pl, sheet, storey)}
                  picked={picked}
                  on={
                    openings
                      ? {
                          down: (event) => openings.onDoorDown(r, d, event),
                          menu: (event) => openings.onDoorMenu(r, d, event),
                        }
                      : null
                  }
                />
              )
            })}
          </g>
        ))}
      {armed && !armed.why && !dragged && openings?.armed && (
        <g className="doors" transform={frameOf(armed.room)}>
          <DoorMark
            door={preview(openings.armed.type, openings.armed.w)}
            drawing={doorDrawing(
              armed.room,
              preview(openings.armed.type, openings.armed.w),
              armed.pl,
              sheet,
              storey,
            )}
            picked={false}
            on={null}
            faint
          />
        </g>
      )}
      {dragged && openings?.dragged && (
        <Fragment>
          <g className={`doors${dragged.why ? ' refused' : ''}`} transform={frameOf(dragged.room)}>
            <DoorMark
              door={preview(openings.dragged.type, openings.dragged.w)}
              drawing={doorDrawing(
                dragged.room,
                preview(openings.dragged.type, openings.dragged.w),
                dragged.pl,
                sheet,
                storey,
              )}
              picked={false}
              on={null}
              faint
            />
          </g>
          {dragged.pl.snapped && <SnapNote room={dragged.room} pl={dragged.pl} />}
        </Fragment>
      )}
    </Fragment>
  )
}

function SnapNote({ room, pl }: { room: Room; pl: Place }) {
  const wp = toWorld(room, pl.p[0], pl.p[1])
  return (
    <text className="snap-note" x={p4(wp[0])} y={p4(wp[1] - 0.5)} textAnchor="middle">
      {pl.snapped === 'middle' ? 'middle of the wall' : 'a jamb from the corner'}
    </text>
  )
}

function DoorMark({
  door,
  drawing,
  picked,
  on,
  faint,
}: {
  door: Door
  drawing: DoorDrawing
  picked: boolean
  on: { down: (e: ReactPointerEvent) => void; menu: (e: ReactMouseEvent) => void } | null
  faint?: boolean
}) {
  const [a, b] = drawing.gap
  return (
    <g
      className={`door ${door.type}${faint ? ' preview' : ''}${picked ? ' selected' : ''}${drawing.blocked ? ' blocked' : ''}`}
      data-door={door.id}
      onPointerDown={on ? on.down : undefined}
      onContextMenu={on ? on.menu : undefined}
    >
      <line className="gap" x1={p4(a[0])} y1={p4(a[1])} x2={p4(b[0])} y2={p4(b[1])} />
      {drawing.leaves.map((leaf, i) => (
        <Fragment key={`leaf-${i}`}>
          <line
            className="leaf"
            x1={p4(leaf.from[0])}
            y1={p4(leaf.from[1])}
            x2={p4(leaf.to[0])}
            y2={p4(leaf.to[1])}
          />
          <path
            className="arc"
            d={`M${p4(leaf.to[0])} ${p4(leaf.to[1])}A${p4(leaf.arc.radius)} ${p4(leaf.arc.radius)} 0 0 ${leaf.arc.sweep} ${p4(leaf.arc.to[0])} ${p4(leaf.arc.to[1])}`}
          />
        </Fragment>
      ))}
      {drawing.panels.map((panel, i) => (
        <line
          key={`panel-${i}`}
          className="panel"
          x1={p4(panel[0][0])}
          y1={p4(panel[0][1])}
          x2={p4(panel[1][0])}
          y2={p4(panel[1][1])}
        />
      ))}
      {drawing.jambs.map((jamb, i) => (
        <line
          key={`jamb-${i}`}
          className="jamb"
          x1={p4(jamb[0][0])}
          y1={p4(jamb[0][1])}
          x2={p4(jamb[1][0])}
          y2={p4(jamb[1][1])}
        />
      ))}
      {drawing.openMark && (
        <line
          className="open-mark"
          x1={p4(drawing.openMark[0][0])}
          y1={p4(drawing.openMark[0][1])}
          x2={p4(drawing.openMark[1][0])}
          y2={p4(drawing.openMark[1][1])}
        />
      )}
      {drawing.streetMark && (
        <polygon className="street-mark" points={points(drawing.streetMark)} />
      )}
      {/* the wide transparent lines a click lands on, drawn only in the step that answers one */}
      {on &&
        drawing.hits.map((hit, i) =>
          hit.length === 2 && hit[0] && hit[1] ? (
            <line
              key={`hit-${i}`}
              className="hit"
              x1={p4(hit[0][0])}
              y1={p4(hit[0][1])}
              x2={p4(hit[1][0])}
              y2={p4(hit[1][1])}
            />
          ) : (
            <polygon key={`hit-${i}`} className="hit" points={points(hit)} />
          ),
        )}
    </g>
  )
}
