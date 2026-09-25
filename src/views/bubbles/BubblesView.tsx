import { useMemo, useState } from 'react'
import { arrange } from '../../bubbles/arrange'
import type { EdgeKind } from '../../model'
import { storeyLabel } from '../../rulebook'
import { Diagram } from './Diagram'
import { Legend } from './parts'
import { STAIR_STAYS, type BubbleLink, type BubblesViewProps } from './types'
import './bubbles.css'

export function BubblesView(props: BubblesViewProps) {
  const { rooms, edges, storeys, selected, hallwayWanted } = props
  const [focus, setFocus] = useState<number | null>(null)
  const levels = Math.max(1, Math.trunc(storeys))
  const arrangement = useMemo(() => arrange(rooms, edges, levels), [rooms, edges, levels])
  const named = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const selectedRoom = named.get(selected ?? '')
  const selectedEdge = edges.find((edge) => edge.id === selected)

  /** The next floor up, and the ground again from the top: one button walks a room through the storeys. */
  const nextStorey = selectedRoom ? (selectedRoom.storey + 1) % levels : 0

  function sendUp(): void {
    if (!selectedRoom) return
    if (Math.max(1, Math.trunc(selectedRoom.storeysSpanned)) > 1) {
      props.onRefuse(STAIR_STAYS)
      return
    }
    props.onSetStorey(selectedRoom.id, nextStorey)
  }

  function removeSelected(): void {
    if (selectedEdge) props.onDisconnect(selectedEdge.id)
    else if (selectedRoom) props.onRemoveRoom(selectedRoom.id)
  }

  const titleOf = (edge: BubbleLink): string => {
    const name = (id: string) => named.get(id)?.name ?? 'Outside'
    return `${name(edge.a)} and ${name(edge.b)}: ${edge.kind}`
  }

  const otherKind: EdgeKind = selectedEdge?.kind === 'open' ? 'door' : 'open'

  return (
    <div
      className="bubbles"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return
        if (event.target instanceof HTMLInputElement) return
        if (!selectedRoom && !selectedEdge) return
        event.preventDefault()
        removeSelected()
      }}
    >
      <div className="bubbles-bar">
        <button type="button" aria-pressed={focus === null} onClick={() => setFocus(null)}>
          All storeys
        </button>
        <button
          type="button"
          className="bubbles-wide"
          disabled={!selectedRoom || levels < 2}
          onClick={sendUp}
        >
          {selectedRoom && levels > 1 ? `To ${storeyLabel(nextStorey)}` : 'To another storey'}
        </button>
        <button
          type="button"
          className="bubbles-wide"
          disabled={!selectedRoom && !selectedEdge}
          onClick={removeSelected}
        >
          {selectedEdge ? 'Delete link' : selectedRoom ? 'Delete room' : 'Delete'}
        </button>
        {selectedEdge && (
          <span className="bubbles-kind">
            <span>Link: {selectedEdge.kind}</span>
            <button
              type="button"
              disabled={selectedEdge.kind === 'main-door'}
              onClick={() => props.onSetEdgeKind(selectedEdge.id, otherKind)}
            >
              {otherKind === 'open' ? 'Make it open' : 'Make it a door'}
            </button>
          </span>
        )}
      </div>
      <p className="bubbles-hint">
        Drag the small ring on a room to another room to connect them. Drag a room to nudge it; the
        nudge is for reading and means nothing for the plan. Click a storey&rsquo;s name to bring it
        forward.
      </p>
      {hallwayWanted.map((entry) => (
        <p className="bubbles-nudge" key={entry.storey}>
          <span>{entry.sentence}</span>
          <button
            type="button"
            aria-label={`Add hallway on ${storeyLabel(entry.storey)}`}
            onClick={() => props.onAddHallway(entry.storey)}
          >
            Add hallway
          </button>
        </p>
      ))}
      <div className="bubbles-body">
        <Diagram
          arrangement={arrangement}
          rooms={named}
          edges={edges}
          selected={selected}
          focus={focus}
          titleOf={titleOf}
          onFocus={(storey) => setFocus((was) => (was === storey ? null : storey))}
          onNudge={props.onNudge}
          onConnect={props.onConnect}
          onSelect={props.onSelect}
          onRefuse={props.onRefuse}
        />
        <div className="bubbles-side">
          <Legend />
        </div>
      </div>
    </div>
  )
}
