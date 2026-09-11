import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  capacityMessage,
  createState,
  storeyCapacity,
  type Body,
  type Position,
} from '../../bubbles'
import { bodyAt, extentOf, pointerAt, viewBoxOf } from './frame'
import { Bands, Bubble, Link, Proposed } from './parts'
import { useSettling } from './useSettling'
import type { BubbleProposal, BubblesViewProps } from './types'
import './bubbles.css'

type Gesture =
  | { readonly kind: 'move'; readonly id: string; readonly grabbed: Position }
  | { readonly kind: 'link'; readonly from: string; readonly at: Position }
  | null

export function BubblesView(props: BubblesViewProps) {
  const { rooms, edges, proposals, storeys, plot, selected } = props
  const { onMoveBubble, onPin, onConnect, onDisconnect, onAccept, onAcceptAll, onSelect } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const [gesture, setGesture] = useState<Gesture>(null)
  const [aspect, setAspect] = useState(0)
  const { settling, start, stop, interrupt } = useSettling(rooms, edges, storeys, onMoveBubble)

  const state = useMemo(() => createState(rooms, edges, storeys), [rooms, edges, storeys])
  const bodies = state.bodies
  const named = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const placed = useMemo(() => new Map(bodies.map((body) => [body.id, body])), [bodies])
  const extent = extentOf(bodies, state.storeys, state.bandHeight, aspect)
  const crowded = storeyCapacity(rooms, plot.polygon, storeys).filter((entry) => entry.over)
  const selectedRoom = named.get(selected ?? '')

  useEffect(() => {
    const sheet = svgRef.current
    if (!sheet) return
    const watch = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box && box.height > 0) setAspect(box.width / box.height)
    })
    watch.observe(sheet)
    return () => watch.disconnect()
  }, [])

  const at = useCallback((event: ReactPointerEvent): Position => {
    const svg = svgRef.current
    return svg ? pointerAt(svg, event.clientX, event.clientY) : { x: 0, y: 0 }
  }, [])

  function grab(event: ReactPointerEvent, body: Body) {
    event.stopPropagation()
    interrupt()
    svgRef.current?.focus()
    onSelect(body.id)
    if (!body.pinned) onPin(body.id, true)
    const pointer = at(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({
      kind: 'move',
      id: body.id,
      grabbed: { x: body.x - pointer.x, y: body.y - pointer.y },
    })
  }

  function drag(event: ReactPointerEvent) {
    if (!gesture) return
    const pointer = at(event)
    if (gesture.kind === 'move')
      onMoveBubble(
        gesture.id,
        { x: pointer.x + gesture.grabbed.x, y: pointer.y + gesture.grabbed.y },
        'preview',
      )
    else setGesture({ ...gesture, at: pointer })
  }

  function release(event: ReactPointerEvent) {
    if (!gesture) return
    const pointer = at(event)
    if (gesture.kind === 'move')
      onMoveBubble(
        gesture.id,
        { x: pointer.x + gesture.grabbed.x, y: pointer.y + gesture.grabbed.y },
        'commit',
      )
    else {
      const target = bodyAt(bodies, pointer, gesture.from)
      if (target) onConnect(gesture.from, target.id)
    }
    setGesture(null)
  }

  function reach(event: ReactPointerEvent, body: Body) {
    event.stopPropagation()
    interrupt()
    svgRef.current?.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    setGesture({ kind: 'link', from: body.id, at: at(event) })
  }

  const handlers = { onGrab: grab, onReach: reach, onDrag: drag, onRelease: release }

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
          disabled={!selectedRoom}
          onClick={() => selectedRoom && onPin(selectedRoom.id, !selectedRoom.pinned)}
        >
          {selectedRoom?.pinned ? 'Let go' : 'Hold in place'}
        </button>
        <p className="bubbles-status" role="status">
          {settling === 'running'
            ? 'Settling…'
            : settling === 'settled'
              ? 'Settled'
              : 'Not settled'}
        </p>
      </div>
      {crowded.map((entry) => (
        <p className="bubbles-warning" key={entry.storey}>
          {capacityMessage(entry)}
        </p>
      ))}
      <svg
        ref={svgRef}
        className="bubbles-sheet"
        viewBox={viewBoxOf(extent)}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="application"
        aria-label="Bubble diagram"
        onPointerDown={() => onSelect(null)}
        onPointerMove={drag}
        onPointerUp={release}
        onKeyDown={(event) => {
          if (event.key !== 'Delete' && event.key !== 'Backspace') return
          if (selected && edges.some((edge) => edge.id === selected)) {
            event.preventDefault()
            onDisconnect(selected)
          }
        }}
      >
        <Bands storeys={state.storeys} bandHeight={state.bandHeight} extent={extent} />
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
              selected={edge.id === selected}
              onSelect={(event) => {
                event.stopPropagation()
                interrupt()
                svgRef.current?.focus()
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
              selected={body.id === selected}
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
