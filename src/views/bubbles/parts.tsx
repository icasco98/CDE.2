import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { categoryLabels } from '../../rulebook'
import type { Position } from '../../bubbles'
import type { Body } from '../../bubbles'
import { categoryClass, LINE, type BubbleLabel } from './frame'
import type { BubbleRoom } from './types'

/*
 * What must hold its size on the screen does so as the plan sheet does it: every stroke is in
 * pixels through `vector-effect: non-scaling-stroke`, and text takes a font size from the sheet's
 * `--per-px`, the metres one pixel covers, so a zoom changes one style and no bubble is drawn
 * again. A bubble's own marks, the pin and the ring, stay in metres because they belong to the
 * circle and grow with it.
 */

/** How far apart the two lines of an opening run, in metres: a door is one line, an opening two. */
const OPEN_M = 0.5

/** The square that marks the front door where it meets the street, in metres. */
const DOOR_MARK_M = 0.8

/** The two marks sit opposite each other on the rim: what holds the room on the left, what links it on the right. */
function onRim(at: Position, radius: number, toTheLeft: boolean): Position {
  const away = radius * Math.SQRT1_2
  return { x: at.x + (toTheLeft ? -away : away), y: at.y - away }
}

export type BubbleHandlers = {
  readonly onGrab: (event: ReactPointerEvent, body: Body) => void
  readonly onReach: (event: ReactPointerEvent, body: Body) => void
}

type BubbleProps = {
  readonly body: Body
  readonly room: BubbleRoom
  /** The storey this twin is drawn on; a stair is drawn once on every storey it reaches. */
  readonly twin: number
  readonly selected: boolean
  /**
   * On a storey that is not the one being worked on: drawn faint and out of the pointer's reach.
   */
  readonly dimmed: boolean
  /**
   * What the bubble says and how large, measured against the circle by the view rather than
   * guessed from the zoom. The same label object is handed back while the scale holds, so a pan
   * redraws no bubble at all.
   */
  readonly label: BubbleLabel
  /** What else is worth saying about where this bubble stands, for the hand that rests on it. */
  readonly note?: string
  readonly handlers: BubbleHandlers
}

/** Every bubble says where it stands and how wide it is, whatever shape it is drawn as. */
function standsAt(body: Body) {
  return {
    'data-bubble': body.id,
    'data-x': body.x,
    'data-y': body.y,
    'data-radius': body.radius,
  }
}

/** Memoised on the body, the twin and the label, so a pan draws no bubble again. */
/** What the hand resting on a bubble is told: its name and its size, and where it stands when
 * where it stands is not its own to choose. */
function titleOf(
  room: { readonly name: string; readonly targetArea: number },
  note?: string,
): string {
  const said = `${room.name}, ${Math.round(room.targetArea)} m²`
  return note ? `${said}, ${note}` : said
}

