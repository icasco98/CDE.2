import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  anchorPointOf,
  boundingBox,
  centroid,
  exactArea,
  outlineOf,
  ringsToPath,
  wallDirection,
  wallMidpoint,
  type Footprint,
  type Handle,
  type Point,
  type Polygon,
} from '../../geometry'
import type { Room } from '../../model'
import { storeyLabel } from '../../rulebook'
import { metres2 } from '../requirements/format'
import { belowMinimum, offTarget, type RoomSizes } from './defaults'
import type {
  DoorMark,
  ProposalMark,
  TensionMark,
  VanishedWall as VanishedMark,
  WallPair,
} from './doors'
import { pointsOf } from '../frame'
import type { Join } from './joins'

/*
 * Everything that must hold its size on the screen does so in one of three ways: a line keeps its
 * weight through `vector-effect: non-scaling-stroke`; text takes a per-zoom font size from the
 * sheet's `--per-px`, the metres one pixel covers, so a zoom changes one style and no room group
 * is drawn again; and a mark of fixed shape is drawn in pixels inside a group counter-scaled by
 * that same number. A door keeps its 0.9 m opening in metres: it measures a wall, and a wall is
 * not a mark on the screen.
 */

/** The clear opening a door and an open edge are drawn with, in metres. */
const DOOR_M = 0.9
const OPEN_M = 1.6

/** How far outside its wall the rotation handle sits, and how wide each handle is, in pixels. */
const ROTATE_REACH_PX = 19
const ROTATE_HANDLE_PX = 8
const RESIZE_HANDLE_PX = 10

/** The reach of the "+" that offers a door, in pixels, so it is the same target at every zoom. */
const PROPOSAL_PX = 8

/**
 * How far either side of a shared wall its handle reaches, and how wide each end of it is, in
 * pixels. The middle of the wall is left clear on purpose: a door mark and the "+" that offers
 * one both sit there, and the handle would otherwise stand over them.
 */
const WALL_REACH_PX = 14
const WALL_GRIP_PX = 7

/** A handle may take up no more of a room than this across the wall, however far off the sheet is. */
const WALL_SHARE = 0.3

/** The label on a roomy room, in metres of cap height; the stylesheet holds it to a band of pixels. */
const LABEL_M = 0.62

