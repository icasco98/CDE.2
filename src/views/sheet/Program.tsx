/**
 * The program: one block per zone, in the order of importance. A hollow block is still to place and
 * drags onto the sheet or is drawn; a filled one selects the zone it stands for. The grip reorders.
 */

import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  KINDS,
  KIND_LABEL,
  STOREY_MARK,
  acrossStoreys,
  areaOf,
  fmt,
  r2,
  storeyOf,
  type Zone,
  type Sheet,
} from '../../sheet'
import { rangeFor, typicalArea } from '../../rulebook'
import { reorderSide, type Shape } from './gestures'
import { typeFor } from './project'

type ProgramProps = {
  sheet: Sheet
  selection: string[]
  /** The zones in the list Check draws a line to, outlined while the line shows. */
  connected: ReadonlySet<string>
  /** The zone a shape is being drawn for, so its Draw button reads as in hand. */
  drawingId: string | null
  drawMenuFor: string | null
  onNewDown: (zone: Zone, event: ReactPointerEvent) => void
  onPick: (zone: Zone) => void
  /** In the Openings step the column is a zone list: a click lights that zone's edges. */
  openings: boolean
  lit: string | null
  onLight: (zone: Zone) => void
  onRemove: (zone: Zone) => void
  onReorder: (id: string, before: string | null) => void
  onDrawMenu: (id: string | null) => void
  onDraw: (id: string, shape: Shape) => void
  onAdd: (kind: string, name: string, area: number) => void
}

const shapes: [Shape, string, string][] = [
  ['rect', 'A rectangle', 'drag corner to corner'],
  ['circle', 'A circle', 'drag from the centre'],
  ['poly', 'A polygon', 'click the corners'],
]

export function Program(props: ProgramProps) {
  const { sheet } = props
  const list = sheet.zones
  const unplaced = list.filter((r) => !r.placed)
  const upstairs = list.some((r) => r.placed && storeyOf(r) > 0)

  const beginReorder = (zone: Zone, event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const move = (moving: PointerEvent) => {
      const under = document.elementFromPoint(moving.clientX, moving.clientY)
      const item = under?.closest('.tray .item')
      const overId = item instanceof HTMLElement ? item.dataset.zone : undefined
      if (!overId || overId === zone.id) return
      const box = item!.getBoundingClientRect()
      const order = sheet.zones.map((r) => r.id).filter((id) => id !== zone.id)
      const at = order.indexOf(overId)
      const side = reorderSide(moving.clientY, box)
      const before = side === 'after' ? (order[at + 1] ?? null) : overId
      props.onReorder(zone.id, before)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  }

  return (
    <aside>
      <h2>
        <span>Program</span>
        <span className="mono">{unplaced.length ? `${unplaced.length} left` : 'all placed'}</span>
      </h2>
      <div className="tray">
        {list.map((zone) => {
          const drawing = props.drawingId === zone.id
          return (
            <div
              key={zone.id}
              className={`item ${zone.cat} ${zone.placed ? 'placed' : 'hollow'}${
                zone.placed &&
                (props.openings ? props.lit === zone.id : props.selection.includes(zone.id))
                  ? ' selected'
                  : ''
              }${zone.group ? ' grouped' : ''}${props.connected.has(zone.id) ? ' check-connected' : ''}`}
              data-zone={zone.id}
              style={{ flex: `${zone.target} 1 0`, background: zone.color ?? undefined }}
              title={
                props.openings
                  ? `${zone.name}: click to light its edges`
                  : `${zone.name} · ${fmt(zone.target)} m² · ${fmt(zone.w)} × ${fmt(zone.h)} m${
                      zone.placed ? ': click to select it' : ': drag it onto the sheet, or Draw it'
                    }`
              }
              onPointerDown={(event) => {
                if (event.target instanceof Element && event.target.closest('button')) return
                if (zone.placed || props.openings) return
                props.onNewDown(zone, event)
              }}
              onClick={() => {
                if (!zone.placed) return
                if (props.openings) props.onLight(zone)
                else props.onPick(zone)
              }}
            >
              <span
                className="grip"
                title="Drag to reorder: higher in the list is more important and never gives way to a zone below it"
                onPointerDown={(event) => beginReorder(zone, event)}
              >
                ⋮
              </span>
              {zone.placed && <i className="swatch" />}
              <div className="n">
                {zone.name}
                {zone.placed && (storeyOf(zone) > 0 || upstairs) && (
                  <span className="st">
                    {' '}
                    {acrossStoreys(zone, sheet.settings) ? 'all' : STOREY_MARK[storeyOf(zone)]}
                  </span>
                )}
              </div>
              <div className="a mono">
                {zone.placed
                  ? `${fmt(r2(areaOf(zone)))} of ${fmt(zone.target)}`
                  : `${fmt(zone.target)} m²`}
              </div>
              {!zone.placed && (
                <div className="ways">
                  <button
                    type="button"
                    className={drawing || props.drawMenuFor === zone.id ? 'on' : ''}
                    title="Draw this zone on the sheet instead of dropping it"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => props.onDrawMenu(props.drawMenuFor === zone.id ? null : zone.id)}
                  >
                    {drawing ? 'Drawing…' : 'Draw ▾'}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="x"
                title={`Remove ${zone.name} from the program`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => props.onRemove(zone)}
              >
                ×
              </button>
              {props.drawMenuFor === zone.id && (
                <div className="ctx" style={{ left: 0, top: '100%' }}>
                  <div className="head">Draw {zone.name} as</div>
                  {shapes.map(([shape, label, how]) => (
                    <button key={shape} type="button" onClick={() => props.onDraw(zone.id, shape)}>
                      {label}
                      <span className="m">{how}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <AddZone onAdd={props.onAdd} plotArea={sheet.plot.w * sheet.plot.h} />
    </aside>
  )
}

/**
 * A zone added to the program: its kind, a name of its own, and a size the zone-type table gives
 * that kind on a plot of this size, so the Sheet asks for what Requirements would have asked for.
 */
function AddZone({ onAdd, plotArea }: { onAdd: ProgramProps['onAdd']; plotArea: number }) {
  const kinds = Object.keys(KIND_LABEL).filter((kind) => kind in KINDS)
  const [kind, setKind] = useState(kinds[0] ?? 'zone')
  const [name, setName] = useState('')
  const [size, setSize] = useState('medium')
  const [area, setArea] = useState('12')
  const type = typeFor(kind)
  const middle = typicalArea(type, plotArea)
  // A kind the table gives no range — a hallway, whose length is as needed — has only its typical.
  const band = rangeFor(type, plotArea)
  const target =
    size === 'custom'
      ? Number(area)
      : size === 'big'
        ? (band?.max ?? middle)
        : size === 'small'
          ? (band?.min ?? middle)
          : r2(middle)
  return (
    <div className="add-zone">
      <label>
        <span className="mono" hidden>
          Kind
        </span>
        <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {kinds.map((key) => (
            <option key={key} value={key}>
              {KIND_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <div className="add-line">
        <input
          type="text"
          aria-label="Name"
          placeholder="Name"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select aria-label="Size" value={size} onChange={(event) => setSize(event.target.value)}>
          <option value="big">big</option>
          <option value="medium">medium</option>
          <option value="small">small</option>
          <option value="custom">m²…</option>
        </select>
        {size === 'custom' && (
          <input
            type="number"
            aria-label="Area in m²"
            min={1}
            step={0.5}
            value={area}
            onChange={(event) => setArea(event.target.value)}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          onAdd(kind, name, target)
          setName('')
        }}
      >
        + Add to the program
      </button>
    </div>
  )
}