export const Bubble = memo(function Bubble(props: BubbleProps) {
  const { body, room, twin, label, note, handlers } = props
  const corridor = body.half > 0
  const at = { x: body.x, y: body.y }
  // A corridor's two marks sit at its far end rather than on a rim it does not have.
  const along = { x: Math.cos(body.angle) * body.half, y: Math.sin(body.angle) * body.half }
  const rim = corridor ? { x: at.x + along.x, y: at.y + along.y } : onRim(at, body.radius, false)
  const held = corridor ? { x: at.x - along.x, y: at.y - along.y } : onRim(at, body.radius, true)
  const turn = (body.angle * 180) / Math.PI
  // A label runs along the corridor and stays the right way up, so a corridor pointing back down
  // the plot is read without turning the head.
  const upright = Math.abs(((turn + 180) % 360) - 180) > 90 ? turn + 180 : turn
  // A name that will not go inside its own rim on one line or two is dropped for the room's
  // initials, and told in full on hover and while the room is selected: two labels never lie
  // across each other.
  const rows = label.rows
  const classes = ['bubble']
  if (props.selected) classes.push('bubble-selected')
  if (props.dimmed) classes.push('bubble-dimmed')
  if (label.short) classes.push('bubble-short')
  return (
    <g
      data-room={body.id}
      data-name={room.name}
      data-twin={twin}
      className={classes.join(' ')}
      style={{ '--label-m': String(label.size) } as CSSProperties}
    >
      {corridor ? (
        <rect
          {...standsAt(body)}
          data-half={body.half}
          data-angle={body.angle}
          x={at.x - body.half - body.radius}
          y={at.y - body.radius}
          width={2 * (body.half + body.radius)}
          height={2 * body.radius}
          rx={body.radius}
          transform={`rotate(${turn} ${at.x} ${at.y})`}
          className={`bubble-shape ${categoryClass(room.category)}`}
          onPointerDown={(event) => handlers.onGrab(event, body)}
        >
          <title>{titleOf(room, note)}</title>
        </rect>
      ) : (
        <circle
          {...standsAt(body)}
          cx={at.x}
          cy={at.y}
          r={body.radius}
          className={`bubble-shape ${categoryClass(room.category)}`}
          onPointerDown={(event) => handlers.onGrab(event, body)}
        >
          <title>{titleOf(room, note)}</title>
        </circle>
      )}
      {/* The stack sits about the middle of the shape, a line of its own cap height apart, so
          the name reads at the widest part of the bubble whatever else is said under it. */}
      <g transform={corridor ? `rotate(${upright} ${at.x} ${at.y})` : undefined}>
        {rows.map((row, index) => (
          <text
            key={row.kind + index}
            x={at.x}
            y={at.y + (index - (rows.length - 1) / 2) * label.size * LINE}
            className={`bubble-${row.kind}`}
          >
            {row.text}
          </text>
        ))}
      </g>
      {label.short && (
        <text x={at.x} y={at.y - body.radius} dy="-0.5em" className="bubble-full">
          {room.name}
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
        onPointerDown={(event) => handlers.onReach(event, body)}
      >
        <title>Drag to another room to connect them</title>
      </circle>
    </g>
  )
})

type LinkProps = {
  readonly id: string
  readonly from: Position
  readonly to: Position
  readonly kind: string
  readonly storey: number
  readonly selected: boolean
  readonly dimmed: boolean
  /** Why the rulebook wanted this connection, where it came from the default table. */
  readonly title?: string
  /** Whether the far end is the outside: the front door's square is drawn there. */
  readonly outside: boolean
  /** Why the link has not closed, where it has not; a closed link says nothing. */
  readonly tension?: string | null
  readonly onSelect: (event: ReactPointerEvent, id: string) => void
}

/** The line that stands off a link's own by half an opening, so an open link reads as two lines. */
function beside(from: Position, to: Position, offset: number): readonly [Position, Position] {
  const run = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const nx = (-(to.y - from.y) / run) * offset
  const ny = ((to.x - from.x) / run) * offset
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
  ]
}

/** Memoised like the bubbles, so a camera that changes nothing about the graph redraws no link. */
export const Link = memo(function Link(props: LinkProps) {
  const { from, to } = props
  const select = (event: ReactPointerEvent): void => props.onSelect(event, props.id)
  // One space flowing into the next is an opening, drawn as the two edges of it; a door is the
  // single line between them.
  const open = props.kind === 'open'
  const [leftFrom, leftTo] = beside(from, to, open ? -OPEN_M / 2 : 0)
  const [rightFrom, rightTo] = beside(from, to, open ? OPEN_M / 2 : 0)
  return (
    <g
      data-edge={props.id}
      data-kind={props.kind}
      data-storey={props.storey}
      data-tension={props.tension ? '' : undefined}
      className={['link-group', props.dimmed ? 'link-dimmed' : '', props.tension ? 'link-open' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {/* A link that has not closed says what is in the way; one that has says why it was wanted. */}
      {props.tension ? (
        <title>{props.tension}</title>
      ) : props.title ? (
        <title>{props.title}</title>
      ) : null}
      {/* The grip takes the middle third of the run, because a linked pair now stands rim to rim
          and a grip the whole length of it would lie across both bubbles' own middles. */}
      <line
        x1={from.x + (to.x - from.x) / 3}
        y1={from.y + (to.y - from.y) / 3}
        x2={to.x - (to.x - from.x) / 3}
        y2={to.y - (to.y - from.y) / 3}
        className="link-grip"
        onPointerDown={select}
      />
      <line
        x1={leftFrom.x}
        y1={leftFrom.y}
        x2={leftTo.x}
        y2={leftTo.y}
        className={props.selected ? 'link link-selected' : 'link'}
        onPointerDown={select}
      />
      {open && (
        <line
          x1={rightFrom.x}
          y1={rightFrom.y}
          x2={rightTo.x}
          y2={rightTo.y}
          className={props.selected ? 'link link-selected' : 'link'}
          onPointerDown={select}
        />
      )}
      {/* The front door is the one door onto the street, so it is marked where it meets it. */}
      {props.kind === 'main-door' && props.outside && (
        <rect
          x={to.x - DOOR_MARK_M / 2}
          y={to.y - DOOR_MARK_M / 2}
          width={DOOR_MARK_M}
          height={DOOR_MARK_M}
          className="main-door-mark"
        />
      )}
    </g>
  )
})

type LegendRow = { readonly key: string; readonly label: string; readonly mark: ReactNode }

/** Everything the sheet draws and nothing it does not: the fills, the pin, the three kinds of link. */
const legendRows: readonly LegendRow[] = [
  ...Object.entries(categoryLabels).map(([category, label]) => ({
    key: categoryClass(category),
    label,
    mark: <circle cx={12} cy={6} r={5} className={`legend-swatch ${categoryClass(category)}`} />,
  })),
  {
    key: 'pinned',
    label: 'Held in place',
    mark: <circle cx={12} cy={6} r={4} className="pin-mark" />,
  },
  { key: 'door', label: 'Door', mark: <line x1={2} y1={6} x2={22} y2={6} className="link" /> },
  {
    key: 'open',
    label: 'Open',
    mark: (
      <>
        <line x1={2} y1={3} x2={22} y2={3} className="link" />
        <line x1={2} y1={9} x2={22} y2={9} className="link" />
      </>
    ),
  },
  {
    key: 'main-door',
    label: 'Front door',
    mark: (
      <>
        <line x1={2} y1={6} x2={18} y2={6} className="link" />
        <rect x={17} y={2} width={7} height={7} className="main-door-mark" />
      </>
    ),
  },
  {
    key: 'buildable',
    label: 'Buildable line',
    mark: <line x1={2} y1={6} x2={22} y2={6} className="legend-buildable" />,
  },
]

/** Beside the sheet, never over it: a legend that covers a bubble is a legend in the way. */
export function Legend() {
  return (
    <section className="legend">
      <h2>Legend</h2>
      <ul>
        {legendRows.map((row) => (
          <li key={row.key}>
            <svg viewBox="0 0 24 12" width={24} height={12} aria-hidden="true">
              {row.mark}
            </svg>
            <span className="legend-label">{row.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