/** A label shrinks with its room so a short name sits inside it; a long name in a small room still runs over the wall. */
function labelSize(polygon: Polygon, name: string): number {
  const bounds = boundingBox(polygon)
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

/**
 * Rooms an open connection runs between, drawn as the one space they make: the union of their
 * outlines filled once and stroked once, and one label carrying every name and every area. The
 * rooms themselves are still drawn over it, unfilled, so every gesture on either of them is the
 * gesture it always was.
 */
export function JoinShape({ join, selected }: { join: Join; selected: boolean }) {
  return (
    <g
      className={selected ? 'join join-selected' : 'join'}
      style={{ '--label-m': String(labelSize(join.outline, join.label)) } as CSSProperties}
    >
      <path data-join={join.key} d={ringsToPath(join.rings)} className="join-shape">
        <title>{join.label}</title>
      </path>
      <text x={join.at[0]} y={join.at[1]} className="join-label">
        {join.label}
      </text>
    </g>
  )
}

type RoomShapeProps = {
  readonly room: Room
  readonly sizes: RoomSizes | undefined
  readonly selected: boolean
  /** Whether the room is drawn inside a join, which carries its wall and its label for it. */
  readonly joined: boolean
  readonly onGrab: (event: ReactPointerEvent, id: string) => void
  /** The room under the pointer, so the handles on its shared walls show themselves. */
  readonly onHover: (id: string | null) => void
}

/**
 * Memoised on the room the store hands back: a drag replaces only the room being dragged, and the
 * camera reaches the labels through the stylesheet, so no other group is drawn again for a drag or
 * a zoom.
 */
export const RoomShape = memo(function RoomShape(props: RoomShapeProps) {
  const { room, sizes } = props
  const footprint = room.footprint
  if (!footprint) return null
  const outline = outlineOf(footprint)
  // The exact area, so a room with a curved wall is measured by the curve and not by the chords.
  const measure = exactArea(footprint)
  const middle = centroid(outline)
  const label = labelSize(footprint.polygon, room.name)
  const warn =
    offTarget(measure, room.targetArea) || (sizes ? belowMinimum(footprint, sizes) : false)
  return (
    <g
      data-room={room.id}
      // A room drawn inside a join gives its label to the join, so its name is on the group as
      // well: a room is still that room when its name is being said by the space it flows into.
      data-name={room.name}
      data-rotation={footprint.rotation.toFixed(1)}
      data-area={measure.toFixed(2)}
      className={props.selected ? 'room room-selected' : 'room'}
      style={{ '--label-m': String(label) } as CSSProperties}
    >
      {/* A joined room keeps its shape to take the pointer and gives up its fill, its wall and
          its label to the join, so no wall is drawn where the two rooms flow into one another. */}
      <polygon
        points={pointsOf(outline)}
        className={
          props.joined ? 'room-in-join' : room.pinned ? 'room-shape room-pinned' : 'room-shape'
        }
        onPointerDown={(event) => props.onGrab(event, room.id)}
        onPointerEnter={() => props.onHover(room.id)}
        onPointerLeave={() => props.onHover(null)}
      />
      {!props.joined && (
        <text x={middle[0]} y={middle[1]} dy="-0.6em" className="room-name">
          {room.name}
        </text>
      )}
      {!props.joined && (
        <text
          x={middle[0]}
          y={middle[1]}
          dy="0.75em"
          className={warn ? 'room-area room-area-warning' : 'room-area'}
        >
          {`${metres2(measure)} of ${metres2(room.targetArea)} m²`}
        </text>
      )}
    </g>
  )
})

type HandleProps = {
  readonly footprint: Footprint
  /** The metres one pixel covers, so a handle is the same target however close the sheet is drawn. */
  readonly perPixel: number
  readonly onRotate: (event: ReactPointerEvent) => void
  readonly onResize: (event: ReactPointerEvent, sx: Handle, sy: Handle) => void
}

export function Handles({ footprint, perPixel, onRotate, onResize }: HandleProps) {
  const radians = (footprint.rotation * Math.PI) / 180
  const north = anchorPointOf(footprint, 0, -1)
  const reach = ROTATE_REACH_PX * perPixel
  const grip: Point = [north[0] + Math.sin(radians) * reach, north[1] - Math.cos(radians) * reach]
  return (
    <g className="handles">
      <line x1={north[0]} y1={north[1]} x2={grip[0]} y2={grip[1]} className="rotate-stem" />
      <g transform={`translate(${grip[0]} ${grip[1]}) scale(${perPixel})`}>
        <circle
          cx={0}
          cy={0}
          r={ROTATE_HANDLE_PX}
          className="rotate-handle"
          data-rotate-handle="true"
          onPointerDown={onRotate}
        >
          <title>Turn the room</title>
        </circle>
      </g>
      {HANDLES.map(([sx, sy]) => {
        const at = anchorPointOf(footprint, sx, sy)
        return (
          <g key={`${sx},${sy}`} transform={`translate(${at[0]} ${at[1]}) scale(${perPixel})`}>
            <rect
              x={-RESIZE_HANDLE_PX / 2}
              y={-RESIZE_HANDLE_PX / 2}
              width={RESIZE_HANDLE_PX}
              height={RESIZE_HANDLE_PX}
              className="resize-handle"
              data-resize-handle={`${sx},${sy}`}
              onPointerDown={(event) => onResize(event, sx, sy)}
            />
          </g>
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

/**
 * What is left of the wall an open connection runs through once the join has taken it away: a thin
 * dotted line on its own run, carrying the edge, so the connection is still there to be picked.
 */
export function VanishedWall({
  mark,
  selected,
  onSelect,
}: {
  mark: VanishedMark
  selected: boolean
  onSelect: (event: ReactPointerEvent) => void
}) {
  return (
    <g
      data-edge={mark.edgeId}
      data-door="open"
      className={selected ? 'vanished vanished-selected' : 'vanished'}
    >
      <line
        x1={mark.from[0]}
        y1={mark.from[1]}
        x2={mark.to[0]}
        y2={mark.to[1]}
        className="door-grip"
        onPointerDown={onSelect}
      />
      <line
        x1={mark.from[0]}
        y1={mark.from[1]}
        x2={mark.to[0]}
        y2={mark.to[1]}
        className="vanished-line"
      />
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
  perPixel,
  onAccept,
}: {
  mark: ProposalMark
  perPixel: number
  onAccept: (event: ReactPointerEvent) => void
}) {
  const arm = PROPOSAL_PX * 0.6
  return (
    <g
      data-proposal={`${mark.a}|${mark.b}`}
      className="proposal"
      transform={`translate(${mark.at[0]} ${mark.at[1]}) scale(${perPixel})`}
      onPointerDown={onAccept}
    >
      <circle cx={0} cy={0} r={PROPOSAL_PX} className="proposal-grip" />
      <path d={`M ${-arm} 0 L ${arm} 0 M 0 ${-arm} L 0 ${arm}`} className="proposal-plus" />
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

/**
 * The grab handle on a wall two rooms share: a double arrow across the wall at its midpoint,
 * turned so it points the way the wall can travel. Only its two ends take the pointer.
 */
export function WallHandle({
  pair,
  perPixel,
  shown,
  onGrab,
  onHover,
}: {
  pair: WallPair
  perPixel: number
  shown: boolean
  onGrab: (event: ReactPointerEvent) => void
  onHover: (over: boolean) => void
}) {
  const at = wallMidpoint(pair.wall)
  const along = wallDirection(pair.wall)
  const turn = (Math.atan2(along[1], along[0]) * 180) / Math.PI
  // Drawn in metres rather than in a counter-scaled group: it is a screen-sized handle until the
  // rooms either side are smaller than that, and then it is theirs to fit, so a 3 m² WC can still
  // be picked up by the middle.
  const reach = Math.min(WALL_REACH_PX * perPixel, pair.across * WALL_SHARE)
  const grip = Math.min(WALL_GRIP_PX * perPixel, reach * 0.45)
  const head = (way: number): string =>
    `0,${way * (reach + grip * 0.6)} ${grip * 0.5},${way * (reach - grip * 0.3)} ${-grip * 0.5},${way * (reach - grip * 0.3)}`
  return (
    <g
      data-wall={`${pair.a}:${pair.b}`}
      className={shown ? 'wall-handle wall-shown' : 'wall-handle'}
      transform={`translate(${at[0]} ${at[1]}) rotate(${turn})`}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <line x1={0} y1={-reach} x2={0} y2={reach} className="wall-stem" />
      <polygon points={head(-1)} className="wall-head" />
      <polygon points={head(1)} className="wall-head" />
      {[-1, 1].map((way) => (
        <circle
          key={way}
          cx={0}
          cy={way * reach}
          r={grip}
          className="wall-grip"
          onPointerDown={onGrab}
        />
      ))}
      <title>Drag to move the wall between these two rooms</title>
    </g>
  )
}

/** A room let go over its neighbours, drawn where it landed while the person is asked about it. */
export function PendingRoom({
  id,
  name,
  targetArea,
  footprint,
}: {
  id: string
  name: string
  targetArea: number
  footprint: Footprint
}) {
  const outline = outlineOf(footprint)
  const measure = exactArea(footprint)
  const middle = centroid(outline)
  return (
    <g
      data-pending={id}
      data-area={measure.toFixed(2)}
      className="room room-pending"
      style={{ '--label-m': String(labelSize(footprint.polygon, name)) } as CSSProperties}
    >
      <polygon points={pointsOf(outline)} className="pending-shape" />
      <text x={middle[0]} y={middle[1]} dy="-0.6em" className="room-name">
        {name}
      </text>
      <text x={middle[0]} y={middle[1]} dy="0.75em" className="room-area">
        {`${metres2(measure)} of ${metres2(targetArea)} m²`}
      </text>
    </g>
  )
}

/** What the prompt at the pointer has to say: whose room, over what, and why it may not carve. */
type AskPrompt = {
  readonly name: string
  readonly over: readonly string[]
  readonly reason: string | null
  /** Where the hand let the room go, in pixels on the screen. */
  readonly at: readonly [number, number]
}

/**
 * The question a drop over another room asks. It is DOM rather than a mark on the sheet so that
 * it is the size of the screen at any zoom and reachable by the keyboard.
 */
export function Ask({
  prompt,
  onCarve,
  onPutBack,
}: {
  prompt: AskPrompt
  onCarve: () => void
  onPutBack: () => void
}) {
  const carve = useRef<HTMLButtonElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const first = carve.current?.disabled ? back.current : carve.current
    first?.focus()
  }, [])
  const many = prompt.over.length > 1
  const label = many ? `Carve ${prompt.over.length} rooms` : `Carve ${prompt.over[0] ?? 'the room'}`
  return (
    <div
      data-ask=""
      className="zoning-ask"
      role="dialog"
      aria-label={`${prompt.name} lies over ${prompt.over.join(' and ')}`}
      style={{ left: `${prompt.at[0]}px`, top: `${prompt.at[1]}px` }}
    >
      <p className="ask-question">{`${prompt.name} lies over ${prompt.over.join(' and ')}.`}</p>
      {prompt.reason && <p className="ask-note">{`${prompt.reason}.`}</p>}
      <div className="ask-answers">
        <button
          type="button"
          data-carve=""
          ref={carve}
          disabled={prompt.reason !== null}
          title={prompt.reason ?? undefined}
          onClick={onCarve}
        >
          {label}
        </button>
        <button type="button" data-put-back="" ref={back} onClick={onPutBack}>
          Put back
        </button>
      </div>
    </div>
  )
}
