import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Arrangement, Spot } from '../../bubbles/arrange'
import { EXTERIOR, type Bubble as Nudge, type Commit } from '../../model'
import { storeyLabel } from '../../rulebook'
import { Apart, Bubble, Link, Outside } from './parts'
import type { BubbleApart, BubbleLink, BubbleRoom, DragMakes } from './types'

/** How far the hand may wander before a press on a bubble is a nudge rather than a click, in pixels. */
const DRAG_PX = 3

/** Said when a drag ends on a room of another storey; only a stair joins two storeys. */
const ONE_STOREY =
  'An edge joins two rooms on one storey; a stair is the way from one storey to the next.'

type Point = { readonly x: number; readonly y: number }

type Gesture =
  | {
      readonly kind: 'nudge'
      readonly id: string
      readonly from: Point
      readonly start: Nudge
      readonly moved: boolean
    }
  | { readonly kind: 'link'; readonly from: Spot; readonly at: Point }

type DiagramProps = {
  readonly arrangement: Arrangement
  readonly rooms: ReadonlyMap<string, BubbleRoom>
  readonly edges: readonly BubbleLink[]
  readonly apart: readonly BubbleApart[]
  /** What a drag from a room's ring makes when it lands on another room. */
  readonly makes: DragMakes
  readonly selected: string | null
  /** The storey brought forward; the others fade and stay. */
  readonly focus: number | null
  readonly titleOf: (edge: BubbleLink) => string
  readonly onFocus: (storey: number) => void
  readonly onNudge: (id: string, nudge: Nudge, commit: Commit) => void
  readonly onConnect: (a: string, b: string) => void
  readonly onKeepApart: (a: string, b: string) => void
  readonly onSelect: (id: string | null) => void
  readonly onRefuse: (message: string) => void
  /** Screen pixels per unit of the diagram, told whenever the drawing's size on screen changes. */
  readonly onPixels: (pixels: number) => void
}

function pointerAt(svg: SVGSVGElement | null, clientX: number, clientY: number): Point {
  const screen = svg?.getScreenCTM()
  if (!screen) return { x: 0, y: 0 }
  const at = new DOMPoint(clientX, clientY).matrixTransform(screen.inverse())
  return { x: at.x, y: at.y }
}

/** The spot under the pointer, the outside included, on any column. */
function spotAt(arrangement: Arrangement, at: Point): Spot | undefined {
  const within = (spot: Spot) => Math.hypot(spot.x - at.x, spot.y - at.y) <= spot.r + 4
  return arrangement.spots.find(within) ?? arrangement.outside.find(within)
}

