import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { bandOf, storeyLabel, twinY, type Body, type Position } from '../../bubbles'
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
function onRim(at: Position, radius: number, toTheLeft: boolean): Position {
  const away = radius * Math.SQRT1_2
  return { x: at.x + (toTheLeft ? -away : away), y: at.y - away }
}

/** The storeys a stair reaches, in the words the bands are labelled with. */
function spanMark(storey: number, span: number): string {
  return `${storeyLabel(storey)} to ${storeyLabel(storey + span - 1)}`
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
  /** The link is drawn from the twin the handle was taken from, so it starts where the hand is. */
  readonly onReach: (event: ReactPointerEvent, body: Body, storey: number) => void
}

type BubbleProps = {
  readonly body: Body
  readonly room: BubbleRoom
  /** The storey this twin is drawn in; the room has one twin in every band it reaches. */
  readonly twin: number
  readonly bandHeight: number
  readonly selected: boolean
  /** On a storey the filter is not showing: drawn faint and out of the pointer's reach. */
  readonly dimmed: boolean
  readonly handlers: BubbleHandlers
}

/** Memoised on the body and which twin of it this is, so a zoom or a pan draws no bubble again. */
export const Bubble = memo(function Bubble(props: BubbleProps) {
  const { body, room, twin, handlers } = props
  const span = Math.max(1, Math.trunc(body.storeysSpanned))
  const at = { x: body.x, y: twinY(body, twin, props.bandHeight) }
  const rim = onRim(at, body.radius, false)
  const held = onRim(at, body.radius, true)
  const classes = ['bubble']
  if (props.selected) classes.push('bubble-selected')
  if (props.dimmed) classes.push('bubble-dimmed')
  return (
    <g
      data-room={body.id}
      data-twin={twin}
      className={classes.join(' ')}
      style={{ '--label-m': String(labelSize(body.radius)) } as CSSProperties}
    >
      <circle
        data-bubble={body.id}
        cx={at.x}
        cy={at.y}
        r={body.radius}
        className={`bubble-shape ${categoryClass(room.category)}`}
        onPointerDown={(event) => handlers.onGrab(event, body)}
      />
      <text x={at.x} y={at.y} dy={span > 1 ? '-0.85em' : '-0.35em'} className="bubble-name">
        {room.name}
      </text>
      <text x={at.x} y={at.y} dy={span > 1 ? '0.45em' : '0.95em'} className="bubble-area">
        {Math.round(room.targetArea)} m²
      </text>
      {/* A room drawn twice must say so on the bubble itself, or two circles read as two rooms. */}
      {span > 1 && (
        <text x={at.x} y={at.y} dy="1.85em" className="bubble-span">
          {spanMark(body.storey, span)}
        </text>
      )}
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
        onPointerDown={(event) => handlers.onReach(event, body, twin)}
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
  /** The storey the edge is on: it is drawn between the twin of each end that stands there. */
  storey: number
  bandHeight: number
  kind: string
  selected: boolean
  dimmed: boolean
  onSelect: (event: ReactPointerEvent, id: string) => void
}) {
  const from = { x: props.a.x, y: twinY(props.a, props.storey, props.bandHeight) }
  const to = { x: props.b.x, y: twinY(props.b, props.storey, props.bandHeight) }
  const select = (event: ReactPointerEvent): void => props.onSelect(event, props.id)
  return (
    <g
      data-edge={props.id}
      data-kind={props.kind}
      data-storey={props.storey}
      className={props.dimmed ? 'link-group link-dimmed' : 'link-group'}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className="link-grip"
        onPointerDown={select}
      />
      {/* One space flowing into the next is a broad opening; a door is the single line. */}
      {props.kind === 'open' && (
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="link-flow" />
      )}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
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
function betweenRims(
  a: Position,
  b: Position,
  radii: readonly [number, number],
): readonly [Position, Position] {
  const between = Math.hypot(b.x - a.x, b.y - a.y)
  const unit = { x: (b.x - a.x) / (between || 1), y: (b.y - a.y) / (between || 1) }
  return [
    { x: a.x + unit.x * radii[0], y: a.y + unit.y * radii[0] },
    { x: b.x - unit.x * radii[1], y: b.y - unit.y * radii[1] },
  ]
}

export const Proposed = memo(function Proposed(props: {
  a: Body
  b: Body
  /** The storey the connection would be on, so it is offered between the twins that would hold it. */
  storey: number
  bandHeight: number
  proposal: BubbleProposal
  /** The rulebook row's words, shown on hover. */
  source: string
  onAccept: (event: ReactPointerEvent, proposal: BubbleProposal) => void
}) {
  const { a, b } = props
  const [from, to] = betweenRims(
    { x: a.x, y: twinY(a, props.storey, props.bandHeight) },
    { x: b.x, y: twinY(b, props.storey, props.bandHeight) },
    [a.radius, b.radius],
  )
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
