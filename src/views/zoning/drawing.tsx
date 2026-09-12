import type { PointerEvent as ReactPointerEvent } from 'react'
import { outlineOf, type Footprint, type Point, type Polygon } from '../../geometry'
import type { Room } from '../../model'
import { metres2 } from '../requirements/format'
import { pointsOf } from './frame'

/** How wide a point handle, the "+" beside it and the mark on a corner are, in pixels. */
const VERTEX_PX = 9
const ADD_PX = 7
const CORNER_PX = 5

/** The shape as it is being walked: the run put down so far and the wall following the hand. */
export function DrawPreview({
  run,
  corners,
  closing,
  perPixel,
}: {
  run: Polygon
  /** The corners the hand has put down, each drawn as a mark so the run can be counted. */
  corners: readonly Point[]
  /** Whether the next click would close the shape, which the first corner shows by standing out. */
  closing: boolean
  readonly perPixel: number
}) {
  const first = corners[0]
  const last = run[run.length - 1]
  return (
    <g className="drawing" data-draw-run={run.length}>
      {run.length > 1 && <polyline points={pointsOf(run)} className="draw-run" />}
      {first && last && run.length > 2 && (
        <line x1={last[0]} y1={last[1]} x2={first[0]} y2={first[1]} className="draw-close" />
      )}
      {corners.map((at, index) => (
        <g key={index} transform={`translate(${at[0]} ${at[1]}) scale(${perPixel})`}>
          <circle
            cx={0}
            cy={0}
            r={index === 0 && closing ? VERTEX_PX : CORNER_PX}
            className={index === 0 && closing ? 'draw-corner draw-first' : 'draw-corner'}
          />
        </g>
      ))}
    </g>
  )
}

/**
 * The circle the hand is pulling out of its centre, with the radius it has reached, its live area,
 * and, faint beside it, the room's target — so the hand can see how far the drag has carried it
 * from the size a click alone would have given.
 */
export function CirclePreview({
  centre,
  radius,
  targetArea,
  perPixel,
}: {
  centre: Point
  radius: number
  targetArea: number
  perPixel: number
}) {
  const liveArea = Math.PI * radius * radius
  return (
    <g
      className="drawing"
      data-circle-radius={radius.toFixed(2)}
      data-circle-area={liveArea.toFixed(2)}
    >
      <circle cx={centre[0]} cy={centre[1]} r={Math.max(radius, 0.01)} className="draw-run" />
      <line
        x1={centre[0]}
        y1={centre[1]}
        x2={centre[0] + radius}
        y2={centre[1]}
        className="draw-close"
      />
      <text
        x={centre[0]}
        y={centre[1]}
        style={{
          font: `${12 * perPixel}px sans-serif`,
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          fill: '#2b2822',
          paintOrder: 'stroke',
          stroke: '#fffdf9',
          strokeWidth: 3 * perPixel,
        }}
      >
        {metres2(liveArea)}
        <tspan fill="#6d6862" fillOpacity={0.75}>{` · target ${metres2(targetArea)}`}</tspan>
      </text>
    </g>
  )
}

type PointsProps = {
  readonly footprint: Footprint
  readonly perPixel: number
  /** The point the hand last took hold of, which Delete removes. */
  readonly picked: number | null
  readonly onGrab: (event: ReactPointerEvent, index: number) => void
  readonly onAdd: (event: ReactPointerEvent, index: number) => void
}

/** A handle on every corner of the selected room and a "+" in the middle of every wall. */
export function VertexHandles({ footprint, perPixel, picked, onGrab, onAdd }: PointsProps) {
  const outline = outlineOf(footprint)
  return (
    <g className="vertices">
      {outline.map((at, index) => {
        const next = outline[(index + 1) % outline.length] ?? at
        const middle: Point = [(at[0] + next[0]) / 2, (at[1] + next[1]) / 2]
        return (
          <g key={index}>
            <g transform={`translate(${middle[0]} ${middle[1]}) scale(${perPixel})`}>
              <circle
                cx={0}
                cy={0}
                r={ADD_PX}
                className="vertex-add"
                data-add-vertex={index}
                onPointerDown={(event) => onAdd(event, index)}
              >
                <title>Add a point here</title>
              </circle>
              <path
                d={`M ${-ADD_PX * 0.5} 0 L ${ADD_PX * 0.5} 0 M 0 ${-ADD_PX * 0.5} L 0 ${ADD_PX * 0.5}`}
                className="vertex-plus"
              />
            </g>
            <g transform={`translate(${at[0]} ${at[1]}) scale(${perPixel})`}>
              <rect
                x={-VERTEX_PX / 2}
                y={-VERTEX_PX / 2}
                width={VERTEX_PX}
                height={VERTEX_PX}
                className={index === picked ? 'vertex-handle vertex-picked' : 'vertex-handle'}
                data-vertex={index}
                onPointerDown={(event) => onGrab(event, index)}
              >
                <title>Drag to move this point, Delete to remove it</title>
              </rect>
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** Which room the Draw or the Circle button is about to draw, when none was picked first. */
export function PickRoom({
  rooms,
  onPick,
  onDrop,
}: {
  rooms: readonly Room[]
  onPick: (id: string) => void
  onDrop: () => void
}) {
  return (
    <div data-pick="" className="zoning-pick" role="dialog" aria-label="Which room to draw">
      <p>Which room?</p>
      <ul>
        {rooms.map((room) => (
          <li key={room.id}>
            <button type="button" data-pick-room={room.id} onClick={() => onPick(room.id)}>
              {room.name}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" data-pick-drop="" onClick={onDrop}>
        Never mind
      </button>
    </div>
  )
}
