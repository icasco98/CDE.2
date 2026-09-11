import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  capacityMessage,
  createState,
  storeyCapacity,
  storeyLabel,
  type Body,
  type Position,
} from '../../bubbles'
import type { Point } from '../../geometry'
import type { EdgeKind } from '../../model'
import {
  fitCamera,
  metresPerPixel,
  panTo,
  viewBoxOf,
  visibleExtent,
  zoomAbout,
  ZOOM_STEP,
  type Camera,
} from '../camera'
import { bandDrop, insideBands } from './bands'
import { asPoint, bodyAt, extentOf, pointerAt } from './frame'
import { Bands, Bubble, Legend, LEGEND_PX, Link, Proposed } from './parts'
import { useSettling } from './useSettling'
import type { BubbleProposal, BubblesViewProps } from './types'
import './bubbles.css'

/** How far the hand may wander before a press on the sheet is a pan rather than a click, in pixels. */
const DRAG_PX = 3

/** Two fingers on the sheet: the metre under their middle, how far apart they began, and the scale they began at. */
type Pinch = { readonly grabbed: Point; readonly span: number; readonly scale: number }

type Gesture =
  | { readonly kind: 'move'; readonly id: string; readonly grabbed: Position }
  | { readonly kind: 'link'; readonly from: string; readonly at: Position }
  /** The sheet slid under the hand: the metre grabbed and where on the screen the hand started. */
  | { readonly kind: 'pan'; readonly grabbed: Point; readonly from: Point }
  | (Pinch & { readonly kind: 'pinch' })
  | null

/** Link mode, holding the first room of the pair once it has been clicked. */
type Linking = { readonly from: string | null } | null

/** A wheel notch, whether the wheel counts in pixels or in lines; a trackpad pinch counts in pixels. */
function notchesOf(event: WheelEvent): number {
  return event.deltaMode === 0 ? event.deltaY / 100 : event.deltaY / 3
}