export function Diagram(props: DiagramProps) {
  const { arrangement, rooms, edges, selected, focus } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const begin = (next: Gesture | null): void => {
    gestureRef.current = next
    setGesture(next)
  }

  const where = (spot: { id: string; storey: number }): Spot | undefined =>
    spot.id === EXTERIOR
      ? arrangement.outside.find((each) => each.storey === spot.storey)
      : arrangement.spots.find((each) => each.id === spot.id && each.storey === spot.storey)

  function grab(event: ReactPointerEvent, spot: Spot): void {
    if (event.button !== 0) return
    event.stopPropagation()
    const room = rooms.get(spot.id)
    begin({
      kind: 'nudge',
      id: spot.id,
      from: pointerAt(svgRef.current, event.clientX, event.clientY),
      start: room?.bubble ?? { x: 0, y: 0 },
      moved: false,
    })
  }

  function reach(event: ReactPointerEvent, spot: Spot): void {
    if (event.button !== 0) return
    event.stopPropagation()
    begin({ kind: 'link', from: spot, at: pointerAt(svgRef.current, event.clientX, event.clientY) })
  }

  function move(event: PointerEvent): void {
    const held = gestureRef.current
    if (!held) return
    const at = pointerAt(svgRef.current, event.clientX, event.clientY)
    if (held.kind === 'link') {
      begin({ ...held, at })
      return
    }
    const screen = svgRef.current?.getScreenCTM()
    const scale = screen ? Math.hypot(screen.a, screen.b) : 1
    const dx = at.x - held.from.x
    const dy = at.y - held.from.y
    if (!held.moved && Math.hypot(dx, dy) * scale <= DRAG_PX) return
    if (!held.moved) begin({ ...held, moved: true })
    props.onNudge(held.id, { x: held.start.x + dx, y: held.start.y + dy }, 'preview')
  }

  function release(event: PointerEvent): void {
    const held = gestureRef.current
    if (!held) return
    begin(null)
    const at = pointerAt(svgRef.current, event.clientX, event.clientY)
    if (held.kind === 'nudge') {
      if (held.moved)
        props.onNudge(
          held.id,
          { x: held.start.x + at.x - held.from.x, y: held.start.y + at.y - held.from.y },
          'commit',
        )
      else props.onSelect(held.id)
      return
    }
    const target = spotAt(arrangement, at)
    if (!target || target.id === held.from.id) return
    // Keep apart is about two rooms, not a wall between them, so storeys do not matter to it.
    if (props.makes === 'apart') {
      if (target.id !== EXTERIOR && held.from.id !== EXTERIOR)
        props.onKeepApart(held.from.id, target.id)
      return
    }
    if (target.storey !== held.from.storey) {
      props.onRefuse(ONE_STOREY)
      return
    }
    props.onConnect(held.from.id, target.id)
  }

  const live = useRef({ move, release })
  live.current = { move, release }

  /** Listening from the start rather than from the press, so the first pixels of a drag land. */
  useEffect(() => {
    const onMove = (event: PointerEvent): void => live.current.move(event)
    const onUp = (event: PointerEvent): void => live.current.release(event)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const onPixels = props.onPixels
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const tell = (): void => {
      const screen = svg.getScreenCTM()
      if (screen) onPixels(Math.hypot(screen.a, screen.b))
    }
    tell()
    const observer = new ResizeObserver(tell)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [onPixels, arrangement.width, arrangement.height])

  /** A room drawn in two columns is one room, so its two circles are tied by a line of their own. */
  const through = useMemo(() => {
    const pairs: [Spot, Spot][] = []
    const seen = new Map<string, Spot>()
    for (const spot of arrangement.spots) {
      const before = seen.get(spot.id)
      if (before) pairs.push([before, spot])
      seen.set(spot.id, spot)
    }
    return pairs
  }, [arrangement.spots])

  /** Where a keep-apart line runs: between the pair's circles on a storey they share, else their first. */
  const ends = (pair: BubbleApart): [Spot, Spot] | null => {
    const of = (id: string) => arrangement.spots.filter((spot) => spot.id === id)
    const ones = of(pair.a)
    const others = of(pair.b)
    for (const one of ones) {
      const other = others.find((each) => each.storey === one.storey)
      if (other) return [one, other]
    }
    return ones[0] && others[0] ? [ones[0], others[0]] : null
  }

  /** The room whose connections stand out and the rest fade: the one drawn from, under the hand, or selected. */
  const focused =
    gesture?.kind === 'link'
      ? gesture.from.id
      : (hovered ?? (selected !== null && rooms.has(selected) ? selected : null))
  const near = useMemo(() => {
    if (focused === null) return null
    const ids = new Set([focused])
    for (const edge of edges)
      if (edge.a === focused || edge.b === focused) ids.add(edge.a === focused ? edge.b : edge.a)
    for (const pair of props.apart)
      if (pair.a === focused || pair.b === focused) ids.add(pair.a === focused ? pair.b : pair.a)
    return ids
  }, [focused, edges, props.apart])
  const touches = (a: string, b: string): boolean => a === focused || b === focused

  const dimmed = (storey: number): boolean => focus !== null && storey !== focus
  const choose = (event: ReactPointerEvent, id: string): void => {
    event.stopPropagation()
    props.onSelect(id)
  }

  return (
    <svg
      ref={svgRef}
      className={[
        'bubbles-sheet',
        ...(gesture?.kind === 'link'
          ? ['bubbles-linking', ...(props.makes === 'apart' ? ['bubbles-parting'] : [])]
          : []),
        ...(near ? ['bubbles-focusing'] : []),
      ].join(' ')}
      viewBox={`0 0 ${arrangement.width} ${arrangement.height}`}
      preserveAspectRatio="xMidYMin meet"
      tabIndex={0}
      role="application"
      aria-label="Bubble diagram"
      onPointerDown={() => props.onSelect(null)}
    >
      {arrangement.columns.map((column) => (
        <g
          key={column.storey}
          className={dimmed(column.storey) ? 'column column-dimmed' : 'column'}
        >
          <rect
            x={column.x - 20}
            y={20}
            width={column.width + 40}
            height={arrangement.height - 30}
            rx={10}
            className="column-ground"
          />
          <g
            role="button"
            aria-label={storeyLabel(column.storey)}
            aria-pressed={focus === column.storey}
            className="column-head"
            onPointerDown={(event) => {
              event.stopPropagation()
              props.onFocus(column.storey)
            }}
          >
            <text x={column.x + column.width / 2} y={44}>
              {storeyLabel(column.storey)}
            </text>
          </g>
        </g>
      ))}
      {arrangement.bands.map((band) => (
        <g key={band.tier} className="band">
          <line x1={10} x2={arrangement.width - 10} y1={band.y} y2={band.y} />
          <text
            x={16}
            y={band.y + band.height / 2}
            transform={`rotate(-90 16 ${band.y + band.height / 2})`}
          >
            {band.tier}
          </text>
        </g>
      ))}
      {edges.map((edge) => {
        const from = where({ id: edge.a, storey: edge.storey })
        const to = where({ id: edge.b, storey: edge.storey })
        if (!from || !to) return null
        return (
          <Link
            key={edge.id}
            id={edge.id}
            from={from}
            to={to}
            kind={edge.kind}
            storey={edge.storey}
            selected={edge.id === selected}
            dimmed={dimmed(edge.storey)}
            near={touches(edge.a, edge.b)}
            title={props.titleOf(edge)}
            onSelect={choose}
          />
        )
      })}
      {props.apart.map((pair) => {
        const both = ends(pair)
        if (!both) return null
        return (
          <Apart
            key={pair.id}
            id={pair.id}
            from={both[0]}
            to={both[1]}
            selected={pair.id === selected}
            dimmed={dimmed(both[0].storey) && dimmed(both[1].storey)}
            near={touches(pair.a, pair.b)}
            title={`Keep apart: ${rooms.get(pair.a)?.name ?? ''} and ${rooms.get(pair.b)?.name ?? ''}`}
            onSelect={choose}
          />
        )
      })}
      {through.map(([from, to]) => (
        <line
          key={`${from.id}@${from.storey}`}
          data-through={from.id}
          x1={from.x + from.r}
          y1={from.y}
          x2={to.x - to.r}
          y2={to.y}
          className={from.id === focused ? 'through through-near' : 'through'}
        >
          <title>{`${rooms.get(from.id)?.name ?? ''}: one room on both storeys`}</title>
        </line>
      ))}
      {arrangement.outside.map((spot) => (
        <Outside
          key={spot.storey}
          spot={spot}
          dimmed={dimmed(spot.storey)}
          near={near?.has(EXTERIOR) ?? false}
        />
      ))}
      {arrangement.spots.map((spot) => {
        const room = rooms.get(spot.id)
        if (!room) return null
        const span = Math.max(1, Math.trunc(room.storeysSpanned))
        return (
          <Bubble
            key={`${spot.id}@${spot.storey}`}
            spot={spot}
            name={room.name}
            area={`${Math.round(room.targetArea)} m²`}
            {...(room.category === undefined ? {} : { category: room.category })}
            {...(span > 1
              ? { span: `${storeyLabel(room.storey)} to ${storeyLabel(room.storey + span - 1)}` }
              : {})}
            selected={spot.id === selected}
            dimmed={dimmed(spot.storey)}
            near={near?.has(spot.id) ?? false}
            onHover={setHovered}
            onGrab={grab}
            onReach={reach}
          />
        )
      })}
      {gesture?.kind === 'link' && (
        <line
          x1={gesture.from.x}
          y1={gesture.from.y}
          x2={gesture.at.x}
          y2={gesture.at.y}
          className="link-drawn"
        />
      )}
    </svg>
  )
}
