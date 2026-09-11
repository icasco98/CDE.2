import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { bandOf, storeyLabel, type Body, type Position } from '../../bubbles'
import { categoryLabels } from '../../rulebook'
import type { Extent } from '../camera'
import { categoryClass } from './frame'
import type { BubbleProposal, BubbleRoom } from './types'

/*
 * What must hold its size on the screen does so as the zoning sheet does it: every stroke is in
 * pixels through `vector-effect: non-scaling-stroke`, and text takes a font size from the sheet's
 * `--per-px`, the metres one pixel covers, so a zoom changes one style and no bubble is drawn
 * again. A bubble's own marks, the pin and the ring, stay in metres because they belong to the
 * circle and grow with it; the legend belongs to the screen and is counter-scaled instead.
 */

/** The label on a roomy bubble, in metres of cap height; the stylesheet holds it to a band of pixels. */
const LABEL_M = 1.15

/** The legend's row pitch, its air, and how wide its panel runs, in pixels on the screen. */
const ROW_PX = 15
const PAD_PX = 9
const PANEL_PX = 124

/** A small room's label shrinks with it, so a short name still sits inside its own circle. */
function labelSize(radius: number): number {
  return Math.min(LABEL_M, Math.max(0.55, radius * 0.42))
}

/** The two marks sit opposite each other on the rim: what holds the room on the left, what links it on the right. */
function onRim(body: Body, toTheLeft: boolean): Position {
  const away = body.radius * Math.SQRT1_2
  return { x: body.x + (toTheLeft ? -away : away), y: body.y - away }
}

/**
 * One strip per storey, the boundary between them drawn right across what is in view with the
 * storey's name under it, so a bubble is read against the storey it is being given.
 */
