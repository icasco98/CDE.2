import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import {
  GRID_M,
  anchorPointOf,
  area,
  boundingBox,
  centroid,
  outlineOf,
  outwardWalls,
  type Footprint,
  type Handle,
  type Point,
} from '../../geometry'
import type { Plot, Room } from '../../model'
import { metres2, storeyLabel } from '../requirements/format'
import { belowMinimum, offTarget, type RoomSizes } from './defaults'
import type { DoorMark, ProposalMark, TensionMark } from './doors'
import { pointsOf } from './frame'

/** The clear opening a door and an open edge are drawn with, in metres. */
const DOOR_M = 0.9
const OPEN_M = 1.6

/** How far outside its wall the rotation handle sits, in metres. */
const ROTATE_REACH = 1.2

/** The label on a roomy room, in metres of cap height. */
const LABEL_M = 0.62

/** A label shrinks with its room so a short name sits inside it; a long name in a small room still runs over the wall. */
function labelSize(footprint: Footprint, name: string): number {
  const bounds = boundingBox(footprint.polygon)
  const byWidth = (bounds.width * 1.8) / Math.max(1, name.length)
  return Math.min(LABEL_M, Math.max(0.3, Math.min(byWidth, bounds.depth * 0.3)))
}

const HANDLES: readonly (readonly [Handle, Handle])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
]

function perpendicular(along: Point): Point {
  return [-along[1], along[0]]
}

export function Storeys(props: {
  storeys: number
  storey: number
  onStorey: (storey: number) => void
}) {
  return (
    <div className="zoning-storeys" role="group" aria-label="Storey">
      {Array.from({ length: props.storeys }, (_unused, level) => (
        <button
          key={level}
          type="button"
          aria-pressed={level === props.storey}
          onClick={() => props.onStorey(level)}
        >
          {storeyLabel(level)}
        </button>
      ))}
    </div>
  )
}

/** The rooms of this storey with no footprint yet, each dragged onto the sheet to place it. */
export function Tray(props: {
  rooms: readonly Room[]
  onGrab: (event: ReactPointerEvent, room: Room) => void
}) {
  return (
    <ul className="zoning-tray" aria-label="Rooms not placed">
      {props.rooms.map((room) => (
        <li key={room.id}>
          <button
            type="button"
            data-tray={room.id}
            onPointerDown={(event) => props.onGrab(event, room)}
          >
            <span className="tray-name">{room.name}</span>
            <span className="tray-area">{Math.round(room.targetArea)} m²</span>
          </button>
        </li>
      ))}
      {props.rooms.length === 0 && (
        <li className="tray-empty">Every room on this storey is placed.</li>
      )}
    </ul>
  )
}

