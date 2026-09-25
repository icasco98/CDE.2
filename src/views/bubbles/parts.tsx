import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import type { Spot } from '../../bubbles/arrange'
import { categoryLabels } from '../../rulebook'

/** The fill is bubbles.css's to choose, so a bubble and the legend that names it take one class. */
export function categoryClass(category: string | undefined): string {
  return category ? `category-${category}` : 'category-none'
}

/** A name broken at the space nearest its middle when it is longer than a cell holds on one line. */
function linesOf(name: string): readonly string[] {
  if (name.length <= 16) return [name]
  const middle = name.length / 2
  let best = -1
  for (let at = name.indexOf(' '); at >= 0; at = name.indexOf(' ', at + 1))
    if (best < 0 || Math.abs(at - middle) < Math.abs(best - middle)) best = at
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)]
}

type BubbleProps = {
  readonly spot: Spot
  readonly name: string
  readonly area: string
  readonly category?: string
  /** The storeys a stair reaches, said on every one of its bubbles so two circles read as one room. */
  readonly span?: string
  readonly selected: boolean
  readonly dimmed: boolean
  readonly onGrab: (event: ReactPointerEvent, spot: Spot) => void
  readonly onReach: (event: ReactPointerEvent, spot: Spot) => void
}

export const Bubble = memo(function Bubble(props: BubbleProps) {
  const { spot, name } = props
  const classes = ['bubble']
  if (props.selected) classes.push('bubble-selected')
  if (props.dimmed) classes.push('bubble-dimmed')
  const lines = linesOf(name)
  const reach = { x: spot.x + spot.r * Math.SQRT1_2, y: spot.y - spot.r * Math.SQRT1_2 }
  return (
    <g
      data-room={spot.id}
      data-name={name}
      data-storey={spot.storey}
      data-x={spot.x}
      data-y={spot.y}
      className={classes.join(' ')}
    >
      <circle
        cx={spot.x}
        cy={spot.y}
        r={spot.r}
        className={`bubble-shape ${categoryClass(props.category)}`}
        onPointerDown={(event) => props.onGrab(event, spot)}
      >
        <title>{`${name}, ${props.area}`}</title>
      </circle>
      <text x={spot.x} y={spot.y} className="bubble-area">
        {props.area}
      </text>
      {lines.map((line, index) => (
        <text key={index} x={spot.x} y={spot.y + spot.r + 14 + index * 15} className="bubble-name">
          {line}
        </text>
      ))}
      {props.span && (
        <text x={spot.x} y={spot.y + spot.r + 14 + lines.length * 15} className="bubble-span">
          {props.span}
        </text>
      )}
      <circle
        cx={reach.x}
        cy={reach.y}
        r={6}
        className="reach"
        data-reach={spot.id}
        onPointerDown={(event) => props.onReach(event, spot)}
      >
        <title>Drag to another room to connect them</title>
      </circle>
    </g>
  )
})

/** Where a line between two circles leaves the first one's rim. */
function rimToRim(from: Spot, to: Spot): readonly [number, number, number, number] {
  const run = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const ux = (to.x - from.x) / run
  const uy = (to.y - from.y) / run
  return [from.x + ux * from.r, from.y + uy * from.r, to.x - ux * to.r, to.y - uy * to.r]
}

type LinkProps = {
  readonly id: string
  readonly from: Spot
  readonly to: Spot
  readonly kind: string
  readonly storey: number
  readonly selected: boolean
  readonly dimmed: boolean
  readonly title: string
  readonly onSelect: (event: ReactPointerEvent, id: string) => void
}

/** Half the gap between the two lines of an opening, in the diagram's units. */
const OPEN_HALF = 3

export const Link = memo(function Link(props: LinkProps) {
  const [x1, y1, x2, y2] = rimToRim(props.from, props.to)
  const run = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = (-(y2 - y1) / run) * OPEN_HALF
  const ny = ((x2 - x1) / run) * OPEN_HALF
  const select = (event: ReactPointerEvent): void => props.onSelect(event, props.id)
  const stroke = props.selected ? 'link link-selected' : 'link'
  const classes = ['link-group', `link-${props.kind}`]
  if (props.dimmed) classes.push('link-dimmed')
  return (
    <g
      data-edge={props.id}
      data-kind={props.kind}
      data-storey={props.storey}
      className={classes.join(' ')}
    >
      <title>{props.title}</title>
      {/* A line is too thin to aim at, so a wide invisible twin takes the click. */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="link-grip" onPointerDown={select} />
      {props.kind === 'open' ? (
        <>
          <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} className={stroke} />
          <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} className={stroke} />
        </>
      ) : (
        <line x1={x1} y1={y1} x2={x2} y2={y2} className={stroke} />
      )}
    </g>
  )
})

type ApartProps = {
  readonly id: string
  readonly from: Spot
  readonly to: Spot
  readonly selected: boolean
  readonly dimmed: boolean
  readonly title: string
  readonly onSelect: (event: ReactPointerEvent, id: string) => void
}

/** Half the reach of the cross on a keep-apart line, in the diagram's units. */
const CROSS = 5

/** Two rooms kept apart: a red dashed line with a cross at its middle, unlike any edge. */
export const Apart = memo(function Apart(props: ApartProps) {
  const [x1, y1, x2, y2] = rimToRim(props.from, props.to)
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const select = (event: ReactPointerEvent): void => props.onSelect(event, props.id)
  const classes = ['apart-group']
  if (props.selected) classes.push('apart-selected')
  if (props.dimmed) classes.push('link-dimmed')
  return (
    <g data-apart={props.id} className={classes.join(' ')}>
      <title>{props.title}</title>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="link-grip" onPointerDown={select} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="apart" />
      <path
        d={`M${mx - CROSS} ${my - CROSS}L${mx + CROSS} ${my + CROSS}M${mx + CROSS} ${my - CROSS}L${mx - CROSS} ${my + CROSS}`}
        className="apart-cross"
        onPointerDown={select}
      />
    </g>
  )
})

/** The street under a column: where a door to the outside is drawn to and dragged to. */
export function Outside(props: { readonly spot: Spot; readonly dimmed: boolean }) {
  const { spot } = props
  return (
    <g
      data-room="EXTERIOR"
      data-storey={spot.storey}
      className={props.dimmed ? 'outside bubble-dimmed' : 'outside'}
    >
      <rect x={spot.x - 44} y={spot.y - spot.r} width={88} height={spot.r * 2} rx={6} />
      <text x={spot.x} y={spot.y}>
        Outside
      </text>
    </g>
  )
}

const legendRows = [
  ...Object.entries(categoryLabels).map(([category, label]) => ({
    key: categoryClass(category),
    label,
    mark: <circle cx={12} cy={6} r={5} className={`legend-swatch ${categoryClass(category)}`} />,
  })),
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
    mark: <line x1={2} y1={6} x2={22} y2={6} className="link link-main" />,
  },
  {
    key: 'apart',
    label: 'Keep apart',
    mark: (
      <>
        <line x1={2} y1={6} x2={22} y2={6} className="apart" />
        <path d="M9 2L15 10M15 2L9 10" className="apart-cross" />
      </>
    ),
  },
]

/** Beside the diagram, never over it: a legend that covers a bubble is a legend in the way. */
export function Legend() {
  return (
    <section className="bubbles-panel legend">
      <h2>Legend</h2>
      <ul>
        {legendRows.map((row) => (
          <li key={row.key}>
            <svg viewBox="0 0 24 12" width={24} height={12} aria-hidden="true">
              {row.mark}
            </svg>
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