export function Bands(props: {
  storeys: number
  bandHeight: number
  shown: Extent
  perPixel: number
}) {
  const levels = Math.max(1, props.storeys)
  const { shown } = props
  return Array.from({ length: levels }, (_unused, storey) => {
    const band = bandOf(storey, levels, props.bandHeight)
    return (
      <g key={storey}>
        <rect
          x={shown.minX}
          y={band.top}
          width={shown.width}
          height={band.bottom - band.top}
          className={storey % 2 === 0 ? 'band band-even' : 'band band-odd'}
        />
        <line
          x1={shown.minX}
          y1={band.top}
          x2={shown.minX + shown.width}
          y2={band.top}
          className="band-line"
        />
        <text
          x={shown.minX + 10 * props.perPixel}
          y={band.top + 17 * props.perPixel}
          className="band-label"
          data-band={storey}
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
}

type BubbleProps = {
  readonly body: Body
  readonly room: BubbleRoom
  readonly selected: boolean
  /** On a storey the filter is not showing: drawn faint and out of the pointer's reach. */
  readonly dimmed: boolean
  readonly handlers: BubbleHandlers
}

/** Memoised on the body the simulation hands back, so a zoom or a pan draws no bubble again. */
export const Bubble = memo(function Bubble(props: BubbleProps) {
  const { body, room, handlers } = props
  const rim = onRim(body, false)
  const held = onRim(body, true)
  const classes = ['bubble']
  if (props.selected) classes.push('bubble-selected')
  if (props.dimmed) classes.push('bubble-dimmed')
  return (
    <g
      data-room={body.id}
      className={classes.join(' ')}
      style={{ '--label-m': String(labelSize(body.radius)) } as CSSProperties}
    >
      <circle
        data-bubble={body.id}
        cx={body.x}
        cy={body.y}
        r={body.radius}
        className={`bubble-shape ${categoryClass(room.category)}`}
        onPointerDown={(event) => handlers.onGrab(event, body)}
      />
      <text x={body.x} y={body.y} dy="-0.35em" className="bubble-name">
        {room.name}
      </text>
      <text x={body.x} y={body.y} dy="0.95em" className="bubble-area">
        {Math.round(room.targetArea)} m²
      </text>
      {room.pinned && (
        <circle cx={held.x} cy={held.y} r={Math.max(0.45, body.radius * 0.16)} className="pin-mark">
          <title>Held in place</title>
        </circle>
      )}
      {/* Faint until the hand or the selection is on the bubble, where it is the handle to drag a link from. */}
      <circle
        cx={rim.x}
        cy={rim.y}
        r={Math.max(0.55, body.radius * 0.2)}
        className="reach"
        data-reach={body.id}
        onPointerDown={(event) => handlers.onReach(event, body)}
      >
        <title>Drag to another room to connect them</title>
      </circle>
    </g>
  )
})

/** Memoised like the bubbles, so a camera that changes nothing about the graph redraws no link. */
export const Link = memo(function Link(props: {
  id: string
  a: Body
  b: Body
  kind: string
  selected: boolean
  dimmed: boolean
  onSelect: (event: ReactPointerEvent, id: string) => void
}) {
  const { a, b } = props
  const select = (event: ReactPointerEvent): void => props.onSelect(event, props.id)
  return (
    <g
      data-edge={props.id}
      data-kind={props.kind}
      className={props.dimmed ? 'link-group link-dimmed' : 'link-group'}
    >
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="link-grip" onPointerDown={select} />
      {/* One space flowing into the next is a broad opening; a door is the single line. */}
      {props.kind === 'open' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="link-flow" />}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className={props.selected ? 'link link-selected' : 'link'}
        onPointerDown={select}
      />
    </g>
  )
})

/** The mark is big enough to aim at on a small bubble and never so big it hides the two rooms. */
function markRadius(a: Body, b: Body): number {
  return Math.min(0.7, Math.max(0.35, Math.min(a.radius, b.radius) * 0.3))
}

/** From rim to rim: a proposal draws over the bubbles, so its thread must never cover one. */
function betweenRims(a: Body, b: Body): readonly [Position, Position] {
  const span = Math.hypot(b.x - a.x, b.y - a.y)
  const unit = { x: (b.x - a.x) / (span || 1), y: (b.y - a.y) / (span || 1) }
  return [
    { x: a.x + unit.x * a.radius, y: a.y + unit.y * a.radius },
    { x: b.x - unit.x * b.radius, y: b.y - unit.y * b.radius },
  ]
}

export const Proposed = memo(function Proposed(props: {
  a: Body
  b: Body
  proposal: BubbleProposal
  /** The rulebook row's words, shown on hover. */
  source: string
  onAccept: (event: ReactPointerEvent, proposal: BubbleProposal) => void
}) {
  const { a, b } = props
  const [from, to] = betweenRims(a, b)
  const at = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const radius = markRadius(a, b)
  return (
    <g
      data-proposal={`${a.id}:${b.id}`}
      className="proposal"
      onPointerDown={(event) => props.onAccept(event, props.proposal)}
      role="button"
    >
      <title>{props.source}</title>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="proposal-grip" />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="proposal-line" />
      <circle cx={at.x} cy={at.y} r={radius} className="proposal-mark" />
      <text x={at.x} y={at.y} className="proposal-plus" fontSize={radius * 1.8}>
        +
      </text>
    </g>
  )
})

type LegendRow = { readonly key: string; readonly label: string; readonly mark: ReactNode }

/** Everything the sheet draws and nothing it does not: the fills, the two marks, the two strokes. */
const legendRows: readonly LegendRow[] = [
  ...Object.entries(categoryLabels).map(([category, label]) => ({
    key: categoryClass(category),
    label,
    mark: <circle cx={11} cy={0} r={6} className={`legend-swatch ${categoryClass(category)}`} />,
  })),
  {
    key: 'pinned',
    label: 'Held in place',
    mark: <circle cx={11} cy={0} r={4} className="pin-mark" />,
  },
  {
    key: 'proposal',
    label: 'Proposed',
    mark: (
      <>
        <circle cx={11} cy={0} r={6} className="proposal-mark" />
        <text x={11} y={0} className="proposal-plus" fontSize={10}>
          +
        </text>
      </>
    ),
  },
  { key: 'door', label: 'Door', mark: <line x1={2} y1={0} x2={20} y2={0} className="link" /> },
  {
    key: 'open',
    label: 'Open',
    mark: (
      <>
        <line x1={2} y1={0} x2={20} y2={0} className="link-flow" />
        <line x1={2} y1={0} x2={20} y2={0} className="link" />
      </>
    ),
  },
]

/** How tall the legend stands and how far in it sits from the corner of what is drawn, in pixels. */
export const LEGEND_PX = { height: PAD_PX * 2 + legendRows.length * ROW_PX, inset: 12 }

/** Drawn in pixels inside a group counter-scaled by the camera, so it is one size at any zoom. */
export function Legend({ at, perPixel }: { at: Position; perPixel: number }) {
  return (
    <g className="legend" transform={`translate(${at.x} ${at.y}) scale(${perPixel})`}>
      <rect
        x={0}
        y={0}
        width={PANEL_PX}
        height={LEGEND_PX.height}
        rx={4}
        className="legend-panel"
      />
      {legendRows.map((row, index) => (
        <g key={row.key} transform={`translate(${PAD_PX} ${PAD_PX + ROW_PX * (index + 0.5)})`}>
          {row.mark}
          <text x={26} y={0} className="legend-label">
            {row.label}
          </text>
        </g>
      ))}
    </g>
  )
}
