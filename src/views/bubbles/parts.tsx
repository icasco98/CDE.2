import type { PointerEvent as ReactPointerEvent } from 'react'
import { bandOf, storeyLabel, type Body, type Position } from '../../bubbles'
import { fillFor, type Extent } from './frame'
import type { BubbleRoom } from './types'

const LABEL_SIZE = 1.15

/** A small room's label shrinks with it, so a short name still sits inside its own circle. */
function labelSize(radius: number): number {
  return Math.min(LABEL_SIZE, Math.max(0.55, radius * 0.42))
}

/** The two marks sit opposite each other on the rim: what holds the room on the left, what links it on the right. */
function onRim(body: Body, toTheLeft: boolean): Position {
  const away = body.radius * Math.SQRT1_2
  return { x: body.x + (toTheLeft ? -away : away), y: body.y - away }
}

export function Bands(props: { storeys: number; bandHeight: number; extent: Extent }) {
  return Array.from({ length: Math.max(1, props.storeys) }, (_, storey) => {
    const band = bandOf(storey, props.storeys, props.bandHeight)
    return (
      <g key={storey}>
        <rect
          x={props.extent.minX}
          y={band.top}
          width={props.extent.width}
          height={band.bottom - band.top}
          className={storey % 2 === 0 ? 'band band-even' : 'band band-odd'}
        />
        <text
          x={props.extent.minX + 1}
          y={band.top + 2}
          className="band-label"
          fontSize={LABEL_SIZE}
        >
          {storeyLabel(storey)}
        </text>
      </g>
    )
  })
}

export type BubbleHandlers = {
  readonly onGrab: (event: ReactPointerEvent, body: Body) => void
  readonly onReach: (event: ReactPointerEvent, body: Body) => void
  readonly onDrag: (event: ReactPointerEvent) => void
  readonly onRelease: (event: ReactPointerEvent) => void
}

export function Bubble(props: {
  body: Body
  room: BubbleRoom
  selected: boolean
  handlers: BubbleHandlers
}) {
  const { body, room, handlers } = props
  const size = labelSize(body.radius)
  const rim = onRim(body, false)
  const held = onRim(body, true)
  return (
    <g data-room={body.id} className={props.selected ? 'bubble bubble-selected' : 'bubble'}>
      <circle
        data-bubble={body.id}
        cx={body.x}
        cy={body.y}
        r={body.radius}
        fill={fillFor(room.category)}
        onPointerDown={(event) => handlers.onGrab(event, body)}
        onPointerMove={handlers.onDrag}
        onPointerUp={handlers.onRelease}
      />
      <text x={body.x} y={body.y - size * 0.2} className="bubble-name" fontSize={size}>
        {room.name}
      </text>
      <text x={body.x} y={body.y + size} className="bubble-area" fontSize={size * 0.82}>
        {Math.round(room.targetArea)} m²
      </text>
      {room.pinned && (
        <circle cx={held.x} cy={held.y} r={Math.max(0.45, body.radius * 0.16)} className="pin-mark">
          <title>Held in place</title>
        </circle>
      )}
      <circle
        cx={rim.x}
        cy={rim.y}
        r={Math.max(0.55, body.radius * 0.2)}
        className="reach"
        data-reach={body.id}
        onPointerDown={(event) => handlers.onReach(event, body)}
        onPointerMove={handlers.onDrag}
        onPointerUp={handlers.onRelease}
      >
        <title>Drag to another room to connect them</title>
      </circle>
    </g>
  )
}

export function Link(props: {
  id: string
  a: Body
  b: Body
  selected: boolean
  onSelect: (event: ReactPointerEvent) => void
}) {
  const { a, b } = props
  return (
    <g data-edge={props.id}>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className="link-grip"
        onPointerDown={props.onSelect}
      />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className={props.selected ? 'link link-selected' : 'link'}
        onPointerDown={props.onSelect}
      />
    </g>
  )
}

/** The mark is big enough to aim at on a small bubble and never so big it hides the two rooms. */
function markRadius(a: Body, b: Body): number {
  return Math.min(0.7, Math.max(0.35, Math.min(a.radius, b.radius) * 0.3))
}

export function Proposed(props: {
  a: Body
  b: Body
  /** The rulebook row's words, shown on hover. */
  source: string
  onAccept: (event: ReactPointerEvent) => void
}) {
  const { a, b } = props
  const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const radius = markRadius(a, b)
  return (
    <g
      data-proposal={`${a.id}:${b.id}`}
      className="proposal"
      onPointerDown={props.onAccept}
      role="button"
    >
      <title>{props.source}</title>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="proposal-grip" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="proposal-line" />
      <circle cx={at.x} cy={at.y} r={radius} className="proposal-mark" />
      <text x={at.x} y={at.y} className="proposal-plus" fontSize={radius * 1.8}>
        +
      </text>
    </g>
  )
}
