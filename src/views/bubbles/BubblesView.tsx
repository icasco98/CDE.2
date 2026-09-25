import { useMemo, useState } from 'react'
import { arrange } from '../../bubbles/arrange'
import { storeyLabel } from '../../rulebook'
import { fitCamera, type Camera } from '../camera'
import { ApartPanel } from './ApartPanel'
import { ChecksPanel } from './ChecksPanel'
import { Diagram } from './Diagram'
import { EdgePanel } from './EdgePanel'
import { Matrix } from './Matrix'
import { Legend } from './parts'
import { STAIR_STAYS, type BubbleLink, type BubblesViewProps, type DragMakes } from './types'
import './bubbles.css'

export function BubblesView(props: BubblesViewProps) {
  const { rooms, edges, apart, storeys, selected, hallwayWanted } = props
  const [focus, setFocus] = useState<number | null>(null)
  const [makes, setMakes] = useState<DragMakes>('connect')
  const [matrix, setMatrix] = useState(false)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const levels = Math.max(1, Math.trunc(storeys))
  const arrangement = useMemo(() => arrange(rooms, edges, levels), [rooms, edges, levels])
  const [pixels, setPixels] = useState(1)
  const named = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const selectedRoom = named.get(selected ?? '')
  const selectedEdge = edges.find((edge) => edge.id === selected)
  const selectedPair = apart.find((pair) => pair.id === selected)

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
    else if (selectedPair) props.onAllowTogether(selectedPair.id)
    else if (selectedRoom) props.onRemoveRoom(selectedRoom.id)
  }

  const nameOf = (id: string): string => named.get(id)?.name ?? 'Outside'
  const titleOf = (edge: BubbleLink): string =>
    `${nameOf(edge.a)} ↔ ${nameOf(edge.b)}, ${edge.kind}. ${edge.source ?? 'Added by hand.'}`

  return (
    <div
      className="bubbles"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (matrix || (event.key !== 'Delete' && event.key !== 'Backspace')) return
        if (event.target instanceof HTMLInputElement) return
        if (!selectedRoom && !selectedEdge && !selectedPair) return
        event.preventDefault()
        removeSelected()
      }}
    >
      <div className="bubbles-bar">
        <button type="button" aria-pressed={focus === null} onClick={() => setFocus(null)}>
          All storeys
        </button>
        <span className="bubbles-makes" role="group" aria-label="A drag makes">
          <span>A drag makes</span>
          <button
            type="button"
            aria-pressed={makes === 'connect'}
            onClick={() => setMakes('connect')}
          >
            Connection
          </button>
          <button type="button" aria-pressed={makes === 'apart'} onClick={() => setMakes('apart')}>
            Keep apart
          </button>
        </span>
        <button type="button" onClick={() => setMatrix(true)}>
          Matrix
        </button>
        <button type="button" title="Show the whole diagram" onClick={() => setCamera(fitCamera)}>
          Fit
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
          disabled={!selectedRoom}
          onClick={() => selectedRoom && props.onRemoveRoom(selectedRoom.id)}
        >
          Delete room
        </button>
      </div>
      <p className="bubbles-hint">
        {makes === 'apart'
          ? 'Drag the small ring on a room to another room, on any storey, to keep the two apart; click the red line to let them together.'
          : 'Drag the small ring on a room to another room, or to Outside, to connect them; click a connection to change its kind or delete it.'}{' '}
        Drag a room to nudge it; the nudge is for reading and means nothing for the plan. Click a
        storey&rsquo;s name to bring it forward. Wheel to zoom, drag the background to pan.
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
          apart={apart}
          makes={makes}
          selected={selected}
          focus={focus}
          titleOf={titleOf}
          onFocus={(storey) => setFocus((was) => (was === storey ? null : storey))}
          onNudge={props.onNudge}
          onConnect={props.onConnect}
          onKeepApart={props.onKeepApart}
          onSelect={props.onSelect}
          onRefuse={props.onRefuse}
          onPixels={setPixels}
          camera={camera}
          onCamera={setCamera}
        />
        <div className="bubbles-side">
          {selectedEdge && (
            <EdgePanel
              edge={selectedEdge}
              nameOf={nameOf}
              onSetKind={(kind) => props.onSetEdgeKind(selectedEdge.id, kind)}
              onDelete={() => props.onDisconnect(selectedEdge.id)}
            />
          )}
          {selectedPair && (
            <ApartPanel
              pair={selectedPair}
              nameOf={nameOf}
              onAllow={() => props.onAllowTogether(selectedPair.id)}
            />
          )}
          <ChecksPanel checks={props.checks} onPick={props.onSelect} />
          <Legend scale={arrangement.scale} pixels={pixels} />
        </div>
      </div>
      {matrix && (
        <Matrix
          rooms={rooms}
          edges={edges}
          apart={apart}
          onSet={props.onSetPair}
          onClose={() => setMatrix(false)}
        />
      )}
    </div>
  )
}
