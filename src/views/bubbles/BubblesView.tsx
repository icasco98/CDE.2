import { useEffect, useMemo, useState } from 'react'
import { arrange } from '../../bubbles/arrange'
import { storeyLabel } from '../../rulebook'
import { fitCamera, type Camera } from '../camera'
import { useOnScreen } from '../onScreen'
import { ApartPanel } from './ApartPanel'
import { ChecksPanel } from './ChecksPanel'
import { Diagram } from './Diagram'
import { ConnectionPanel } from './ConnectionPanel'
import { Matrix } from './Matrix'
import { Legend } from './parts'
import { STAIR_STAYS, type BubbleConnection, type BubblesViewProps, type DragMakes } from './types'
import './bubbles.css'

export function BubblesView(props: BubblesViewProps) {
  const { zones, connections, apart, storeys, selected, hallwayWanted } = props
  const [focus, setFocus] = useState<number | null>(null)
  const [makes, setMakes] = useState<DragMakes>('connect')
  const [matrix, setMatrix] = useState(false)
  const [camera, setCamera] = useState<Camera>(fitCamera)
  const levels = Math.max(1, Math.trunc(storeys))
  const arrangement = useMemo(
    () => arrange(zones, connections, levels),
    [zones, connections, levels],
  )
  const [pixels, setPixels] = useState(1)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const menuBox = useOnScreen<HTMLDivElement>()
  const named = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones])
  const selectedZone = named.get(selected ?? '')
  const selectedConnection = connections.find((connection) => connection.id === selected)
  const selectedPair = apart.find((pair) => pair.id === selected)

  /** The next floor up, and the ground again from the top: one button walks a zone through the storeys. */
  const nextStorey = selectedZone ? (selectedZone.storey + 1) % levels : 0

  function sendUp(): void {
    if (!selectedZone) return
    if (Math.max(1, Math.trunc(selectedZone.storeysSpanned)) > 1) {
      props.onRefuse(STAIR_STAYS)
      return
    }
    props.onSetStorey(selectedZone.id, nextStorey)
  }

  function removeSelected(): void {
    if (selectedConnection) props.onDisconnect(selectedConnection.id)
    else if (selectedPair) props.onAllowTogether(selectedPair.id)
    else if (selectedZone) props.onRemoveZone(selectedZone.id)
  }

  // The menu goes on any click or key elsewhere, as a right-click menu does.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  const declinedOf = (id: string): number =>
    props.declined.filter((pair) => pair.a === id || pair.b === id).length

  const nameOf = (id: string): string => named.get(id)?.name ?? 'Outside'
  const titleOf = (connection: BubbleConnection): string =>
    `${nameOf(connection.a)} ↔ ${nameOf(connection.b)}, ${connection.kind}. ${connection.source ?? 'Added by hand.'}`

  return (
    <div
      className="bubbles"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (matrix || (event.key !== 'Delete' && event.key !== 'Backspace')) return
        if (event.target instanceof HTMLInputElement) return
        if (!selectedZone && !selectedConnection && !selectedPair) return
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
        <button
          type="button"
          disabled={props.declined.length === 0}
          title="Make again every connection the rulebook suggested and you deleted"
          onClick={() => props.onRestore()}
        >
          Restore suggested connections
        </button>
        <button type="button" title="Show the whole diagram" onClick={() => setCamera(fitCamera)}>
          Fit
        </button>
        <button
          type="button"
          className="bubbles-wide"
          disabled={!selectedZone || levels < 2}
          onClick={sendUp}
        >
          {selectedZone && levels > 1 ? `To ${storeyLabel(nextStorey)}` : 'To another storey'}
        </button>
        <button
          type="button"
          className="bubbles-wide"
          disabled={!selectedZone}
          onClick={() => selectedZone && props.onRemoveZone(selectedZone.id)}
        >
          Delete zone
        </button>
      </div>
      <p className="bubbles-hint">
        {makes === 'apart'
          ? 'Drag the small ring on a zone to another zone, on any storey, to keep the two apart; click the red line to let them together.'
          : 'Drag the small ring on a zone to another zone, or to Outside, to connect them; click a connection to change its kind or delete it.'}{' '}
        Drag a zone to nudge it; the nudge is for reading and means nothing for the plan. Click a
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
          zones={named}
          connections={connections}
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
          onZoneMenu={(id, at) => setMenu({ id, ...at })}
          onPixels={setPixels}
          camera={camera}
          onCamera={setCamera}
        />
        <div className="bubbles-side">
          {selectedConnection && (
            <ConnectionPanel
              connection={selectedConnection}
              nameOf={nameOf}
              onSetKind={(kind) => props.onSetConnectionKind(selectedConnection.id, kind)}
              onDelete={() => props.onDisconnect(selectedConnection.id)}
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
      {menu && (
        <div
          ref={menuBox}
          className="bubbles-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={declinedOf(menu.id) === 0}
            onClick={() => {
              props.onRestore(menu.id)
              setMenu(null)
            }}
          >
            Restore suggested connections for this zone
          </button>
          {declinedOf(menu.id) === 0 && (
            <p>No suggested connection of {nameOf(menu.id)} was deleted.</p>
          )}
        </div>
      )}
      {matrix && (
        <Matrix
          zones={zones}
          connections={connections}
          apart={apart}
          onSet={props.onSetPair}
          onClose={() => setMatrix(false)}
        />
      )}
    </div>
  )
}