export function BubblesView(props: BubblesViewProps) {
  const { rooms, edges, proposals, storeys, plot, selected } = props
  const { onMoveBubble, onDropBubble, onPin, onConnect, onDisconnect, onSetEdgeKind } = props
  const { onRemoveRoom, onAccept, onAcceptAll, onSelect, onRefuse } = props
  const svgRef = useRef<SVGSVGElement>(null)
  /** Whether the hand has moved at all, so a press that stays put is a click and not a pan or a drag. */
  const movedRef = useRef(false)
  /** Every pointer down on the sheet, so a second finger becomes a pinch instead of a second grab. */
  const touchesRef = useRef(new Map<number, Point>())
  const [gesture, setGesture] = useState<Gesture>(null)
  /**
   * The gesture as the hand has it, not as the last render had it: a pointer moves before React
   * renders the press that started it, and a drag must not lose those first millimetres.
   */
  const gestureRef = useRef<Gesture>(null)
  const [linking, setLinking] = useState<Linking>(null)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const [box, setBox] = useState({ width: 0, height: 0 })
  /** The storey being worked on, or nothing for all of them: the others are dimmed, never hidden. */
  const [only, setOnly] = useState<number | null>(null)
  const { settling, start, stop, interrupt } = useSettling(rooms, edges, storeys, onMoveBubble)

  const state = useMemo(() => createState(rooms, edges, storeys), [rooms, edges, storeys])
  const bodies = state.bodies
  const named = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const placed = useMemo(() => new Map(bodies.map((body) => [body.id, body])), [bodies])
  const aspect = box.height > 0 ? box.width / box.height : 0
  const extent = extentOf(bodies, state.storeys, state.bandHeight, aspect)
  const shown = visibleExtent(extent, camera)
  const perPixel = metresPerPixel(extent, camera, box)
  const crowded = storeyCapacity(rooms, plot.polygon, storeys).filter((entry) => entry.over)
  const selectedRoom = named.get(selected ?? '')
  const selectedEdge = edges.find((edge) => edge.id === selected)

  /** A stair stands on several storeys, and stays lit while the filter shows any one of them. */
  const dimmedRoom = (id: string): boolean => {
    const room = named.get(id)
    if (only === null || !room) return false
    const span = Math.max(1, Math.trunc(room.storeysSpanned))
    return only < room.storey || only >= room.storey + span
  }

  const at = useCallback((event: { clientX: number; clientY: number }): Position => {
    const svg = svgRef.current
    return svg ? pointerAt(svg, event.clientX, event.clientY) : { x: 0, y: 0 }
  }, [])

  const focus = (): void => svgRef.current?.focus({ preventScroll: true })

  function begin(next: Gesture): void {
    gestureRef.current = next
    setGesture(next)
  }

  /** A click in link mode takes the first room, then the second, and stays on for the next pair. */
  function pick(id: string): void {
    if (!linking) return
    if (linking.from === null || linking.from === id) {
      setLinking({ from: id })
      return
    }
    onConnect(linking.from, id)
    setLinking({ from: null })
  }

  function grab(event: ReactPointerEvent, body: Body): void {
    event.stopPropagation()
    interrupt()
    focus()
    if (linking) {
      pick(body.id)
      return
    }
    onSelect(body.id)
    if (!body.pinned) onPin(body.id, true)
    const pointer = at(event)
    movedRef.current = false
    begin({
      kind: 'move',
      id: body.id,
      grabbed: { x: body.x - pointer.x, y: body.y - pointer.y },
    })
  }

  function reach(event: ReactPointerEvent, body: Body): void {
    event.stopPropagation()
    interrupt()
    focus()
    begin({ kind: 'link', from: body.id, at: at(event) })
  }

  /** Two fingers zoom about the metre their middle began on and carry it along with them. */
  function pinchTo(pinch: Pinch): void {
    const svg = svgRef.current
    const [first, second] = [...touchesRef.current.values()]
    if (!svg || !first || !second) return
    const span = Math.hypot(first[0] - second[0], first[1] - second[1])
    if (span <= 0) return
    const middle = asPoint(pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2))
    const factor = (pinch.scale * span) / (pinch.span * camera.scale)
    setCamera(panTo(extent, zoomAbout(extent, camera, middle, factor), pinch.grabbed, middle))
  }

  function movePointer(event: PointerEvent): void {
    if (touchesRef.current.has(event.pointerId))
      touchesRef.current.set(event.pointerId, [event.clientX, event.clientY])
    const gesture = gestureRef.current
    if (!gesture) return
    if (gesture.kind === 'pinch') {
      pinchTo(gesture)
      return
    }
    if (gesture.kind === 'pan') {
      const wandered = Math.hypot(event.clientX - gesture.from[0], event.clientY - gesture.from[1])
      if (wandered > DRAG_PX) movedRef.current = true
      if (!movedRef.current) return
      setCamera(panTo(extent, camera, gesture.grabbed, asPoint(at(event))))
      return
    }
    const pointer = at(event)
    if (gesture.kind === 'move') {
      movedRef.current = true
      onMoveBubble(
        gesture.id,
        { x: pointer.x + gesture.grabbed.x, y: pointer.y + gesture.grabbed.y },
        'preview',
      )
      return
    }
    begin({ ...gesture, at: pointer })
  }

  /** Where a dragged bubble comes to rest, and the storey of the band it was let go in. */
  function land(id: string, rest: Position): void {
    const room = named.get(id)
    if (!room) return
    const drop = bandDrop(rest, room, state.storeys, state.bandHeight)
    if (drop.refused === 'stair')
      onRefuse(`${room.name} spans storeys, so it is not moved between them by hand.`)
    const settled = { x: rest.x, y: drop.y }
    if (drop.storey === room.storey) {
      onDropBubble(id, settled)
      return
    }
    if (onDropBubble(id, settled, drop.storey)) return
    // The model would not have the storey, so the bubble goes back inside the band it still belongs to.
    onDropBubble(id, { x: rest.x, y: insideBands(rest, room, state.storeys, state.bandHeight) })
  }

  function releasePointer(event: PointerEvent): void {
    touchesRef.current.clear()
    const gesture = gestureRef.current
    if (!gesture) return
    begin(null)
    if (gesture.kind === 'pinch') return
    if (gesture.kind === 'pan') {
      // A press that never moved is the click that lets the selection go, and leaves link mode.
      if (!movedRef.current) {
        onSelect(null)
        setLinking(null)
      }
      return
    }
    const pointer = at(event)
    if (gesture.kind === 'move') {
      if (movedRef.current)
        land(gesture.id, { x: pointer.x + gesture.grabbed.x, y: pointer.y + gesture.grabbed.y })
      return
    }
    const target = bodyAt(bodies, pointer, gesture.from)
    if (target && !dimmedRoom(target.id)) onConnect(gesture.from, target.id)
  }

  /** The sheet takes the wheel whole, so the page never scrolls under it; a trackpad pinch arrives here with `ctrlKey` and zooms the same way. */
  function wheelZoom(event: WheelEvent): void {
    event.preventDefault()
    setCamera(zoomAbout(extent, camera, asPoint(at(event)), Math.pow(ZOOM_STEP, -notchesOf(event))))
  }

  const live = useRef({ move: movePointer, release: releasePointer, wheel: wheelZoom, grab, reach })
  live.current = { move: movePointer, release: releasePointer, wheel: wheelZoom, grab, reach }

  /** Held steady through the ref, so a bubble's own group keeps its props and is not drawn again. */
  const handlers = useMemo(
    () => ({
      onGrab: (event: ReactPointerEvent, body: Body) => live.current.grab(event, body),
      onReach: (event: ReactPointerEvent, body: Body) => live.current.reach(event, body),
    }),
    [],
  )

  /** Listening from the start rather than from the press, so the first millimetres of a drag land. */
  useEffect(() => {
    const move = (event: PointerEvent): void => live.current.move(event)
    const up = (event: PointerEvent): void => live.current.release(event)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  /** Taken by hand rather than through React, whose own wheel listener cannot refuse the page its scroll. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent): void => live.current.wheel(event)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [])

  /** Measured before the first paint, so the sheet is never drawn once at a shape it does not have. */
  useLayoutEffect(() => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect && rect.height > 0) setBox({ width: rect.width, height: rect.height })
  }, [])

  /** The sheet is measured rather than guessed, because a mark's size on the screen is a size in its box. */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const watch = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect
      if (rect && rect.height > 0) setBox({ width: rect.width, height: rect.height })
    })
    watch.observe(svg)
    return () => watch.disconnect()
  }, [])

  /** A storey more or fewer is another sheet, so it opens whole; a bubble moved about it does not. */
  useEffect(() => {
    setCamera(fitCamera)
  }, [storeys])

  /** The keys zoom about the middle of what is drawn, which is the one point no hand is on. */
  function zoomBy(factor: number): void {
    const middle: Point = [shown.minX + shown.width / 2, shown.minY + shown.height / 2]
    setCamera(zoomAbout(extent, camera, middle, factor))
  }

  function grabSheet(event: ReactPointerEvent): void {
    focus()
    if (event.button !== 0 && event.button !== 1) return
    // The middle button would otherwise start the browser's own scroll, which fights the pan.
    if (event.button === 1) event.preventDefault()
    movedRef.current = false
    begin({ kind: 'pan', grabbed: asPoint(at(event)), from: [event.clientX, event.clientY] })
  }

  function beginPinch(): void {
    const svg = svgRef.current
    const [first, second] = [...touchesRef.current.values()]
    if (!svg || !first || !second) return
    const span = Math.hypot(first[0] - second[0], first[1] - second[1])
    if (span <= 0) return
    movedRef.current = true
    begin({
      kind: 'pinch',
      grabbed: asPoint(pointerAt(svg, (first[0] + second[0]) / 2, (first[1] + second[1]) / 2)),
      span,
      scale: camera.scale,
    })
  }

  function removeSelected(): void {
    if (selectedEdge) onDisconnect(selectedEdge.id)
    else if (selectedRoom) onRemoveRoom(selectedRoom.id)
  }

  /** The outside is not a bubble, so a proposal touching it is offered in words instead of as a line. */
  const roomOf = (proposal: BubbleProposal): string =>
    named.has(proposal.a) ? proposal.a : proposal.b
  const drawable = proposals.filter((proposal) => placed.has(proposal.a) && placed.has(proposal.b))
  const spoken = proposals.filter((proposal) => !placed.has(proposal.a) || !placed.has(proposal.b))

  function accept(event: { stopPropagation: () => void }, proposal: BubbleProposal) {
    event.stopPropagation()
    interrupt()
    onAccept(proposal)
  }

  const otherKind: EdgeKind = selectedEdge?.kind === 'open' ? 'door' : 'open'
  const hint = linking
    ? linking.from === null
      ? 'Click one room, then the room to join it to. Escape leaves link mode.'
      : `Now click the room to join to ${named.get(linking.from)?.name ?? 'it'}.`
    : 'Drag a bubble to move it, or into another band to change its storey.'

  return (
    <div className="bubbles">
      <div className="bubbles-bar">
        <button type="button" onClick={settling === 'running' ? stop : start}>
          {settling === 'running' ? 'Stop' : 'Settle'}
        </button>
        {proposals.length > 0 && (
          <button type="button" onClick={onAcceptAll}>
            Accept all proposals
          </button>
        )}
        <button
          type="button"
          aria-pressed={linking !== null}
          onClick={() => {
            interrupt()
            setLinking(linking ? null : { from: null })
            focus()
          }}
        >
          Link
        </button>
        <button
          type="button"
          disabled={!selectedRoom}
          onClick={() => selectedRoom && onPin(selectedRoom.id, !selectedRoom.pinned)}
        >
          {selectedRoom?.pinned ? 'Let go' : 'Hold in place'}
        </button>
        <button type="button" disabled={!selectedRoom && !selectedEdge} onClick={removeSelected}>
          {selectedEdge ? 'Delete link' : selectedRoom ? 'Delete room' : 'Delete'}
        </button>
        {selectedEdge && (
          <span className="bubbles-kind">
            <span>Link: {selectedEdge.kind}</span>
            <button
              type="button"
              disabled={selectedEdge.kind === 'main-door'}
              onClick={() => onSetEdgeKind(selectedEdge.id, otherKind)}
            >
              {otherKind === 'open' ? 'Make it open' : 'Make it a door'}
            </button>
          </span>
        )}
        <div className="bubbles-storeys" role="group" aria-label="Storey shown">
          <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}>
            All
          </button>
          {Array.from({ length: Math.max(1, storeys) }, (_unused, storey) => (
            <button
              key={storey}
              type="button"
              aria-pressed={only === storey}
              onClick={() => setOnly(storey)}
            >
              {storeyLabel(storey)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setCamera(fitCamera)}>
          Fit
        </button>
        <p className="bubbles-status" role="status">
          {settling === 'running'
            ? 'Settling…'
            : settling === 'settled'
              ? 'Settled'
              : 'Not settled'}
        </p>
      </div>
      <p className="bubbles-hint">{hint}</p>
      {crowded.map((entry) => (
        <p className="bubbles-warning" key={entry.storey}>
          {capacityMessage(entry)}
        </p>
      ))}
      <svg
        ref={svgRef}
        className={linking ? 'bubbles-sheet bubbles-linking' : 'bubbles-sheet'}
        viewBox={viewBoxOf(extent, camera)}
        preserveAspectRatio="xMidYMid meet"
        style={{ '--per-px': String(perPixel) } as CSSProperties}
        tabIndex={0}
        role="application"
        aria-label="Bubble diagram"
        onPointerDownCapture={(event) => {
          touchesRef.current.set(event.pointerId, [event.clientX, event.clientY])
          if (touchesRef.current.size < 2) return
          // A second finger is a pinch, not a second grab, so it never reaches what it landed on.
          event.stopPropagation()
          beginPinch()
        }}
        onPointerDown={grabSheet}
        onKeyDown={(event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            if (!selectedRoom && !selectedEdge) return
            event.preventDefault()
            removeSelected()
            return
          }
          if (event.key === 'Escape') {
            setLinking(null)
            return
          }
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoomBy(ZOOM_STEP)
            return
          }
          if (event.key === '-' || event.key === '_') {
            event.preventDefault()
            zoomBy(1 / ZOOM_STEP)
            return
          }
          if (event.key === '0') {
            event.preventDefault()
            setCamera(fitCamera)
          }
        }}
      >
        <Bands
          storeys={state.storeys}
          bandHeight={state.bandHeight}
          shown={shown}
          perPixel={perPixel}
        />
        {edges.map((edge) => {
          const a = placed.get(edge.a)
          const b = placed.get(edge.b)
          if (!a || !b) return null
          return (
            <Link
              key={edge.id}
              id={edge.id}
              a={a}
              b={b}
              kind={edge.kind}
              selected={edge.id === selected}
              dimmed={only !== null && edge.storey !== only}
              onSelect={(event) => {
                event.stopPropagation()
                interrupt()
                focus()
                onSelect(edge.id)
              }}
            />
          )
        })}
        {gesture?.kind === 'link' &&
          (() => {
            const from = placed.get(gesture.from)
            return from ? (
              <line
                x1={from.x}
                y1={from.y}
                x2={gesture.at.x}
                y2={gesture.at.y}
                className="link link-drawn"
              />
            ) : null
          })()}
        {bodies.map((body) => {
          const room = named.get(body.id)
          return room ? (
            <Bubble
              key={body.id}
              body={body}
              room={room}
              selected={body.id === selected || linking?.from === body.id}
              dimmed={dimmedRoom(body.id)}
              handlers={handlers}
            />
          ) : null
        })}
        {drawable.map((proposal) => {
          const a = placed.get(proposal.a)
          const b = placed.get(proposal.b)
          return a && b ? (
            <Proposed
              key={`${proposal.rowId}:${proposal.a}:${proposal.b}`}
              a={a}
              b={b}
              source={proposal.source}
              onAccept={(event) => accept(event, proposal)}
            />
          ) : null
        })}
        <Legend
          at={{
            x: shown.minX + LEGEND_PX.inset * perPixel,
            y: shown.minY + shown.height - (LEGEND_PX.height + LEGEND_PX.inset) * perPixel,
          }}
          perPixel={perPixel}
        />
      </svg>
      {spoken.length > 0 && (
        <ul className="proposals">
          {spoken.map((proposal) => (
            <li key={`${proposal.rowId}:${proposal.a}:${proposal.b}`}>
              <span>
                {named.get(roomOf(proposal))?.name ?? roomOf(proposal)}: {proposal.source}
              </span>
              <button type="button" onClick={(event) => accept(event, proposal)}>
                Accept
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