export function PlotSheet({ plot }: { plot: Plot }) {
  const walls = outwardWalls(plot.polygon)
  return (
    <g>
      <defs>
        <pattern
          id="zoning-grid"
          width={GRID_M}
          height={GRID_M}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <path d={`M ${GRID_M} 0 L 0 0 L 0 ${GRID_M}`} className="grid-line" />
        </pattern>
      </defs>
      <polygon
        points={pointsOf(plot.polygon)}
        fill="url(#zoning-grid)"
        className={plot.on ? 'plot' : 'plot plot-off'}
      />
      {plot.street.map((index) => {
        const wall = walls[index]
        if (!wall) return null
        const middle: Point = [
          (wall.from[0] + wall.to[0]) / 2 + wall.normal[0] * 0.9,
          (wall.from[1] + wall.to[1]) / 2 + wall.normal[1] * 0.9,
        ]
        return (
          <g key={index}>
            <line
              x1={wall.from[0]}
              y1={wall.from[1]}
              x2={wall.to[0]}
              y2={wall.to[1]}
              className="street"
            />
            <text x={middle[0]} y={middle[1]} className="street-label" fontSize={0.8}>
              street
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function NorthArrow({ north, at }: { north: number; at: Point }) {
  return (
    <g className="north" transform={`translate(${at[0]} ${at[1]}) rotate(${north})`}>
      <line x1={0} y1={1.4} x2={0} y2={-1.4} />
      <polygon points="0,-1.9 0.45,-0.9 -0.45,-0.9" />
      <text x={0} y={2.5} fontSize={0.9}>
        N
      </text>
    </g>
  )
}

export function ScaleBar({ at }: { at: Point }) {
  return (
    <g className="scale-bar" transform={`translate(${at[0]} ${at[1]})`}>
      <line x1={0} y1={0} x2={5} y2={0} />
      {[0, 1, 2, 3, 4, 5].map((metre) => (
        <line key={metre} x1={metre} y1={-0.25} x2={metre} y2={0.25} />
      ))}
      <text x={5} y={1.1} fontSize={0.8}>
        5 m
      </text>
    </g>
  )
}

/** Footprints of the storey below, so a room can be lined up with what it stands on. */
export function Ghosts({ footprints }: { footprints: readonly Footprint[] }) {
  return (
    <g className="ghosts">
      {footprints.map((footprint, index) => (
        <polygon key={index} points={pointsOf(outlineOf(footprint))} className="ghost" />
      ))}
    </g>
  )
}

type RoomShapeProps = {
  readonly room: Room
  readonly sizes: RoomSizes | undefined
  readonly selected: boolean
  readonly onGrab: (event: ReactPointerEvent, id: string) => void
}

/** Memoised on the room the store hands back: a drag replaces only the room being dragged, so every other group keeps its props and is not drawn again. */
export const RoomShape = memo(function RoomShape(props: RoomShapeProps) {
  const { room, sizes } = props
  const footprint = room.footprint
  if (!footprint) return null
  const outline = outlineOf(footprint)
  const measure = area(outline)
  const middle = centroid(outline)
  const label = labelSize(footprint, room.name)
  const warn =
    offTarget(measure, room.targetArea) || (sizes ? belowMinimum(footprint, sizes) : false)
  return (
    <g
      data-room={room.id}
      data-rotation={footprint.rotation.toFixed(1)}
      data-area={measure.toFixed(2)}
      className={props.selected ? 'room room-selected' : 'room'}
    >
      <polygon
        points={pointsOf(outline)}
        className={room.pinned ? 'room-shape room-pinned' : 'room-shape'}
        onPointerDown={(event) => props.onGrab(event, room.id)}
      />
      <text x={middle[0]} y={middle[1] - label * 0.6} className="room-name" fontSize={label}>
        {room.name}
      </text>
      <text
        x={middle[0]}
        y={middle[1] + label * 0.8}
        className={warn ? 'room-area room-area-warning' : 'room-area'}
        fontSize={label * 0.85}
      >
        {`${metres2(measure)} of ${metres2(room.targetArea)} m²`}
      </text>
    </g>
  )
})

type HandleProps = {
  readonly footprint: Footprint
  readonly onRotate: (event: ReactPointerEvent) => void
  readonly onResize: (event: ReactPointerEvent, sx: Handle, sy: Handle) => void
}

export function Handles({ footprint, onRotate, onResize }: HandleProps) {
  const radians = (footprint.rotation * Math.PI) / 180
  const north = anchorPointOf(footprint, 0, -1)
  const grip: Point = [
    north[0] + Math.sin(radians) * ROTATE_REACH,
    north[1] - Math.cos(radians) * ROTATE_REACH,
  ]
  return (
    <g className="handles">
      <line x1={north[0]} y1={north[1]} x2={grip[0]} y2={grip[1]} className="rotate-stem" />
      <circle
        cx={grip[0]}
        cy={grip[1]}
        r={0.45}
        className="rotate-handle"
        data-rotate-handle="true"
        onPointerDown={onRotate}
      >
        <title>Turn the room</title>
      </circle>
      {HANDLES.map(([sx, sy]) => {
        const at = anchorPointOf(footprint, sx, sy)
        return (
          <rect
            key={`${sx},${sy}`}
            x={at[0] - 0.3}
            y={at[1] - 0.3}
            width={0.6}
            height={0.6}
            className="resize-handle"
            data-resize-handle={`${sx},${sy}`}
            onPointerDown={(event) => onResize(event, sx, sy)}
          />
        )
      })}
    </g>
  )
}

export function Door({
  mark,
  selected,
  onSelect,
}: {
  mark: DoorMark
  selected: boolean
  onSelect: (event: ReactPointerEvent) => void
}) {
  const half = (mark.kind === 'open' ? OPEN_M : DOOR_M) / 2
  const from: Point = [mark.at[0] - mark.along[0] * half, mark.at[1] - mark.along[1] * half]
  const to: Point = [mark.at[0] + mark.along[0] * half, mark.at[1] + mark.along[1] * half]
  const across = perpendicular(mark.along)
  const leaf: Point = [mark.at[0] + across[0] * DOOR_M, mark.at[1] + across[1] * DOOR_M]
  return (
    <g
      data-edge={mark.edgeId}
      data-door={mark.kind}
      className={selected ? 'door door-selected' : 'door'}
    >
      <line
        x1={from[0]}
        y1={from[1]}
        x2={to[0]}
        y2={to[1]}
        className="door-grip"
        onPointerDown={onSelect}
      />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="door-gap" />
      {mark.kind !== 'open' && (
        <line
          x1={mark.at[0]}
          y1={mark.at[1]}
          x2={leaf[0]}
          y2={leaf[1]}
          className="door-leaf"
          onPointerDown={onSelect}
        />
      )}
    </g>
  )
}

export function Tension({ mark }: { mark: TensionMark }) {
  return (
    <line
      data-tension={mark.edgeId}
      x1={mark.from[0]}
      y1={mark.from[1]}
      x2={mark.to[0]}
      y2={mark.to[1]}
      className="tension"
    >
      <title>{`${mark.kind}, drawn nowhere: these two rooms share no wall`}</title>
    </line>
  )
}

export function Proposal({
  mark,
  onAccept,
}: {
  mark: ProposalMark
  onAccept: (event: ReactPointerEvent) => void
}) {
  const [x, y] = mark.at
  return (
    <g data-proposal={`${mark.a}|${mark.b}`} className="proposal" onPointerDown={onAccept}>
      <circle cx={x} cy={y} r={0.5} className="proposal-grip" />
      <path
        d={`M ${x - 0.3} ${y} L ${x + 0.3} ${y} M ${x} ${y - 0.3} L ${x} ${y + 0.3}`}
        className="proposal-plus"
      />
      <title>Connect these two rooms with a door</title>
    </g>
  )
}

/** The rectangle that follows the hand while a room is dragged out of the tray. */
export function DropGhost({ at, size }: { at: Point; size: { width: number; depth: number } }) {
  return (
    <rect
      className="drop-ghost"
      x={at[0] - size.width / 2}
      y={at[1] - size.depth / 2}
      width={size.width}
      height={size.depth}
    />
  )
}
